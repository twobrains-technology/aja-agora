// Camada 1 (FIX-118 / D19) — PARIDADE FIX-92 no canal WhatsApp.
//
// Jornada canônica (Passo 2): a educação de lance embutido vale pra QUALQUER
// resposta (Sim/Não/Talvez) — o próprio texto mira quem NÃO tem o valor do lance
// hoje. O web já obedece (route.ts:917-928: yes reage; no/maybe → gate
// lance-embutido antes da busca — FIX-92). O WhatsApp pulava a educação pro
// no/maybe (handleLance:357 caía direto em runSearchSummaryWithOrchestrator).
//
// Este teste trava a paridade: no/maybe disparam o gate lance-embutido ANTES da
// busca; a busca só roda depois do opt-in (handleLanceEmbutido). O ramo yes
// segue reagindo (buildLanceReactionDirective) intocado.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-ih-fix118";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	runDirective: vi.fn().mockResolvedValue(undefined),
	runSearchSummary: vi.fn().mockResolvedValue(undefined),
	fireGate: vi.fn().mockResolvedValue(undefined),
	runTransition: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	meta: {} as ConversationMetadata,
	processText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session", () => ({ getOrCreateConversation: vi.fn(async () => ({ id: CONV_ID })) }));
vi.mock("./api", () => ({
	sendTextMessage: vi.fn().mockResolvedValue(undefined),
	sendInteractiveMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/conversation/meta", () => ({
	metaOf: () => mocks.meta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: vi.fn(async () => ({ id: CONV_ID, metadata: mocks.meta })) },
		},
	},
}));
vi.mock("./adapter", () => ({
	runDirectiveWithOrchestrator: mocks.runDirective,
	runSearchSummaryWithOrchestrator: mocks.runSearchSummary,
	fireGate: mocks.fireGate,
	runTransitionWithOrchestrator: mocks.runTransition,
}));
vi.mock("./proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	startInterestHandoff: vi.fn(),
}));

import { dispatchInteractiveReply } from "./interactive-handlers";

function dispatch(replyId: string, replyTitle = "x") {
	return dispatchInteractiveReply({
		from: WA,
		replyId,
		replyTitle,
		processTextMessage: mocks.processText,
	});
}

beforeEach(() => {
	for (const m of [
		mocks.runDirective,
		mocks.runSearchSummary,
		mocks.fireGate,
		mocks.saveMessage,
		mocks.persistMeta,
		mocks.processText,
	])
		m.mockClear();
	mocks.meta = { currentCategory: "auto" } as ConversationMetadata;
});

afterEach(() => vi.clearAllMocks());

describe("FIX-118 — WhatsApp educação de lance embutido pra no/maybe (paridade FIX-92)", () => {
	it("'Por enquanto não' (lance_no) dispara o gate lance-embutido ANTES da busca", async () => {
		await dispatch("lance_no", "Por enquanto não");
		expect(mocks.fireGate).toHaveBeenCalledTimes(1);
		const [, , gate] = mocks.fireGate.mock.calls[0] ?? [];
		expect(gate).toBe("lance-embutido");
		// a busca NÃO roda agora — só depois do opt-in (handleLanceEmbutido)
		expect(mocks.runSearchSummary).not.toHaveBeenCalled();
	});

	it("'Talvez, depende' (lance_maybe) também dispara o gate lance-embutido, não a busca", async () => {
		await dispatch("lance_maybe", "Talvez, depende");
		expect(mocks.fireGate).toHaveBeenCalledTimes(1);
		expect(mocks.fireGate.mock.calls[0]?.[2]).toBe("lance-embutido");
		expect(mocks.runSearchSummary).not.toHaveBeenCalled();
	});

	it("'Sim, tenho reserva' (lance_yes) segue reagindo (buildLanceReactionDirective), sem pular pro gate/busca", async () => {
		await dispatch("lance_yes", "Sim, tenho reserva");
		expect(mocks.runDirective).toHaveBeenCalledTimes(1);
		// o ramo yes NÃO chama fireGate lance-embutido direto nem a busca
		expect(mocks.fireGate).not.toHaveBeenCalled();
		expect(mocks.runSearchSummary).not.toHaveBeenCalled();
	});

	it("persiste hasLance no qualifyAnswers em todos os ramos", async () => {
		await dispatch("lance_no", "Por enquanto não");
		const persisted = mocks.persistMeta.mock.calls.find(
			(c) => (c[1] as ConversationMetadata)?.qualifyAnswers?.hasLance === "no",
		);
		expect(persisted).toBeTruthy();
	});
});

// FIX-215 (Ata 2026-07-04) — a conversa de lance inteira (incluindo este 2º
// passo, o opt-in de lance embutido) só acontece PÓS-reveal agora. Resolver o
// lance-embutido não pode mais re-disparar a busca (ela JÁ ocorreu) — tem que
// despachar o próximo passo REAL da sequência (simulator-offer/decision),
// espelhando a mesma correção feita no handler web (route.ts).
describe("FIX-215 — lance-embutido pós-reveal despacha o PRÓXIMO gate, nunca re-busca", () => {
	it("'Sem lance embutido' pós-reveal → fireGate('simulator-offer'), NUNCA runSearchSummaryWithOrchestrator", async () => {
		mocks.meta = {
			desireAsked: true,
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			// FIX-297/FIX-308: reco-consent precisa estar RESPONDIDO pra nextGate
			// cruzar timeframe/lance até chegar em "simulator-offer".
			recoConsentDispatched: true,
			recoConsentAnswered: true,
			qualifyAnswers: { creditMax: 200_000, prazoMeses: 0, hasLance: "no" },
		} as ConversationMetadata;

		await dispatch("lanceembutido_no", "Sem lance embutido");

		expect(mocks.runSearchSummary).not.toHaveBeenCalled();
		expect(mocks.fireGate).toHaveBeenCalledTimes(1);
		// 2026-07-21 (Kairo, validando ao vivo): quem respondeu "não" ao lance NÃO
		// leva o simulador de contemplação atrás — ele existe pra quem quer
		// ANTECIPAR. Depois da recusa, o próximo passo é a DECISÃO.
		expect(mocks.fireGate.mock.calls[0]?.[2]).toBe("decision");
	});

	it("'Sim, considerar' pós-reveal → também despacha simulator-offer, não a busca", async () => {
		mocks.meta = {
			desireAsked: true,
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			recoConsentDispatched: true,
			recoConsentAnswered: true,
			qualifyAnswers: { creditMax: 200_000, prazoMeses: 0, hasLance: "yes", lanceValue: 30_000 },
		} as ConversationMetadata;

		await dispatch("lanceembutido_yes", "Sim, considerar");

		expect(mocks.runSearchSummary).not.toHaveBeenCalled();
		expect(mocks.fireGate).toHaveBeenCalledTimes(1);
		expect(mocks.fireGate.mock.calls[0]?.[2]).toBe("simulator-offer");
	});
	// FIX-215 concern-3 (revisão adversarial): o simulator-offer despachado por
	// AQUI (handleLanceEmbutido), e não via index.ts, precisa MARCAR o dispatch —
	// senão, se o usuário responder o card por TEXTO, nextGate recomputaria
	// simulator-offer com a flag ainda false e o card sairia 2× (o "sim" ignorado).
	it("idempotência: ao despachar o gate, persiste a flag de dispatch e a passa pro fireGate", async () => {
		mocks.meta = {
			desireAsked: true,
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			recoConsentDispatched: true,
			recoConsentAnswered: true,
			qualifyAnswers: { creditMax: 200_000, prazoMeses: 0, hasLance: "no" },
		} as ConversationMetadata;

		await dispatch("lanceembutido_no", "Sem lance embutido");

		expect(mocks.fireGate.mock.calls[0]?.[2]).toBe("decision");
		const firedMeta = mocks.fireGate.mock.calls[0]?.[3] as ConversationMetadata;
		expect(firedMeta?.decisionDispatched).toBe(true);
		const persistedWithFlag = mocks.persistMeta.mock.calls.some(
			(c) => (c[1] as ConversationMetadata)?.decisionDispatched === true,
		);
		expect(persistedWithFlag).toBe(true);
	});
});
