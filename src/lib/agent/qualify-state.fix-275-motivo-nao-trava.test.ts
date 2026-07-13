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
// Root cause original: o motivo do cliente é quase sempre uma QUEIXA ("cansei
// do carro velho", "o aluguel tá caro") → o analyzer classifica como
// `expressing_doubt` (ou off_topic) → o decideShowGate suprimia o gate real.
//
// FIX-296 (rodada 10, 2026-07-12) SUBSTITUI a solução original (que forçava o
// card de identidade no MESMO turno do motivo) por um beat de ESPELHO+OBJETIVO
// dedicado (`shouldMirrorMotivation`): a resposta ao motivo NUNCA mais dispara
// um card no mesmo turno — ela ganha só o espelho (sem competir com nenhum
// gate, seja identify OU credit). O gate REAL (credit, pós-FIX-296) dispara no
// turno SEGUINTE, quando `motivationMirrored` já estiver true. Este arquivo
// prova que o não-travamento se mantém com o novo mecanismo.
// ============================================================================

const posMotivo = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
	desireAsked: true,
	desireAnswered: true, // FIX-285: proxy determinístico (não mais o desiredItem)
	motivationAsked: true, // o beat já perguntou o motivo no turno anterior
	currentPersona: "rafael-auto",
	currentCategory: "auto",
	qualifyAnswers: { desiredItem: "kia sportage", motivation: "carro velho, vive na oficina" },
	...over,
});

describe("FIX-275/FIX-296 — resposta ao motivo NUNCA trava o funil, mesmo classificada como 'dúvida'", () => {
	it("o gate estrutural pós-motivo é credit (reversão FIX-53, sem consent)", () => {
		expect(nextGate(posMotivo(), { hasContactName: true })).toBe("credit");
	});

	it("ANTES do beat de espelho rodar (motivationMirrored ausente), o funil SEGURA o credit — mesmo em intent de queixa (não é trava, é o beat pendente)", () => {
		const meta = posMotivo();
		for (const intent of ["expressing_doubt", "off_topic", "neutral", "providing_info"] as const) {
			expect(
				decideShowGate({ gate: "credit", intent, meta, isUserTurn: true }),
				`intent=${intent}`,
			).toBe(false);
		}
	});

	it("DEPOIS do beat de espelho (motivationMirrored=true), credit dispara normalmente (gate de coleta, FIX-208): neutral/providing_info avançam, dúvida/pergunta/off-topic deixam o agente conversar", () => {
		const meta = posMotivo({ motivationMirrored: true });
		for (const intent of ["neutral", "providing_info"] as const) {
			expect(
				decideShowGate({ gate: "credit", intent, meta, isUserTurn: true }),
				`intent=${intent}`,
			).toBe(true);
		}
		for (const intent of ["expressing_doubt", "off_topic", "asking_question"] as const) {
			expect(
				decideShowGate({ gate: "credit", intent, meta, isUserTurn: true }),
				`intent=${intent}`,
			).toBe(false);
		}
	});

	it("SÓ uma pergunta explícita (asking_question) deixa o agente responder antes do card, mesmo pós-beat", () => {
		const meta = posMotivo({ motivationMirrored: true });
		expect(
			decideShowGate({ gate: "credit", intent: "asking_question", meta, isUserTurn: true }),
		).toBe(false);
	});

	it("ANTES do motivo ter sido perguntado (motivationAsked ausente), o funil ainda SEGURA pro beat de pergunta (shouldAskMotive)", () => {
		const preBeat = posMotivo({ motivationAsked: false, qualifyAnswers: { desiredItem: "x" } });
		expect(
			decideShowGate({ gate: "credit", intent: "providing_info", meta: preBeat, isUserTurn: true }),
		).toBe(false);
	});

	it("não afeta gates posteriores: com valor+identidade já coletados, o guard do FIX-296 não interfere", () => {
		const comTudo = posMotivo({
			motivationMirrored: true,
			identityCollected: true,
			qualifyAnswers: { desiredItem: "x", creditMax: 80_000 },
		});
		// gate agora é search (não credit/identify); o guard não interfere.
		expect(nextGate(comTudo, { hasContactName: true })).toBe("search");
	});
});
