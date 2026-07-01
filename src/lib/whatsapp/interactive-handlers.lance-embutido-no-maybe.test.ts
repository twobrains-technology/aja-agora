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
