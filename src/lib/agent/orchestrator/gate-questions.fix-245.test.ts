import { describe, expect, it } from "vitest";
import { gateQuestion, lanceEmbutidoEdu } from "./gate-questions";

// FIX-245 (rodada 2, Fable r1, §D4.d) — a educação de lance embutido usava
// SEMPRE o exemplo genérico "numa carta de R$ 100 mil", mesmo com a carta
// REAL do cliente já na tela (o gate lance-embutido roda PÓS-reveal desde o
// FIX-215 — meta.recommendedOffer.creditValue já existe nesse ponto). Um
// consultor de verdade usaria o número do cliente.
describe("FIX-245 — lanceEmbutidoEdu usa a carta REAL do cliente quando disponível", () => {
	it("com creditValue real → usa o número do cliente, não o exemplo genérico", () => {
		const text = lanceEmbutidoEdu(92_902);
		expect(text).toMatch(/92\.902/);
		expect(text).not.toMatch(/100\s*mil/i);
	});

	it("sem creditValue (fallback honesto) → mantém o exemplo genérico de R$ 100 mil", () => {
		const text = lanceEmbutidoEdu();
		expect(text).toMatch(/100\s*mil/i);
	});

	it("creditValue inválido (0/negativo/NaN) → cai no fallback genérico, nunca 'R$ 0' ou 'R$ NaN'", () => {
		expect(lanceEmbutidoEdu(0)).toMatch(/100\s*mil/i);
		expect(lanceEmbutidoEdu(-5000)).toMatch(/100\s*mil/i);
		expect(lanceEmbutidoEdu(Number.NaN)).toMatch(/100\s*mil/i);
	});

	it("preserva o resto da explicação (não é opcional, só o exemplo muda)", () => {
		const text = lanceEmbutidoEdu(92_902);
		expect(text).toMatch(/lance embutido/i);
		expect(text).toMatch(/chances de contempla[çc][ãa]o/i);
	});

	it("gateQuestion('lance-embutido', category, creditValue) repassa a carta real", () => {
		const q = gateQuestion("lance-embutido", "auto", 92_902);
		expect(q).toMatch(/92\.902/);
	});

	it("gateQuestion('lance-embutido', category) sem creditValue mantém o comportamento antigo (genérico)", () => {
		const q = gateQuestion("lance-embutido", "auto");
		expect(q).toMatch(/100\s*mil/i);
	});
});
