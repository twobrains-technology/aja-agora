// FIX-51 (Camada 1) — limiar de "progresso significativo" que decide se o popup
// de retomada aparece. Conversa de 1-2 falas → ruído (hidrata direto, sem
// perguntar). ≥4 mensagens OU passou da qualificação → popup. Ver ADR
// docs/correcoes/decisions/2026-06-15-bloco-a-polir-funil-retorno.md (Decisão 1).

import { describe, expect, it } from "vitest";
import { hasMeaningfulProgress, RESUME_MIN_MESSAGES } from "./resume";

describe("FIX-51 — hasMeaningfulProgress (limiar do popup de retomada)", () => {
	it("abaixo do limiar de mensagens e sem sinal de raia → sem popup (hidrata direto)", () => {
		expect(hasMeaningfulProgress(1, null)).toBe(false);
		expect(hasMeaningfulProgress(RESUME_MIN_MESSAGES - 1, {})).toBe(false);
	});

	it("≥ limiar de mensagens → popup", () => {
		expect(hasMeaningfulProgress(RESUME_MIN_MESSAGES, {})).toBe(true);
		expect(hasMeaningfulProgress(10, null)).toBe(true);
	});

	it("poucas mensagens mas passou da qualificação/reveal/fechamento → popup", () => {
		expect(hasMeaningfulProgress(2, { revealCompleted: true })).toBe(true);
		expect(hasMeaningfulProgress(2, { maxStageReached: "qualificado" })).toBe(true);
		expect(hasMeaningfulProgress(2, { contractClosed: true })).toBe(true);
	});

	it("poucas mensagens e raia ainda em engajado/novo → sem popup", () => {
		expect(hasMeaningfulProgress(2, { maxStageReached: "engajado" })).toBe(false);
	});
});
