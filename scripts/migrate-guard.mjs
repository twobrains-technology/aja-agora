#!/usr/bin/env node
// Migration runner com guard de segurança — padrão TwoBrains AWS.
//
// Roda em runtime (sem drizzle-kit/prisma CLI). Detecta statements destrutivos
// nos arquivos .sql PENDENTES (ainda não aplicados no DB), e:
//   - dev      → log warning, segue
//   - prod     → aborta processo com exit 1, a menos que
//                ALLOW_DESTRUCTIVE_MIGRATION=true esteja setado.
//
// Container falha startup → ECS marca task unhealthy → rollback automático.
//
// "Pendente" = consultado no DB: `count(*)` em drizzle.__drizzle_migrations dá o
// nº de migrations já aplicadas; as entries do journal além desse count são as
// pendentes. Destrutiva HISTÓRICA já aplicada NÃO dispara o guard (senão a flag
// ALLOW_DESTRUCTIVE viraria permanente em todo redeploy). Se a consulta falhar
// (1º boot/tabela ausente/DB down), cai no modo conservador: escaneia TODAS —
// sinal > silêncio. (Fix 2026-06-13: antes escaneava sempre todas.)
//
// FIX-100 (2026-06-26): o COUNT sozinho mente se migrations foram aplicadas
// via `drizzle-kit push`/dump sem registrar no journal (drift) — o guard
// tentaria reaplicar migrations cujas tabelas JÁ existem, quebrando com
// "relation already exists" antes de chegar nas pendentes de verdade. Antes de
// aplicar, cruza o `CREATE TABLE` de cada pendente com `information_schema.
// tables` do schema real (detectDrift) e ABORTA com diagnóstico claro (sempre,
// dev e prod — não é risco a ponderar, é uma falha garantida do migrate()).
//
// Uso (Drizzle):
//   1. Copiar este arquivo pra `scripts/migrate-guard.mjs` no repo.
//   2. package.json: "db:migrate:runtime": "node scripts/migrate-guard.mjs"
//   3. Garantir que pasta de migrations (drizzle/) está no Dockerfile runner.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------- detector de statements destrutivos (puro) ----------
//
// Regex são heurísticas; falsos positivos (ex: DROP CONSTRAINT em refactor
// inocente) são intencionais — exigem decisão humana via ALLOW_DESTRUCTIVE.
const DESTRUCTIVE_PATTERNS = [
	{ pattern: /\bDROP\s+TABLE\b/i, label: "DROP TABLE" },
	{ pattern: /\bDROP\s+SCHEMA\b/i, label: "DROP SCHEMA" },
	{ pattern: /\bDROP\s+DATABASE\b/i, label: "DROP DATABASE" },
	{
		pattern: /\bALTER\s+TABLE\s+\S+\s+DROP\s+(COLUMN\b|CONSTRAINT\b)/i,
		label: "DROP COLUMN/CONSTRAINT",
	},
	{ pattern: /\bTRUNCATE\b/i, label: "TRUNCATE" },
	// DELETE sem WHERE — pega o statement inteiro até o ; ou fim do arquivo,
	// procura WHERE; se não tem, sinaliza.
	{
		pattern: /\bDELETE\s+FROM\s+[^;]+;/i,
		label: "DELETE FROM (revisar WHERE)",
		validate: (m) => !/\bWHERE\b/i.test(m[0]),
	},
	{
		pattern: /\bALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i,
		label: "ALTER COLUMN TYPE (pode perder dados)",
	},
];

export function stripSqlComments(sql) {
	// Remove -- comentários e /* */ blocos antes da regex pra evitar match em
	// comentário tipo "-- DROP TABLE old_users" que docs migrations às vezes têm.
	return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Detecta statements destrutivos. `files`: [{file, sql}] (conteúdo já lido). */
export function detect(files) {
	const findings = [];
	for (const { file, sql } of files) {
		const clean = stripSqlComments(sql);
		for (const { pattern, label, validate } of DESTRUCTIVE_PATTERNS) {
			const matches = clean.matchAll(new RegExp(pattern.source, `${pattern.flags}g`));
			for (const m of matches) {
				if (validate && !validate(m)) continue;
				findings.push({ file, label, snippet: m[0].trim().slice(0, 120) });
			}
		}
	}
	return findings;
}

/**
 * Tags do journal que ainda NÃO foram aplicadas. `appliedCount` vem do
 * `count(*)` em __drizzle_migrations; `null` (consulta falhou) → fallback
 * conservador, devolve TODAS as tags. Ordena por idx antes de fatiar.
 */
export function selectPendingTags(journalEntries, appliedCount) {
	const ordered = [...journalEntries].sort((a, b) => a.idx - b.idx).map((e) => e.tag);
	if (appliedCount == null) return ordered;
	return ordered.slice(appliedCount);
}

/**
 * FIX-100: `selectPendingTags` confia só no COUNT de __drizzle_migrations —
 * se migrations já foram aplicadas via `drizzle-kit push`/dump SEM registrar
 * no journal (drift), uma migration "pendente" pelo count pode já ter sua
 * tabela criada no schema real. Reaplicá-la quebraria com "relation already
 * exists" — e pior, ANTES de chegar em migrations pendentes de verdade mais
 * à frente (aja-pg-develop, 2026-06-26: 0022-0026 já existiam, bloqueando a
 * 0027 real). Detecta o `CREATE TABLE [IF NOT EXISTS]` de cada migration
 * pendente e cruza com as tabelas que JÁ existem no schema.
 */
export function detectDrift(pendingFiles, existingTables) {
	const existing = new Set(existingTables.map((t) => t.toLowerCase()));
	const findings = [];
	for (const { file, sql } of pendingFiles) {
		const clean = stripSqlComments(sql);
		const matches = clean.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi);
		for (const m of matches) {
			const table = m[1].toLowerCase();
			if (existing.has(table)) findings.push({ file, table });
		}
	}
	return findings;
}

// ---------- I/O (não-puro; usado só no main) ----------

function readJournal(folder) {
	const journalPath = join(folder, "meta", "_journal.json");
	const j = JSON.parse(readFileSync(journalPath, "utf-8"));
	return j.entries ?? [];
}

/** `count(*)` em drizzle.__drizzle_migrations. null em QUALQUER erro (1º boot,
 * tabela ausente, DB down) → o chamador cai no modo conservador. */
async function getAppliedCount(databaseUrl) {
	const { Pool } = await import("pg");
	const pool = new Pool({ connectionString: databaseUrl });
	try {
		const r = await pool.query('SELECT count(*)::int AS n FROM drizzle."__drizzle_migrations"');
		return r.rows?.[0]?.n ?? null;
	} catch {
		return null;
	} finally {
		await pool.end().catch(() => {});
	}
}

/** Nomes de tabelas do schema `public`. `null` em QUALQUER erro (DB down,
 * schema ausente) → o chamador pula o check de drift (fallback: não bloqueia
 * o boot por uma consulta auxiliar falhar — o count já cai no conservador). */
async function getExistingTables(databaseUrl) {
	const { Pool } = await import("pg");
	const pool = new Pool({ connectionString: databaseUrl });
	try {
		const r = await pool.query(
			"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
		);
		return r.rows.map((row) => row.table_name);
	} catch {
		return null;
	} finally {
		await pool.end().catch(() => {});
	}
}

/** Lê o conteúdo das migrations pendentes. Tag sem arquivo correspondente é
 * ignorada (defensivo). */
function loadPendingFiles(folder, pendingTags) {
	const onDisk = new Set(readdirSync(folder).filter((f) => f.endsWith(".sql")));
	const files = [];
	for (const tag of pendingTags) {
		const file = `${tag}.sql`;
		if (!onDisk.has(file)) continue;
		files.push({ file, sql: readFileSync(join(folder, file), "utf-8") });
	}
	return files;
}

// ---------- main ----------

async function applyMigrations(folder, databaseUrl, ctx) {
	const { Pool } = await import("pg");
	const { drizzle } = await import("drizzle-orm/node-postgres");
	const { migrate } = await import("drizzle-orm/node-postgres/migrator");
	const pool = new Pool({ connectionString: databaseUrl });
	const db = drizzle(pool);

	console.log(`[migrate-guard] aplicando migrations de ${folder} ...`);
	try {
		await migrate(db, { migrationsFolder: folder });
		console.log("[migrate-guard] OK — schema atualizado");
		if (ctx.isProd && ctx.hadFindings && ctx.allowDestructive) {
			console.warn("");
			console.warn("ℹ️  Migration destrutiva aplicada com sucesso.");
			console.warn("   AGORA: remova ALLOW_DESTRUCTIVE_MIGRATION do secret tb/prod/<app>/env");
			console.warn("   pra evitar que o flag fique ativo pro próximo deploy.");
		}
	} catch (e) {
		console.error("[migrate-guard] FALHA:", e.message);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

async function main() {
	const MIGRATIONS_FOLDER = process.env.MIGRATIONS_FOLDER ?? "./drizzle";
	const DATABASE_URL = process.env.DATABASE_URL;
	const TB_ENV = (process.env.TB_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
	const IS_PROD = TB_ENV === "prod" || TB_ENV === "production";
	const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_MIGRATION === "true";

	if (!DATABASE_URL) {
		console.error("[migrate-guard] DATABASE_URL não definida — abortando");
		process.exit(1);
	}

	let journal;
	try {
		journal = readJournal(MIGRATIONS_FOLDER);
	} catch (e) {
		console.error(`[migrate-guard] não consegui ler o journal de ${MIGRATIONS_FOLDER}:`, e.message);
		process.exit(1);
	}

	const appliedCount = await getAppliedCount(DATABASE_URL);
	if (appliedCount == null) {
		console.warn(
			"[migrate-guard] não consegui ler drizzle.__drizzle_migrations — escaneando TODAS as migrations (modo conservador)",
		);
	}
	const pendingTags = selectPendingTags(journal, appliedCount);
	const pendingFiles = loadPendingFiles(MIGRATIONS_FOLDER, pendingTags);

	// FIX-100: antes de tentar aplicar, verifica se alguma "pendente" (pelo
	// count) já tem sua tabela no schema real — sinal de drift (push/dump sem
	// registrar no journal). Reaplicar quebraria com "relation already exists"
	// no meio da fila, escondendo a causa raiz atrás de um erro genérico do
	// Postgres. Aborta SEMPRE (dev e prod) — não é um risco a ponderar, é uma
	// falha garantida do migrate() a seguir.
	const existingTables = await getExistingTables(DATABASE_URL);
	if (existingTables != null) {
		const driftFindings = detectDrift(pendingFiles, existingTables);
		if (driftFindings.length > 0) {
			console.error("");
			console.error("✗ [migrate-guard] DRIFT DETECTADO — __drizzle_migrations desatualizado");
			console.error("─".repeat(60));
			for (const f of driftFindings) {
				console.error(
					`  • ${f.file}: tabela "${f.table}" JÁ EXISTE no schema, mas a migration está marcada PENDENTE`,
				);
			}
			console.error("─".repeat(60));
			console.error("");
			console.error("  Isso indica migrations aplicadas via `drizzle-kit push`/dump SEM");
			console.error("  registrar em drizzle.__drizzle_migrations. Reaplicar quebraria com");
			console.error('  "relation already exists". Reconcilie __drizzle_migrations ANTES de');
			console.error("  redeployar (NUNCA DDL solto na mão — vide CLAUDE.md § Migrations).");
			console.error("");
			process.exit(1);
		}
	}

	const findings = detect(pendingFiles);

	if (findings.length > 0) {
		console.warn("");
		console.warn("⚠️  [migrate-guard] STATEMENTS DESTRUTIVOS DETECTADOS (em migrations PENDENTES)");
		console.warn("─".repeat(60));
		for (const f of findings) {
			console.warn(`  • ${f.file}: ${f.label}`);
			console.warn(`    ${f.snippet}${f.snippet.length === 120 ? "..." : ""}`);
		}
		console.warn("─".repeat(60));

		if (IS_PROD && !ALLOW_DESTRUCTIVE) {
			console.error("");
			console.error("✗ ABORTADO — TB_ENV=prod sem ALLOW_DESTRUCTIVE_MIGRATION=true");
			console.error("");
			console.error("  Pra aplicar essas migrations em prod:");
			console.error("  1. Aprovação humana (DBA/sênior) no PR.");
			console.error("  2. aws secretsmanager update-secret-value-edition em");
			console.error("     tb/prod/<app>/env adicionando ALLOW_DESTRUCTIVE_MIGRATION=true");
			console.error("  3. Re-deploy. Após sucesso, REMOVER a flag do secret.");
			console.error("");
			console.error("  Detalhes: reference/conventions.md → Migrations.");
			process.exit(1);
		}

		if (IS_PROD && ALLOW_DESTRUCTIVE) {
			console.warn(
				"✓ ALLOW_DESTRUCTIVE_MIGRATION=true — prosseguindo sob responsabilidade do operador",
			);
		} else {
			console.warn(`(env=${TB_ENV || "<unset>"} — não-prod, prosseguindo)`);
		}
	}

	await applyMigrations(MIGRATIONS_FOLDER, DATABASE_URL, {
		isProd: IS_PROD,
		hadFindings: findings.length > 0,
		allowDestructive: ALLOW_DESTRUCTIVE,
	});
}

// Só roda o main quando invocado como entrypoint. Detecta pelo NOME do script
// (não por import.meta.url): o runtime usa o bundle CJS do esbuild, onde
// import.meta.url vira um shim que não bate com argv[1] → main() virava no-op
// silencioso (BUG-MIGRATE-GUARD-BUNDLE-NOOP). O nome casa tanto o .mjs (ESM)
// quanto o .bundle.cjs (runtime); o vitest (argv[1]=vitest) não casa.
const invoked = process.argv[1] ?? "";
if (/migrate-guard(\.bundle)?\.(mjs|cjs)$/.test(invoked)) {
	main();
}
