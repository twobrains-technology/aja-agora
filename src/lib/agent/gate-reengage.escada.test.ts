// Camada 1 (FIX-211) — escada de cobrança de dado obrigatório.
//
// Kairo (reforma de conversa WhatsApp, 2026-07-02): "se o cara nao informar tem
// que cobrar ele ate informar". C2 do spec: o re-pedido de um gate de coleta
// obrigatória (CPF/valor) VARIA por tentativa; após o teto, oferece a SAÍDA pro
// especialista (anti-armadilha — nunca loop infinito).

import { describe, expect, it } from "vitest";
import { reengageQuestionForGate, SPECIALIST_EXIT_OFFER } from "@/lib/agent/gate-reengage";

const EMOJI =
	/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}]/u;

describe("FIX-211 — escada de cobrança: textos distintos por tentativa + saída no teto", () => {
	for (const gate of ["identify", "credit"] as const) {
		const category = gate === "credit" ? "auto" : null;

		it(`${gate}: tentativas 1, 2, 3 são textos DISTINTOS (a cobrança escala)`, () => {
			const t1 = reengageQuestionForGate(gate, category, 1);
			const t2 = reengageQuestionForGate(gate, category, 2);
			const t3 = reengageQuestionForGate(gate, category, 3);
			expect(t1).toBeTruthy();
			expect(t2).toBeTruthy();
			expect(t3).toBeTruthy();
			expect(new Set([t1, t2, t3]).size).toBe(3);
			// nenhum texto da escada tem emoji
			for (const t of [t1, t2, t3]) expect(t).not.toMatch(EMOJI);
		});

		it(`${gate}: 4ª tentativa oferece o especialista (saída), não re-pergunta`, () => {
			expect(reengageQuestionForGate(gate, category, 4)).toBe(SPECIALIST_EXIT_OFFER);
			expect(reengageQuestionForGate(gate, category, 9)).toBe(SPECIALIST_EXIT_OFFER);
			expect(SPECIALIST_EXIT_OFFER).toMatch(/especialista/i);
			expect(SPECIALIST_EXIT_OFFER).not.toMatch(EMOJI);
		});

		it(`${gate}: tentativa 1 é o pedido direto (a pergunta base do gate)`, () => {
			expect(reengageQuestionForGate(gate, category, 1)).toContain(
				gate === "identify" ? "CPF" : "valor do bem",
			);
		});
	}

	it("compat: sem attempt = tentativa 1 (comportamento do guard de turno-mudo)", () => {
		expect(reengageQuestionForGate("credit", "auto")).toBe(
			reengageQuestionForGate("credit", "auto", 1),
		);
	});

	it("gates NÃO obrigatórios retornam null em qualquer tentativa", () => {
		for (const attempt of [1, 2, 3, 4]) {
			expect(reengageQuestionForGate("experience", null, attempt)).toBeNull();
			expect(reengageQuestionForGate("name", null, attempt)).toBeNull();
		}
	});
});
