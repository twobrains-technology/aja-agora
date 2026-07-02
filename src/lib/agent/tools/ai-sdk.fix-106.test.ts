import { describe, expect, it } from "vitest";
import { computeContemplationDial } from "@/lib/consorcio/contemplation-dial";
import { consorcioTools } from "./ai-sdk";

// ============================================================================
// FIX-106 — simulador de contemplação CONVERSACIONAL (loop).
// A tool simulate_contemplation é a versão de CÁLCULO (paralela a
// compute_scenarios): recalcula o cenário pra um mês-alvo e devolve os números
// pro agente narrar no loop por texto/WhatsApp. DEVE reusar computeContemplationDial
// (regra 6 do bloco) — dial e conversa batem número a número.
// ============================================================================

// biome-ignore lint/suspicious/noExplicitAny: execute opaco da tool
const execContemplation = (consorcioTools.simulate_contemplation as any).execute;

describe("simulate_contemplation — tool de cálculo do loop (FIX-106)", () => {
	it("a tool existe no registry e NÃO é tool de apresentação (é cálculo)", async () => {
		expect(consorcioTools.simulate_contemplation).toBeDefined();
		const { PRESENTATION_TOOLS } = await import("./ai-sdk");
		expect(PRESENTATION_TOOLS.has("simulate_contemplation")).toBe(false);
	});

	it("reusa computeContemplationDial — resultado idêntico ao motor puro", async () => {
		const args = {
			creditValue: 80_000,
			termMonths: 80,
			targetMonth: 6,
			monthlyPayment: 950,
			historicalWinningBidPct: 40,
			referenceMonth: 20,
			maxEmbutidoPct: 30,
		};
		const fromTool = await execContemplation(args);
		const fromEngine = computeContemplationDial(args);
		expect(fromTool).toEqual(fromEngine);
	});

	it("devolve o pacote completo (lance %/R$, embutido × dinheiro, crédito líquido, parcela após)", async () => {
		const r = await execContemplation({
			creditValue: 100_000,
			termMonths: 72,
			targetMonth: 6,
			monthlyPayment: 1_500,
		});
		// Campos que o agente narra no loop conversacional.
		expect(r).toHaveProperty("requiredLancePct");
		expect(r).toHaveProperty("requiredLanceValue");
		expect(r).toHaveProperty("embeddedBidValue");
		expect(r).toHaveProperty("ownCashValue");
		expect(r).toHaveProperty("receivedCredit");
		expect(r).toHaveProperty("paymentAfterContemplation");
		expect(typeof r.requiredLanceValue).toBe("number");
	});

	it("recalcula ao mudar o mês-alvo (a essência do loop): mês mais cedo → lance maior", async () => {
		const base = { creditValue: 100_000, termMonths: 72, monthlyPayment: 1_500 };
		const cedo = await execContemplation({ ...base, targetMonth: 3 });
		const tarde = await execContemplation({ ...base, targetMonth: 24 });
		// Contemplar mais cedo exige lance >= do que contemplar mais tarde.
		expect(cedo.requiredLancePct).toBeGreaterThanOrEqual(tarde.requiredLancePct);
	});
});
