import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// FIX-222 (Ata 2026-07-04): a coluna `logo_url` em `administradoras` tem que
// vir de uma migration GERADA via drizzle (arquivo versionado em drizzle/),
// nunca um ALTER TABLE feito à mão contra o banco.

const DRIZZLE_DIR = join(process.cwd(), "drizzle");

describe("FIX-222 — migration da coluna administradoras.logo_url gerada via drizzle", () => {
	it("existe um arquivo de migration versionado que adiciona logo_url em administradoras", () => {
		const files = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql"));
		const migration = files
			.map((f) => ({ f, sql: readFileSync(join(DRIZZLE_DIR, f), "utf-8") }))
			.find(({ sql }) => /ALTER TABLE "administradoras" ADD COLUMN "logo_url"/i.test(sql));
		expect(migration, "nenhuma migration versionada adiciona logo_url em administradoras").toBeTruthy();
	});

	it("o journal do drizzle referencia a migration (não é um .sql órfão fora do fluxo generate)", () => {
		const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf-8"));
		const tags = (journal.entries ?? []).map((e: { tag: string }) => e.tag);
		expect(tags.some((t: string) => t.includes("administradoras_logo_url"))).toBe(true);
	});

	it("schema.ts declara logoUrl na tabela administradoras (fonte da migration)", () => {
		const schema = readFileSync(join(process.cwd(), "src/db/schema.ts"), "utf-8");
		const tableBlock = schema.match(/export const administradoras = pgTable\(([\s\S]*?)\n\);/)?.[0] ?? "";
		expect(tableBlock).toMatch(/logoUrl:\s*text\("logo_url"\)/);
	});
});
