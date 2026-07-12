import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate, shouldAskMotive } from "./qualify-state";

// ============================================================================
// FIX-274 (Kairo, teste manual web 2026-07-11 — decisão "Remover, fiel ao
// mockup"): o passo de CONSENT ("Posso te fazer 3 perguntinhas pra entender seu
// perfil?" + botões Bora!/Entender mais antes) SAI do funil. Ele causava:
//   (CK-1) DUAS perguntas no mesmo balão — o consent colidia com o "por que
//          agora?" (motivo, 2ª pergunta do gate desire);
//   (CK-2) a dúvida de consórcio cedo demais — o botão "Entender mais antes".
// No mockup/handoff, depois de "qual carro" + "por que agora" a conversa vai
// DIRETO pro valor/identidade; a explicação/dúvidas de consórcio fica no passo
// PÓS-busca (gate `experience`, FIX-233 D1).
//
// Pra o "por que agora" nunca colidir com o próximo card, o motivo passa a ter
// turno próprio: `shouldAskMotive` segura o funil UMA vez (o LLM pergunta o
// motivo via desireFollowUpSection), e é NÃO-bloqueante (se o motivo não vier,
// `motivationAsked` deixa o funil seguir).
// ============================================================================

const base: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "rafael-auto",
	currentCategory: "auto",
};

describe("FIX-274 — o gate consent saiu do funil", () => {
	it("nextGate NUNCA retorna 'consent' em nenhum estado pré-identify", () => {
		const estados: ConversationMetadata[] = [
			{ ...base },
			{ ...base, qualifyAnswers: { desiredItem: "sportage", motivation: "cansei" }, motivationAsked: true },
			{
				...base,
				identityCollected: true,
				motivationAsked: true,
				qualifyAnswers: { desiredItem: "x", motivation: "y" },
			},
		];
		for (const meta of estados) {
			expect(nextGate(meta, { hasContactName: true })).not.toBe("consent");
		}
	});

	it("após o desire, o próximo gate estrutural é identify (não mais consent)", () => {
		const meta: ConversationMetadata = {
			...base,
			motivationAsked: true,
			qualifyAnswers: { desiredItem: "sportage", motivation: "cansei" },
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("identify");
	});
});

describe("FIX-274 — o motivo ('por que agora') tem turno próprio (nunca colide)", () => {
	it("com desiredItem capturado e motivo pendente, o funil SEGURA — não emite o próximo card", () => {
		const meta: ConversationMetadata = {
			...base,
			qualifyAnswers: { desiredItem: "kia sportage" }, // motivation ausente
		};
		// O gate estrutural seguinte já é identify (consent removido)...
		expect(nextGate(meta, { hasContactName: true })).toBe("identify");
		// ...mas o motivo tem prioridade: o LLM pergunta "por que agora" NESTE turno,
		// e o card de identidade NÃO é emitido junto (evita 2 perguntas / colisão).
		expect(shouldAskMotive(meta)).toBe(true);
		expect(
			decideShowGate({ gate: "identify", intent: "neutral", meta, isUserTurn: true }),
		).toBe(false);
	});

	it("com o motivo já capturado, o identify DISPARA normalmente", () => {
		const meta: ConversationMetadata = {
			...base,
			qualifyAnswers: { desiredItem: "sportage", motivation: "cansei do carro velho" },
		};
		expect(shouldAskMotive(meta)).toBe(false);
		expect(
			decideShowGate({ gate: "identify", intent: "neutral", meta, isUserTurn: true }),
		).toBe(true);
	});

	it("NÃO bloqueia: se o motivo foi perguntado uma vez (motivationAsked) e não veio, o funil segue", () => {
		const meta: ConversationMetadata = {
			...base,
			motivationAsked: true,
			qualifyAnswers: { desiredItem: "sportage" }, // motivation ainda ausente
		};
		expect(shouldAskMotive(meta)).toBe(false);
		expect(
			decideShowGate({ gate: "identify", intent: "neutral", meta, isUserTurn: true }),
		).toBe(true);
	});

	it("não dispara o beat do motivo antes de ter o desiredItem", () => {
		const meta: ConversationMetadata = { ...base }; // sem desiredItem
		expect(shouldAskMotive(meta)).toBe(false);
	});
});
