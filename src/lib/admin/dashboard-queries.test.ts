/**
 * Teste de regressão: garante que os painéis comerciais filtram conversas/leads simulados
 * (criados via /admin/simulator). Se algum dev remover esse filtro num refactor sem
 * perceber, métrica de produção começa a contar dado de teste e corrompe rápido.
 *
 * Estratégia: inspeção do arquivo fonte (não roda DB). Frágil a renomeio do helper
 * `realLeads`, mas barato e cobre o risco real: filtro sumir silenciosamente.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function source(relPath: string): string {
	return readFileSync(resolve(root, relPath), "utf-8");
}

describe("filtros isSimulated nos painéis comerciais", () => {
	it("dashboard-queries: cada .from(leads) está coberto por realLeads ou is_simulated = false (SQL puro)", () => {
		const src = source("src/lib/admin/dashboard-queries.ts");
		// Drizzle queries: o helper realLeads (eq(leads.isSimulated, false)) deve aparecer em
		// TODAS as queries que tocam leads. Contagem mínima = nº de .from(leads).
		const fromLeadsCount = (src.match(/\.from\(leads\)/g) ?? []).length;
		const realLeadsCount = (src.match(/realLeads/g) ?? []).length;
		// Cada .from(leads) consome 1 realLeads no .where(); +1 da definição do const.
		expect(realLeadsCount).toBeGreaterThanOrEqual(fromLeadsCount + 1);

		// SQL puro (db.execute) precisa ter is_simulated = false explícito.
		const rawSqlBlocks = src.match(/db\.execute\(sql`[\s\S]*?`\)/g) ?? [];
		expect(rawSqlBlocks.length).toBeGreaterThan(0); // sanity
		for (const block of rawSqlBlocks) {
			expect(block).toMatch(/is_simulated\s*=\s*false/);
		}
	});

	it("/api/admin/leads: findMany filtra isSimulated=false", () => {
		const src = source("src/app/api/admin/leads/route.ts");
		expect(src).toMatch(/where:\s*eq\(leads\.isSimulated,\s*false\)/);
	});

	it("/api/admin/conversations: oculta simuladas por default, opt-in via ?include_simulated=true", () => {
		const src = source("src/app/api/admin/conversations/route.ts");
		expect(src).toMatch(/include_simulated/);
		expect(src).toMatch(/eq\(conversations\.isSimulated,\s*false\)/);
	});
});
