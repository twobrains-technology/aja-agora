import {
	CreateBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Storage S3-compatível (MinIO local / S3 prod). Interface fina por cima do
// AWS SDK — config por env (ADR bloco-mesa-a, Decisão 2). S3_ENDPOINT vazio =
// AWS real (prod); presente = MinIO/compatível (exige forcePathStyle).

export interface StorageConfig {
	endpoint?: string;
	region: string;
	bucket: string;
	// Indefinidos em AWS real sem chaves no env → o SDK usa a cadeia de
	// credenciais padrão (task role do ECS). Só o MinIO local recebe default.
	accessKeyId?: string;
	secretAccessKey?: string;
	forcePathStyle: boolean;
	// SSE-KMS (FIX-82, bucket de documentos de cliente): quando setado, put usa
	// aws:kms com esta key. MinIO local não tem KMS — dev fica sem (undefined).
	kmsKeyId?: string;
}

export function getStorageConfig(
	env: Record<string, string | undefined> = process.env,
): StorageConfig {
	const endpoint = env.S3_ENDPOINT && env.S3_ENDPOINT.trim() !== "" ? env.S3_ENDPOINT : undefined;
	const forcePathStyle = env.S3_FORCE_PATH_STYLE
		? env.S3_FORCE_PATH_STYLE === "true"
		: Boolean(endpoint); // MinIO precisa de path-style; AWS real usa virtual-hosted
	// Default minioadmin SÓ pro MinIO local (endpoint setado). Em AWS real
	// (sem endpoint) sem chaves, deixa indefinido pra cair na task role — forçar
	// `minioadmin` aqui causava InvalidAccessKeyId → 500 no upload (bug dev AWS).
	const accessKeyId = env.S3_ACCESS_KEY_ID || (endpoint ? "minioadmin" : undefined);
	const secretAccessKey = env.S3_SECRET_ACCESS_KEY || (endpoint ? "minioadmin" : undefined);
	return {
		endpoint,
		region: env.S3_REGION || "us-east-1",
		bucket: env.S3_BUCKET || "aja-administradora-docs",
		accessKeyId,
		secretAccessKey,
		forcePathStyle,
	};
}

// FIX-82: bucket DEDICADO de documentos de cliente (PII de identidade) — nunca
// o de administradora-docs. Reusa endpoint/region/credenciais (mesmo S3/MinIO),
// só o bucket + a KMS key mudam. Bucket+KMS de PROD são provisionamento IaC
// (PENDENTE-KAIRO); em dev/MinIO local `kmsKeyId` fica indefinido (MinIO não
// tem KMS configurado) — putObject cai pro upload sem SSE explícito.
export function getClientDocsStorageConfig(
	env: Record<string, string | undefined> = process.env,
): StorageConfig {
	const base = getStorageConfig(env);
	return {
		...base,
		bucket: env.S3_CLIENT_DOCS_BUCKET || "aja-client-docs",
		kmsKeyId: env.S3_CLIENT_DOCS_KMS_KEY_ID || undefined,
	};
}

let cachedClient: S3Client | null = null;

function getClient(cfg: StorageConfig): S3Client {
	if (cachedClient) return cachedClient;
	cachedClient = new S3Client({
		region: cfg.region,
		endpoint: cfg.endpoint,
		forcePathStyle: cfg.forcePathStyle,
		// Sem chaves (AWS real) → omite `credentials` pra o SDK resolver via cadeia
		// padrão (task role do ECS). Com chaves (MinIO/keys explícitas) → usa elas.
		credentials:
			cfg.accessKeyId && cfg.secretAccessKey
				? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
				: undefined,
	});
	return cachedClient;
}

/** Garante que o bucket existe (cria on-demand). Idempotente. */
export async function ensureBucket(cfg: StorageConfig = getStorageConfig()): Promise<void> {
	const client = getClient(cfg);
	try {
		await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
	} catch {
		try {
			await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
		} catch (err) {
			// Corrida (outro request criou o bucket entre o Head e o Create) é
			// benigna: o S3 responde BucketAlreadyOwnedByYou/BucketAlreadyExists. A
			// função é idempotente, então tratamos isso como sucesso e só re-lançamos
			// erros reais (ex.: AccessDenied, credencial inválida).
			const name = err instanceof Error ? err.name : "";
			if (name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists") {
				return;
			}
			console.error(
				"[storage] falha ao criar bucket:",
				err instanceof Error ? err.message : String(err),
			);
			throw err;
		}
	}
}

/** Sobe um objeto. Cria o bucket se preciso. SSE-KMS quando `cfg.kmsKeyId` setado. */
export async function putObject(
	key: string,
	body: Uint8Array,
	contentType: string,
	cfg: StorageConfig = getStorageConfig(),
): Promise<void> {
	await ensureBucket(cfg);
	await getClient(cfg).send(
		new PutObjectCommand({
			Bucket: cfg.bucket,
			Key: key,
			Body: body,
			ContentType: contentType,
			...(cfg.kmsKeyId
				? { ServerSideEncryption: "aws:kms" as const, SSEKMSKeyId: cfg.kmsKeyId }
				: {}),
		}),
	);
}

/** Existe o objeto? (HEAD). Usado antes de assinar URL de download pra não
 * devolver link que estoura 404 (ex.: geração best-effort que falhou). */
export async function objectExists(
	key: string,
	cfg: StorageConfig = getStorageConfig(),
): Promise<boolean> {
	try {
		await getClient(cfg).send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
		return true;
	} catch {
		return false;
	}
}

/** Lê um objeto inteiro em memória. */
export async function getObject(
	key: string,
	cfg: StorageConfig = getStorageConfig(),
): Promise<Uint8Array> {
	const res = await getClient(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
	const bytes = await res.Body?.transformToByteArray();
	if (!bytes) throw new Error(`Objeto vazio ou inexistente: ${key}`);
	return bytes;
}

/** Remove um objeto. Best-effort (chamador decide como tratar falha). */
export async function deleteObject(
	key: string,
	cfg: StorageConfig = getStorageConfig(),
): Promise<void> {
	await getClient(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

const DEFAULT_DOWNLOAD_EXPIRES_SECONDS = 300; // 5 min — regra dura de PII (FIX-83)

/** URL pré-assinada de curta expiração pra download (nunca expõe key/bucket
 * direto — só a URL temporária). Usado pelo endpoint admin de download. */
export async function getSignedDownloadUrl(
	key: string,
	cfg: StorageConfig = getStorageConfig(),
	expiresInSeconds: number = DEFAULT_DOWNLOAD_EXPIRES_SECONDS,
): Promise<string> {
	const command = new GetObjectCommand({ Bucket: cfg.bucket, Key: key });
	return getSignedUrl(getClient(cfg), command, { expiresIn: expiresInSeconds });
}
