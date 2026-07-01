// Camada 1 (FIX-117 / D18) — PARIDADE FIX-38 no canal WhatsApp.
//
// "Tenho interesse" pós-reveal é AVANÇO DIRETO ao contract nos dois canais. O
// FIX-38 removeu a dupla confirmação no web (route.ts:485-499): marca
// decisionDispatched (a tool-policy só libera present_contract_form na fase
// "closing") e SEMPRE dispara buildAdvanceToContractDirective — sem intercalar
// o card de decisão. O WhatsApp reproduzia o comportamento pré-FIX-38
// (interactive-handlers.ts:580: 1º interesse emitia o card; só o 2º avançava).
//
// Este teste trava a paridade: o 1º "Tenho interesse" já avança ao contract.
// O card de decisão fica SÓ nos caminhos ambíguos (handleSimulatorOffer "no"),
// intocados por este fix.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-ih-fix117";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	runDirective: vi.fn().mockResolvedValue(undefined),
	runSearchSummary: vi.fn().mockResolvedValue(undefined),
	fireGate: vi.fn().mockResolvedValue(undefined),
	runTransition: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	startInterestHandoff: vi.fn().mockResolvedValue(undefined),
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
	getHandoffState: mocks.getHandoffState,
	startInterestHandoff: mocks.startInterestHandoff,
}));

import { dispatchInteractiveReply } from "./interactive-handlers";

function dispatch(replyId: string, replyTitle = "Tenho interesse!") {
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
		mocks.getHandoffState,
		mocks.processText,
	])
		m.mockClear();
	mocks.getHandoffState.mockResolvedValue({ isHandedOff: false });
	mocks.meta = { recommendedAdministradora: "ANCORA" } as ConversationMetadata;
});

afterEach(() => vi.clearAllMocks());

describe("FIX-117 — WhatsApp 'Tenho interesse' = avanço direto ao contract (paridade FIX-38)", () => {
	it("1º interesse (decisionDispatched=false) dispara buildAdvanceToContractDirective, NÃO o card de decisão", async () => {
		mocks.meta = {
			recommendedAdministradora: "ANCORA",
			decisionDispatched: false,
		} as ConversationMetadata;

		const claimed = await dispatch("interest_g1");
		expect(claimed).toBe(true);

		expect(mocks.runDirective).toHaveBeenCalledTimes(1);
		const directive = mocks.runDirective.mock.calls[0]?.[0]?.directive as string;
		// buildAdvanceToContractDirective → present_contract_form (fechamento direto)
		expect(directive).toContain("present_contract_form");
		// NÃO o card de decisão (buildDecisionPromptDirective → present_decision_prompt)
		expect(directive).not.toContain("present_decision_prompt");
	});

	it("marca decisionDispatched=true ANTES de avançar (espelha route.ts:488-490 — tool-policy)", async () => {
		mocks.meta = {
			recommendedAdministradora: "ANCORA",
			decisionDispatched: false,
		} as ConversationMetadata;

		await dispatch("interest_g1");

		const marked = mocks.persistMeta.mock.calls.some(
			(c) => (c[1] as ConversationMetadata | undefined)?.decisionDispatched === true,
		);
		expect(marked, "decisionDispatched deve ser persistido como true").toBe(true);
	});

	it("registra o clique do usuário no histórico (recordUserClick)", async () => {
		await dispatch("interest_g1");
		expect(mocks.saveMessage).toHaveBeenCalledWith(CONV_ID, "user", "Tenho interesse!", "whatsapp");
	});

	it("já com decisão dada (decisionDispatched=true) segue avançando ao contract (idempotente)", async () => {
		mocks.meta = {
			recommendedAdministradora: "ANCORA",
			decisionDispatched: true,
		} as ConversationMetadata;

		await dispatch("interest_g1");
		expect(mocks.runDirective).toHaveBeenCalledTimes(1);
		const directive = mocks.runDirective.mock.calls[0]?.[0]?.directive as string;
		expect(directive).toContain("present_contract_form");
		expect(directive).not.toContain("present_decision_prompt");
	});

	it("conversa já com atendente humano NÃO dispara o funil (relay cuida)", async () => {
		mocks.getHandoffState.mockResolvedValue({ isHandedOff: true });
		const claimed = await dispatch("interest_g1");
		expect(claimed).toBe(false);
		expect(mocks.runDirective).not.toHaveBeenCalled();
	});
});
