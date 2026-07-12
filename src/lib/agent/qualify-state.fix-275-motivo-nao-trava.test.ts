import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// ============================================================================
// FIX-275 (coletor Haiku + log do servidor, 2026-07-11) — RESÍDUO do travamento
// (CK-3). Depois do beat do motivo (FIX-274), o usuário responde o "por que
// agora" e o funil PARAVA 1 turno, até ele mandar "vamos".
//
// PROVA (log de prod local, conversa c809d4fb):
//   analyzer intent=expressing_doubt | "cansei do meu carro velho, vive na oficina"
//   [gate-skip] gate=identify intent=expressing_doubt — staying conversational
//
// Root cause: o motivo do cliente é quase sempre uma QUEIXA ("cansei do carro
// velho", "o aluguel tá caro") → o analyzer classifica como `expressing_doubt`
// (ou off_topic) → o decideShowGate suprime o gate `identify`. Mas o motivo NÃO é
// um desvio: é a RESPOSTA ESPERADA ao beat. O funil tem que avançar pro identify
// no mesmo turno (espelho do motivo + card de CPF; card ≠ 2ª pergunta).
//
// Fix: uma vez que o beat do motivo já rodou (`motivationAsked`), o `identify`
// dispara em qualquer intent — SÓ uma pergunta EXPLÍCITA (`asking_question`)
// deixa o agente responder antes (o watchdog re-cobra depois). Invariante em
// código (Lei 4), não regra-no-prompt.
// ============================================================================

const posBeat = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
	desireAsked: true,
	motivationAsked: true, // o beat já perguntou o motivo no turno anterior
	currentPersona: "rafael-auto",
	currentCategory: "auto",
	qualifyAnswers: { desiredItem: "kia sportage" },
	...over,
});

describe("FIX-275 — após o beat do motivo, o identify NÃO trava por 'dúvida'", () => {
	it("o gate estrutural é identify (pós-desire, sem consent)", () => {
		expect(nextGate(posBeat(), { hasContactName: true })).toBe("identify");
	});

	it("identify DISPARA com intent=expressing_doubt (o motivo parece queixa, mas é a resposta)", () => {
		expect(
			decideShowGate({ gate: "identify", intent: "expressing_doubt", meta: posBeat(), isUserTurn: true }),
		).toBe(true);
	});

	it("identify dispara também em off_topic / neutral / providing_info", () => {
		for (const intent of ["off_topic", "neutral", "providing_info"] as const) {
			expect(
				decideShowGate({ gate: "identify", intent, meta: posBeat(), isUserTurn: true }),
			).toBe(true);
		}
	});

	it("SÓ uma pergunta explícita (asking_question) deixa o agente responder antes do card", () => {
		expect(
			decideShowGate({ gate: "identify", intent: "asking_question", meta: posBeat(), isUserTurn: true }),
		).toBe(false);
	});

	it("ANTES do beat (motivationAsked ausente), o funil ainda SEGURA pro motivo (não pula o beat)", () => {
		const preBeat = posBeat({ motivationAsked: undefined });
		// shouldAskMotive segura: o motivo ainda não foi perguntado.
		expect(
			decideShowGate({ gate: "identify", intent: "providing_info", meta: preBeat, isUserTurn: true }),
		).toBe(false);
	});

	it("não afeta gates posteriores: com identidade já coletada, o forçar não vale", () => {
		const comId = posBeat({ identityCollected: true, qualifyAnswers: { desiredItem: "x", creditMax: 80_000 } });
		// gate agora é search (não identify); o guard do FIX-275 não interfere.
		expect(nextGate(comId, { hasContactName: true })).toBe("search");
	});
});
