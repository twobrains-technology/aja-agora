// FIX-301 (P7, loop-de-goal r10) — "na entendi" ... "uai nao sei voce nao me
// perguntou nada": o agente abria um menu genérico e repetia, ou dissertava
// fora de escopo, em vez de reancorar no gate REALMENTE pendente. `gateAwaitingReply`
// é a função PURA que decide pra ONDE reancorar — cobre tanto os gates guiados
// por dado (credit/lance/identify/…, onde nextGate() já aponta certo) quanto o
// caso especial `decision` (nextGate() avança pra "search" assim que o card é
// dispatched, mesmo que o usuário ainda não tenha respondido a ele).

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { gateAwaitingReply } from "./qualify-state";

describe("FIX-301 — gateAwaitingReply: pra onde reancorar quando o usuário está confuso", () => {
	it("gate decision JÁ DISPATCHED (usuário confuso respondendo ao próprio card) → 'decision'", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			experiencePrev: "returning",
			qualifyAnswers: { creditMax: 120_000, prazoMeses: 24, hasLance: "no", lanceEmbutido: false },
			simulatorOfferDispatched: true,
			decisionDispatched: true,
		};
		expect(gateAwaitingReply(meta, true)).toBe("decision");
	});

	it("contractClosed=true (pós-fechamento) → null, mesmo com decisionDispatched (estado terminal, nada a reancorar)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			experiencePrev: "returning",
			qualifyAnswers: { creditMax: 120_000, prazoMeses: 24, hasLance: "no", lanceEmbutido: false },
			simulatorOfferDispatched: true,
			decisionDispatched: true,
			contractClosed: true,
		};
		expect(gateAwaitingReply(meta, true)).toBe(null);
	});

	it("gate de COLETA pendente (credit ainda sem valor) → devolve 'credit' (nextGate puro já aponta certo)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
		};
		expect(gateAwaitingReply(meta, true)).toBe("credit");
	});

	it("gate 'identify' pendente → devolve 'identify'", () => {
		// FIX-296 (rodada 10) reordenou o funil: credit vem ANTES de identify
		// agora (valor do bem antes do CPF). Pra isolar "identify pendente" tem
		// que fixar o credit já respondido — senão nextGate para em "credit".
		const meta: ConversationMetadata = {
			desireAsked: true,
			qualifyAnswers: { creditMax: 120_000 },
		};
		expect(gateAwaitingReply(meta, true)).toBe("identify");
	});

	it("gate 'name' (hasContactName=false) → null (sem pergunta canônica re-apresentável)", () => {
		expect(gateAwaitingReply({}, false)).toBe(null);
	});

	it("gate 'doubts-wait' (pendingFollowUp) → null (é um 'aguarde', não uma pergunta)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			pendingFollowUp: true,
		};
		expect(gateAwaitingReply(meta, true)).toBe(null);
	});

	it("gate 'search' (terminal, sem mais nada pendente) → null (ação, não pergunta)", () => {
		const meta: ConversationMetadata = {
			desireAsked: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			experiencePrev: "returning",
			// FIX-297 (rodada 10): reco-consent é um gate novo entre experience e
			// timeframe/decision — pra este fixture continuar simulando "terminal,
			// tudo já resolvido", precisa marcar como já dispatched (senão nextGate
			// para em "reco-consent" antes de chegar no terminal real).
			recoConsentDispatched: true,
			qualifyAnswers: { creditMax: 120_000, prazoMeses: 24, hasLance: "no", lanceEmbutido: false },
			simulatorOfferDispatched: true,
			decisionDispatched: true,
			contractClosed: true,
		};
		expect(gateAwaitingReply(meta, true)).toBe(null);
	});
});
