import {
	CreateBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

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
export async function ensureBucket(): Promise<void> {
	const cfg = getStorageConfig();
	const client = getClient(cfg);
	try {
		await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
	} catch {
		try {
			await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
		} catch (err) {
			// corrida (outro request criou) é benigna — só re-lança se ainda não existe
			console.error(
				"[storage] falha ao criar bucket:",
				err instanceof Error ? err.message : String(err),
			);
			throw err;
		}
	}
}

/** Sobe um objeto. Cria o bucket se preciso. */
export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
	const cfg = getStorageConfig();
	await ensureBucket();
	await getClient(cfg).send(
		new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }),
	);
}

/** Lê um objeto inteiro em memória. */
export async function getObject(key: string): Promise<Uint8Array> {
	const cfg = getStorageConfig();
	const res = await getClient(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
	const bytes = await res.Body?.transformToByteArray();
	if (!bytes) throw new Error(`Objeto vazio ou inexistente: ${key}`);
	return bytes;
}

/** Remove um objeto. Best-effort (chamador decide como tratar falha). */
export async function deleteObject(key: string): Promise<void> {
	const cfg = getStorageConfig();
	await getClient(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}
