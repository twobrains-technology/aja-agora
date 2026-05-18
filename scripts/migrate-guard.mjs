#!/usr/bin/env node
// Migration runner com guard de segurança — padrão TwoBrains AWS.
//
// Roda em runtime (sem drizzle-kit/prisma CLI). Detecta statements destrutivos
// nos arquivos .sql pendentes (ainda não aplicados), e:
//   - dev      → log warning, segue
//   - prod     → aborta processo com exit 1, a menos que
//                ALLOW_DESTRUCTIVE_MIGRATION=true esteja setado.
//
// Container falha startup → ECS marca task unhealthy → rollback automático.
//
// Uso (Drizzle):
//   1. Copiar este arquivo pra `scripts/migrate-guard.mjs` no repo.
//   2. package.json: "db:migrate:runtime": "node scripts/migrate-guard.mjs"
//   3. Ajustar import do migrator (driver: node-postgres / postgres-js / etc).
//   4. Garantir que pasta de migrations (drizzle/) está no Dockerfile runner.
//
// Uso (Prisma): este script é só pro Drizzle. Pra Prisma, use o equivalente
// `prisma migrate deploy` no entrypoint (já é o default) e adicione um pre-step
// que roda este detector contra `prisma/migrations/*/migration.sql`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const MIGRATIONS_FOLDER = process.env.MIGRATIONS_FOLDER ?? "./drizzle";
const DATABASE_URL = process.env.DATABASE_URL;
const TB_ENV = (process.env.TB_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
const IS_PROD = TB_ENV === "prod" || TB_ENV === "production";
const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_MIGRATION === "true";

if (!DATABASE_URL) {
	console.error("[migrate-guard] DATABASE_URL não definida — abortando");
	process.exit(1);
}

// ---------- detector de statements destrutivos ----------
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

function stripSqlComments(sql) {
	// Remove -- comentários e /* */ blocos antes da regex pra evitar match em
	// comentário tipo "-- DROP TABLE old_users" que docs migrations às vezes têm.
	return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function findPending(folder) {
	const journal = join(folder, "meta", "_journal.json");
	let appliedTags = new Set();
	try {
		const j = JSON.parse(readFileSync(journal, "utf-8"));
		// Drizzle journal lista todas migrations (aplicadas ou não). Sem conexão
		// não temos como filtrar — vamos escanear TODAS .sql novas. Em prod isso
		// é ok: se uma drop existe mesmo já aplicada, ainda assim queremos exigir
		// flag explícita pra dar deploy. Sinal > silêncio.
		appliedTags = new Set(j.entries.map((e) => e.tag));
	} catch {
		// Sem journal? Escaneia tudo.
	}
	const all = readdirSync(folder).filter((f) => f.endsWith(".sql"));
	return all.map((f) => ({ file: f, path: join(folder, f) }));
}

function detect(files) {
	const findings = [];
	for (const { file, path } of files) {
		const raw = readFileSync(path, "utf-8");
		const sql = stripSqlComments(raw);
		for (const { pattern, label, validate } of DESTRUCTIVE_PATTERNS) {
			const matches = sql.matchAll(new RegExp(pattern.source, pattern.flags + "g"));
			for (const m of matches) {
				if (validate && !validate(m)) continue;
				findings.push({ file, label, snippet: m[0].trim().slice(0, 120) });
			}
		}
	}
	return findings;
}

// ---------- main ----------

let pending;
try {
	pending = findPending(MIGRATIONS_FOLDER);
} catch (e) {
	console.error(`[migrate-guard] não consegui ler ${MIGRATIONS_FOLDER}:`, e.message);
	process.exit(1);
}

const findings = detect(pending);

if (findings.length > 0) {
	console.warn("");
	console.warn("⚠️  [migrate-guard] STATEMENTS DESTRUTIVOS DETECTADOS");
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

// ---------- aplicar migrations ----------

async function applyMigrations() {
	const pool = new Pool({ connectionString: DATABASE_URL });
	const db = drizzle(pool);

	console.log(`[migrate-guard] aplicando migrations de ${MIGRATIONS_FOLDER} ...`);
	try {
		await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		console.log("[migrate-guard] OK — schema atualizado");
		if (IS_PROD && findings.length > 0 && ALLOW_DESTRUCTIVE) {
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

applyMigrations();
