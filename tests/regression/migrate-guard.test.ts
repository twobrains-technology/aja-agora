// Camada 1 — guard de migrations destrutivas escaneia só as PENDENTES.
//
// Bug (2026-06-13): o migrate-guard re-escaneava TODAS as .sql a cada boot (não
// consultava o DB) → abortava em prod ao achar destrutivas HISTÓRICAS já
// aplicadas (0003/0008/0009/0013/0020 do aja-agora) → forçava
// ALLOW_DESTRUCTIVE_MIGRATION=true permanente, desativando o gate de boot pra
// destrutivas FUTURAS. Fix: consultar drizzle.__drizzle_migrations (count de
// aplicadas) e escanear só as entries do journal além desse count.

import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// .mjs sem types; importamos as funções puras do guard.
import { detect, detectDrift, selectPendingTags } from "../../scripts/migrate-guard.mjs";

const JOURNAL = [
	{ idx: 0, tag: "0000_init" },
	{ idx: 1, tag: "0001_drop_col" }, // destrutiva histórica
	{ idx: 2, tag: "0002_add_table" },
	{ idx: 3, tag: "0003_new_drop" }, // destrutiva (pode ser pendente)
];

describe("migrate-guard — selectPendingTags (núcleo do fix)", () => {
	it("BUG-MIGRATE-GUARD-RESCAN: destrutiva histórica já aplicada NÃO entra em pending", () => {
		// 4 no journal, 3 aplicadas (0000,0001,0002) — a 0001 destrutiva já está no
		// DB. Só a 0003 é pendente. A 0001 NÃO deve mais disparar o abort.
		expect(selectPendingTags(JOURNAL, 3)).toEqual(["0003_new_drop"]);
	});

	it("tudo aplicado → zero pendentes (cenário real aja-agora: 24=24)", () => {
		expect(selectPendingTags(JOURNAL, 4)).toEqual([]);
	});

	it("appliedCount=null (DB/tabela inacessível) → fallback conservador: TODAS as tags", () => {
		expect(selectPendingTags(JOURNAL, null)).toEqual([
			"0000_init",
			"0001_drop_col",
			"0002_add_table",
			"0003_new_drop",
		]);
	});

	it("appliedCount=0 (primeiro boot, tabela vazia) → todas pendentes", () => {
		expect(selectPendingTags(JOURNAL, 0)).toEqual([
			"0000_init",
			"0001_drop_col",
			"0002_add_table",
			"0003_new_drop",
		]);
	});

	it("ordena por idx antes de fatiar (journal fora de ordem)", () => {
		const shuffled = [JOURNAL[2], JOURNAL[0], JOURNAL[3], JOURNAL[1]];
		expect(selectPendingTags(shuffled, 3)).toEqual(["0003_new_drop"]);
	});
});

describe("migrate-guard — detect (puro, sql inline)", () => {
	it("acha DROP COLUMN e ignora o mesmo statement em comentário", () => {
		const findings = detect([
			{ file: "0003_new_drop.sql", sql: 'ALTER TABLE "users" DROP COLUMN "old";' },
			{ file: "0009_comment.sql", sql: "-- DROP TABLE legacy_users\nSELECT 1;" },
		]);
		expect(findings.map((f: { file: string }) => f.file)).toEqual(["0003_new_drop.sql"]);
		expect(findings[0].label).toMatch(/DROP COLUMN/);
	});

	it("sql inócuo (CREATE/ADD) não gera finding", () => {
		const findings = detect([
			{ file: "0002_add_table.sql", sql: 'CREATE TABLE "x" ("id" serial);' },
		]);
		expect(findings).toEqual([]);
	});
});

describe("migrate-guard — detectDrift (FIX-100: count vs presença real da tabela)", () => {
	// Cenário FIX-100 (aja-pg-develop, 2026-06-26): __drizzle_migrations tinha
	// count=22 mas o schema JÁ tinha as tabelas de 0022+ (aplicadas via
	// drizzle-kit push/dump sem registrar no journal). O guard, confiando só no
	// count, tratava 0022-0027 como pendentes e tentava reaplicar 0022-0026 →
	// "relation already exists" ANTES de chegar na 0027 real. detectDrift acha
	// esse cenário ANTES do migrate() explodir, com diagnóstico claro.

	it("BUG-MIGRATE-GUARD-DRIFT: migration pendente cujo CREATE TABLE já existe no schema real = drift", () => {
		const pendingFiles = [
			{ file: "0022_mesa_attendants.sql", sql: 'CREATE TABLE "mesa_attendants" ("id" serial);' },
			{ file: "0027_memory_identities.sql", sql: 'CREATE TABLE "memory_identities" ("id" serial);' },
		];
		const existingTables = ["mesa_attendants", "administradoras", "conversations"];
		const findings = detectDrift(pendingFiles, existingTables);
		expect(findings).toEqual([{ file: "0022_mesa_attendants.sql", table: "mesa_attendants" }]);
	});

	it("nenhuma tabela pendente já existe → zero findings (schema consistente)", () => {
		const pendingFiles = [
			{ file: "0027_memory_identities.sql", sql: 'CREATE TABLE "memory_identities" ("id" serial);' },
		];
		const existingTables = ["conversations", "leads"];
		expect(detectDrift(pendingFiles, existingTables)).toEqual([]);
	});

	it("é case-insensitive (Postgres normaliza identificadores não-quoted pra lowercase)", () => {
		const pendingFiles = [{ file: "0022_x.sql", sql: 'CREATE TABLE "Mesa_Attendants" ("id" serial);' }];
		expect(detectDrift(pendingFiles, ["mesa_attendants"])).toEqual([
			{ file: "0022_x.sql", table: "mesa_attendants" },
		]);
	});

	it("CREATE TABLE IF NOT EXISTS também é verificado (não é imune ao drift)", () => {
		const pendingFiles = [
			{ file: "0022_x.sql", sql: 'CREATE TABLE IF NOT EXISTS "mesa_attendants" ("id" serial);' },
		];
		expect(detectDrift(pendingFiles, ["mesa_attendants"])).toEqual([
			{ file: "0022_x.sql", table: "mesa_attendants" },
		]);
	});

	it("migration sem CREATE TABLE (ex: ALTER) não gera finding — drift só se aplica a criação de tabela", () => {
		const pendingFiles = [{ file: "0028_x.sql", sql: 'ALTER TABLE "conversations" ADD COLUMN "x" text;' }];
		expect(detectDrift(pendingFiles, ["conversations"])).toEqual([]);
	});
});

describe("migrate-guard — entrypoint roda no BUNDLE CJS (não vira no-op)", () => {
	it("BUG-MIGRATE-GUARD-BUNDLE-NOOP: bundle executado sem DATABASE_URL aborta (main rodou)", () => {
		// O runtime usa o bundle CJS (esbuild), onde import.meta.url não bate com
		// argv[1] → o guard de entrypoint via import.meta.url tornava main() um
		// no-op silencioso (migrations não aplicadas). O entrypoint deve casar pelo
		// NOME do script. Gera o bundle e roda sem DATABASE_URL: main() tem que
		// rodar e abortar com a mensagem.
		execSync("pnpm run db:migrate:bundle", { cwd: process.cwd(), stdio: "ignore" });
		let stderr = "";
		let exitCode = 0;
		try {
			execSync("node scripts/migrate-guard.bundle.cjs", {
				cwd: process.cwd(),
				env: { ...process.env, DATABASE_URL: "" },
				stdio: ["ignore", "ignore", "pipe"],
			});
		} catch (e: unknown) {
			const err = e as { status?: number; stderr?: Buffer };
			exitCode = err.status ?? 0;
			stderr = err.stderr?.toString() ?? "";
		}
		expect(exitCode).not.toBe(0);
		expect(stderr).toMatch(/DATABASE_URL não definida/);
	});
});
