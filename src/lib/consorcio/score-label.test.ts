/**
 * Camada 1 — FIX-7 (teste manual Kairo 2026-06-05): o card de recomendação
 * exibia "43% compatível" na ÚNICA opção oferecida — score numérico baixo
 * exposto mina a confiança ("a mais adequada" com 43%?). Decisão aprovada:
 * rótulo QUALITATIVO no card; % numérico só em contexto comparativo
 * (comparison-table); breakdown segue no expansível.
 */

import { describe, expect, it } from "vitest";
import { scoreLabel } from "./score-label";

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
