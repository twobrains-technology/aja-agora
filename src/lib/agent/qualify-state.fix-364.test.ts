// FIX-364 (bloco-h-resume-mesa) — `nextGate` não fazia short-circuit quando o
// contrato já fechou (`meta.contractClosed === true`): a cascata de
// qualificação (credit/lance/decision/...) rodava por cima do estado
// terminal sempre que algum flag intermediário não estava marcado no meta
// reidratado (ex.: resume server-side, `src/lib/chat/resume.ts`) — o cliente
// que já fechou a proposta e voltava ("Voltei") recebia de novo a pergunta
// "com lance ou só sorteio mesmo?" como se a jornada não tivesse terminado.
// Regressão: contrato fechado é SEMPRE terminal, ANTES de qualquer outro gate.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";

describe("FIX-364 — nextGate nunca re-emite gate de qualificação com contrato fechado", () => {
	it("meta mínimo (só contractClosed) não re-emite name/desire/credit — devolve terminal", () => {
		const meta: ConversationMetadata = { contractClosed: true };
		expect(nextGate(meta, { hasContactName: false })).not.toBe("name");
		expect(nextGate(meta)).not.toBe("credit");
		expect(nextGate(meta)).not.toBe("decision");
		expect(nextGate(meta)).not.toBe("lance");
	});

	it("jornada completa com contractClosed=true, mas hasLance nunca resolvido (meta reidratado incompleto) — não reabre a conversa de lance/decisão", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			experiencePrev: "returning",
			decisionDispatched: true,
			escolha: { origem: "mencao" },
			contractFormDispatched: true,
			contractClosed: true,
			qualifyAnswers: {
				// hasLance/lanceValue/lanceEmbutido nunca chegaram a ser persistidos
				// neste snapshot — é exatamente o estado que fazia a cascata antiga
				// cair em "lance"/"decision" por cima do fechamento.
				creditMax: 80_000,
				creditMin: 60_000,
			},
		};
		const gate = nextGate(meta, { hasContactName: true });
		expect(gate).not.toBe("lance");
		expect(gate).not.toBe("lance-value");
		expect(gate).not.toBe("lance-embutido");
		expect(gate).not.toBe("decision");
		expect(gate).not.toBe("simulator-offer");
		expect(gate).not.toBe("contract");
	});

	it("contrato NÃO fechado com o mesmo meta incompleto segue a cascata normal (garante que o short-circuit é exclusivo de contractClosed)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			experiencePrev: "returning",
			escolha: { origem: "mencao" },
			qualifyAnswers: { creditMax: 80_000, creditMin: 60_000, prazoMeses: 24 },
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("lance");
	});
});
