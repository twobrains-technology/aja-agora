// FIX-110 — guard de turno vazio (server).
// Root cause REAL do "agente mudo" (uso manual Kairo, 2026-06-30): um turno de
// texto-livre fechava com sucesso SEM emitir nenhuma part visível (sem texto,
// tool, artifact, gate, transição ou handoff). O stream fecha "ok", o status do
// client volta a "ready" (input libera) mas NENHUMA resposta aparece — o usuário
// espera e nada; só "destrava" no input seguinte. `isTurnEmpty` detecta isso a
// partir do registro do TurnTrace pra o route emitir um fallback honesto.
import { describe, expect, it } from "vitest";
import { EMPTY_TURN_FALLBACK, isTurnEmpty } from "./empty-turn-guard";

const base = {
	textChars: 0,
	toolCount: 0,
	artifactCount: 0,
	gate: null as string | null,
	handoff: false,
	transitionedTo: null as string | null,
};

describe("FIX-110 — isTurnEmpty (detector de turno mudo)", () => {
	it("turno sem NENHUMA part visível é vazio", () => {
		expect(isTurnEmpty(base)).toBe(true);
	});

	it("qualquer texto emitido => NÃO é vazio", () => {
		expect(isTurnEmpty({ ...base, textChars: 12 })).toBe(false);
	});

	it("uma tool chamada => NÃO é vazio (a tool já é resposta acionável)", () => {
		expect(isTurnEmpty({ ...base, toolCount: 1 })).toBe(false);
	});

	it("um artifact emitido => NÃO é vazio", () => {
		expect(isTurnEmpty({ ...base, artifactCount: 1 })).toBe(false);
	});

	it("um gate/transição/handoff => NÃO é vazio", () => {
		expect(isTurnEmpty({ ...base, gate: "experience" })).toBe(false);
		expect(isTurnEmpty({ ...base, transitionedTo: "auto" })).toBe(false);
		expect(isTurnEmpty({ ...base, handoff: true })).toBe(false);
	});

	it("o fallback é uma frase PT-BR honesta, não-vazia e sem cara de IA (sem travessão)", () => {
		expect(EMPTY_TURN_FALLBACK.length).toBeGreaterThan(0);
		expect(EMPTY_TURN_FALLBACK).not.toMatch(/[—–]/);
	});
});
