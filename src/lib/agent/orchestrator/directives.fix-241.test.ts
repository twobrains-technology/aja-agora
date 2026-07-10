import { describe, expect, it } from "vitest";
import { buildSimulatorDialDirective } from "./directives";

// ============================================================================
// FIX-241 (rodada 2, Fable r1, D1 do veredito) — âncora de dinheiro na
// narração: "juntando R$ X/mês, lá pelo mês Y seu dinheiro alcança o lance"
// (spec 03 "Âncora de dinheiro" — WhatsApp e web usam o MESMO cálculo, só
// muda a apresentação). Sem o moneyAnchor, a diretiva segue exatamente como
// antes (retrocompat — não regride nenhum fluxo sem monthlySavings).
// ============================================================================

describe("FIX-241 — buildSimulatorDialDirective narra a âncora de dinheiro quando há moneyAnchor", () => {
	it("sem moneyAnchor: diretiva idêntica ao comportamento antigo (retrocompat)", () => {
		const d = buildSimulatorDialDirective({ administradora: "ITAÚ" });
		expect(d).not.toMatch(/junto|junta|poupa|guarda/i);
	});

	it("com moneyAnchor: instrui o agente a narrar valor mensal + mês âncora", () => {
		const d = buildSimulatorDialDirective({
			administradora: "ITAÚ",
			moneyAnchor: { monthlySavings: 4000, anchoredMonth: 15 },
		});
		expect(d).toMatch(/4\.000|4000/);
		expect(d).toMatch(/\bm[êe]s\s*15\b|\b15\b/);
	});

	it("com moneyAnchor: NÃO promete contemplação nesse mês (só que o bolso cobre)", () => {
		const d = buildSimulatorDialDirective({
			moneyAnchor: { monthlySavings: 4000, anchoredMonth: 15 },
		});
		expect(d.toLowerCase()).not.toMatch(/vai ser contemplado no m[êe]s|garantid[ao] no m[êe]s/);
	});

	it("mantém o fluxo obrigatório de chamar present_contemplation_dial (não quebra o card)", () => {
		const d = buildSimulatorDialDirective({
			moneyAnchor: { monthlySavings: 4000, anchoredMonth: 15 },
		});
		expect(d).toMatch(/present_contemplation_dial/);
	});
});
