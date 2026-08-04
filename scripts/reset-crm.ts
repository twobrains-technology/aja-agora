// scripts/reset-crm.ts — MARCO ZERO do CRM.
//
// Apaga o rastro de operação (conversas, leads, contatos, propostas,
// documentos, memória do agente, visitas) e PRESERVA a configuração que faz o
// vendedor existir (logins, personas, administradoras, atendentes, templates
// aprovados na Meta). A classificação está em `src/lib/crm/reset-tables.ts` e
// é conferida por teste — nenhuma tabela fica sem decisão.
//
//   pnpm crm:reset                          # banco local, pergunta antes
//   pnpm crm:reset --env=prod               # remoto, exige confirmar o nome do banco
//   pnpm crm:reset --env=prod --confirm=aja_agora   # sem TTY (automação)
//   pnpm crm:reset --keep-s3 --keep-memory  # não toca no S3 / na memória do agente
//
// Três coisas que ele faz além do SQL, senão o reset é meia-boca:
//   1. dump antes (obrigatório contra banco remoto);
//   2. apaga os objetos no S3 — deixar RG e comprovante órfãos no bucket depois
//      de apagar o índice é o pior dos dois mundos: some do sistema e continua
//      exposto;
//   3. purga a memória do agente — senão cliente antigo volta e ele "lembra"
//      de uma conversa que o CRM não tem mais.

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { clientDocuments, memoryIdentities } from "@/db/schema";
import { TABELAS_LIMPAS, TABELAS_PRESERVADAS } from "@/lib/crm/reset-tables";
import { getMemoryAdapter } from "@/lib/memory";
import type { IdentityKind } from "@/lib/memory/types";
import { deleteObject, getClientDocsStorageConfig } from "@/lib/storage";

const LOG = "[reset-crm]";

// Hosts que são a máquina do dev (OrbStack, docker, localhost). Qualquer outra
// coisa é remota e entra no caminho rigoroso.
const HOSTS_LOCAIS = /^(localhost|127\.0\.0\.1|::1|host\.docker\.internal|.*\.orb\.local)$/;

interface Opcoes {
	env: string | null;
	confirm: string | null;
	keepS3: boolean;
	keepMemory: boolean;
	skipDump: boolean;
}

function lerOpcoes(argv: string[]): Opcoes {
	const valor = (nome: string) =>
		argv
			.find((a) => a.startsWith(`--${nome}=`))
			?.split("=")
			.slice(1)
			.join("=") ?? null;

	return {
		env: valor("env"),
		confirm: valor("confirm"),
		keepS3: argv.includes("--keep-s3"),
		keepMemory: argv.includes("--keep-memory"),
		skipDump: argv.includes("--skip-dump"),
	};
}

function alvoDoBanco(databaseUrl: string): { host: string; database: string; ehLocal: boolean } {
	const url = new URL(databaseUrl);
	const host = url.hostname;
	return {
		host,
		database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "(sem nome)",
		ehLocal: HOSTS_LOCAIS.test(host),
	};
}

async function perguntar(pergunta: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		return (await rl.question(pergunta)).trim();
	} finally {
		rl.close();
	}
}

/**
 * Porta de entrada do estrago. Contra banco remoto exige o nome do banco
 * digitado por extenso — `--yes` genérico é fácil demais de repetir do
 * histórico do shell contra o ambiente errado.
 */
async function confirmar(alvo: ReturnType<typeof alvoDoBanco>, opcoes: Opcoes): Promise<void> {
	if (!alvo.ehLocal && !opcoes.env) {
		throw new Error(
			`banco REMOTO (${alvo.host}) sem --env. Declare o ambiente de propósito: --env=prod`,
		);
	}

	const rotulo = alvo.ehLocal ? "LOCAL" : (opcoes.env ?? "REMOTO").toUpperCase();
	console.log(`${LOG} alvo: ${rotulo} · host ${alvo.host} · banco ${alvo.database}`);
	console.log(
		`${LOG} apaga ${TABELAS_LIMPAS.length} tabelas, preserva ${TABELAS_PRESERVADAS.length}`,
	);

	if (opcoes.confirm !== null) {
		if (opcoes.confirm !== alvo.database) {
			throw new Error(`--confirm="${opcoes.confirm}" não bate com o banco "${alvo.database}"`);
		}
		return;
	}

	if (!process.stdin.isTTY) {
		throw new Error(`sem terminal interativo — passe --confirm=${alvo.database}`);
	}

	if (alvo.ehLocal) {
		const resposta = await perguntar(`${LOG} zerar o CRM local? [s/N] `);
		if (!/^s(im)?$/i.test(resposta)) throw new Error("cancelado");
		return;
	}

	const digitado = await perguntar(
		`${LOG} digite o nome do banco para confirmar (${alvo.database}): `,
	);
	if (digitado !== alvo.database) throw new Error("nome do banco não confere — cancelado");
}

/** Dump completo antes de qualquer escrita. Contra banco remoto é obrigatório. */
function dump(databaseUrl: string, alvo: ReturnType<typeof alvoDoBanco>, opcoes: Opcoes): void {
	const destino = join(
		homedir(),
		"Downloads",
		`aja-agora-crm-${alvo.database}-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`,
	);

	if (opcoes.skipDump) {
		if (!alvo.ehLocal) throw new Error("--skip-dump é proibido contra banco remoto");
		console.warn(`${LOG} ⚠ dump pulado (--skip-dump, banco local)`);
		return;
	}

	try {
		execFileSync("pg_dump", ["--no-owner", "--no-privileges", "-f", destino, databaseUrl], {
			stdio: ["ignore", "inherit", "inherit"],
		});
		console.log(`${LOG} ✓ dump em ${destino}`);
	} catch (err) {
		const semFerramenta = (err as NodeJS.ErrnoException).code === "ENOENT";
		if (!alvo.ehLocal) {
			throw new Error(
				semFerramenta
					? "pg_dump não encontrado — instale o cliente do Postgres antes de zerar banco remoto"
					: `pg_dump falhou: ${(err as Error).message}`,
			);
		}
		console.warn(
			`${LOG} ⚠ dump falhou no banco local, seguindo mesmo assim: ${(err as Error).message}`,
		);
	}
}

async function contar(tabelas: readonly string[]): Promise<Map<string, number>> {
	const contagens = new Map<string, number>();
	for (const tabela of tabelas) {
		const resultado = await db.execute<{ total: string }>(
			sql.raw(`SELECT count(*)::text AS total FROM "${tabela}"`),
		);
		contagens.set(tabela, Number(resultado.rows[0]?.total ?? 0));
	}
	return contagens;
}

/** Apaga os objetos no S3 ANTES do truncate — depois as chaves não existem mais. */
async function apagarDocumentosNoS3(): Promise<void> {
	const docs = await db
		.select({ key: clientDocuments.s3Key, bucket: clientDocuments.s3Bucket })
		.from(clientDocuments);

	if (docs.length === 0) {
		console.log(`${LOG} nenhum documento de cliente no S3`);
		return;
	}

	const cfg = getClientDocsStorageConfig();
	let apagados = 0;
	const falhas: string[] = [];

	for (const doc of docs) {
		try {
			await deleteObject(doc.key, { ...cfg, bucket: doc.bucket });
			apagados++;
		} catch (err) {
			falhas.push(`${doc.bucket}/${doc.key}: ${(err as Error).message}`);
		}
	}

	console.log(`${LOG} ✓ S3: ${apagados}/${docs.length} objetos apagados`);
	if (falhas.length > 0) {
		// Falha aqui NÃO aborta o reset — mas é PII sobrevivendo a um comando que
		// prometeu apagá-la, então nunca vira log discreto.
		console.error(`${LOG} ⚠ ${falhas.length} objeto(s) NÃO apagados — PII ainda no bucket:`);
		for (const falha of falhas) console.error(`${LOG}    ${falha}`);
	}
}

/** Purga a memória do agente identidade por identidade (best-effort). */
async function purgarMemoria(): Promise<void> {
	const identidades = await db
		.select({
			namespace: memoryIdentities.namespace,
			kind: memoryIdentities.kind,
			value: memoryIdentities.value,
		})
		.from(memoryIdentities);

	if (identidades.length === 0) {
		console.log(`${LOG} nenhuma identidade de memória`);
		return;
	}

	const adapter = getMemoryAdapter();
	let purgadas = 0;
	let falhas = 0;

	for (const identidade of identidades) {
		try {
			await adapter.purgeIdentity({
				kind: identidade.kind as IdentityKind,
				value: identidade.value,
				namespace: identidade.namespace,
			});
			purgadas++;
		} catch {
			falhas++;
		}
	}

	console.log(`${LOG} ✓ memória: ${purgadas}/${identidades.length} identidades purgadas`);
	if (falhas > 0) {
		console.warn(`${LOG} ⚠ ${falhas} identidade(s) não purgadas no provedor de memória`);
	}
}

/**
 * O TRUNCATE, com rede de segurança: CASCADE arrasta qualquer tabela que
 * aponte pras apagadas, e uma FK nova pode um dia ligar configuração a dado de
 * operação. Conferimos as preservadas DENTRO da transação — se alguma perdeu
 * linha, desfaz tudo em vez de descobrir depois que os templates sumiram.
 */
async function truncar(): Promise<void> {
	const antes = await contar(TABELAS_PRESERVADAS);
	const alvo = TABELAS_LIMPAS.map((t) => `"${t}"`).join(", ");

	await db.transaction(async (tx) => {
		await tx.execute(sql.raw(`TRUNCATE TABLE ${alvo} RESTART IDENTITY CASCADE`));

		for (const tabela of TABELAS_PRESERVADAS) {
			const resultado = await tx.execute<{ total: string }>(
				sql.raw(`SELECT count(*)::text AS total FROM "${tabela}"`),
			);
			const depois = Number(resultado.rows[0]?.total ?? 0);
			const esperado = antes.get(tabela) ?? 0;
			if (depois !== esperado) {
				throw new Error(
					`ABORTADO: "${tabela}" devia ser preservada mas foi de ${esperado} para ${depois} linhas ` +
						`(CASCADE alcançou tabela de configuração — revise src/lib/crm/reset-tables.ts)`,
				);
			}
		}
	});

	console.log(
		`${LOG} ✓ ${TABELAS_LIMPAS.length} tabelas zeradas, ${TABELAS_PRESERVADAS.length} preservadas intactas`,
	);
}

async function main(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL não definida");

	const opcoes = lerOpcoes(process.argv.slice(2));
	const alvo = alvoDoBanco(databaseUrl);

	await confirmar(alvo, opcoes);
	dump(databaseUrl, alvo, opcoes);

	if (opcoes.keepS3) console.log(`${LOG} S3 preservado (--keep-s3)`);
	else await apagarDocumentosNoS3();

	if (opcoes.keepMemory) console.log(`${LOG} memória preservada (--keep-memory)`);
	else await purgarMemoria();

	await truncar();

	console.log(`${LOG} marco zero concluído.`);
}

const invocado = process.argv[1] ?? "";
if (/reset-crm(\.bundle)?\.(ts|cjs)$/.test(invocado)) {
	main()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(`${LOG} FALHA: ${(err as Error).message}`);
			process.exit(1);
		});
}
