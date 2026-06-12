/**
 * Camada 1 — FIX-7 (teste manual Kairo 2026-06-05): o card de recomendação
 * exibia "43% compatível" na ÚNICA opção oferecida — score numérico baixo
 * exposto mina a confiança ("a mais adequada" com 43%?). Decisão aprovada:
 * rótulo QUALITATIVO no card; % numérico só em contexto comparativo
 * (comparison-table); breakdown segue no expansível.
 */

import { describe, expect, it } from "vitest";
import { recommendationFitLabel, scoreLabel } from "./score-label";

describe("FIX-7 — scoreLabel qualitativo", () => {
	it("score alto (≥0.75) → Ótima compatibilidade", () => {
		expect(scoreLabel(0.75)).toBe("Ótima compatibilidade");
		expect(scoreLabel(0.92)).toBe("Ótima compatibilidade");
	});

	it("score médio (≥0.5) → Boa compatibilidade", () => {
		expect(scoreLabel(0.5)).toBe("Boa compatibilidade");
		expect(scoreLabel(0.69)).toBe("Boa compatibilidade");
	});

	it("score baixo (<0.5) → Compatível com seu perfil (cenário exato do bug: 0.43)", () => {
		expect(scoreLabel(0.43)).toBe("Compatível com seu perfil");
		expect(scoreLabel(0.1)).toBe("Compatível com seu perfil");
	});

	it("nunca devolve percentual numérico", () => {
		for (const s of [0.1, 0.43, 0.5, 0.75, 0.99]) {
			expect(scoreLabel(s)).not.toMatch(/\d?%/);
		}
	});
});

describe("FIX-18 — recommendationFitLabel (rótulo honesto quando orçamento não fecha)", () => {
	it("bug do Kairo: monthlyFit≈0 (parcela 9,8× o orçamento) → NÃO diz 'Compatível com seu perfil'", () => {
		// O card confessava "Orçamento 0%" e mesmo assim rotulava "Compatível com
		// seu perfil" — mentira. Honesto: melhor opção na FAIXA DE CRÉDITO.
		expect(recommendationFitLabel(0.68, 0)).toBe("Melhor opção na faixa de crédito");
		expect(recommendationFitLabel(0.43, 0.05)).toBe("Melhor opção na faixa de crédito");
		expect(recommendationFitLabel(0.68, 0)).not.toBe("Compatível com seu perfil");
	});

	it("orçamento razoável → mantém o rótulo qualitativo do score", () => {
		expect(recommendationFitLabel(0.8, 0.85)).toBe("Ótima compatibilidade");
		expect(recommendationFitLabel(0.55, 0.6)).toBe("Boa compatibilidade");
		// score baixo MAS orçamento ok → segue "Compatível com seu perfil" (não é mentira)
		expect(recommendationFitLabel(0.43, 0.5)).toBe("Compatível com seu perfil");
	});

	it("nunca devolve percentual numérico", () => {
		for (const [s, f] of [
			[0.1, 0],
			[0.68, 0],
			[0.5, 0.6],
			[0.9, 0.9],
		] as const) {
			expect(recommendationFitLabel(s, f)).not.toMatch(/\d?%/);
		}
	});
});
