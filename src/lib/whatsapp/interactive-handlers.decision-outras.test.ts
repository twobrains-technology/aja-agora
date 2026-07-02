// Camada 1 (FIX-119 / D22) — PARIDADE do "Ver outras opções" no WhatsApp.
//
// Passo 5: "Ver outras opções" é o comparativo DETERMINÍSTICO das ofertas REAIS
// da descoberta (buildOtherOptions — cache do adapter, dedupe, exclui a
// recomendada). O web já obedece (route.ts:521-548 → buildOtherOptions → texto +
// comparison_table). No WhatsApp o botão decision_outras do card de decisão NÃO
// tinha handler e o clique virava texto livre pro modelo (risco de alucinar/
// omitir ofertas). Este teste trava a paridade: decision_outras dispara o mesmo
// caminho model-free e emite o comparison_table com os grupos REAIS.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupSummary } from "@/lib/adapters/types";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-ih-fix119";
const WA = "5562999887766";

const OTHER_GROUPS: GroupSummary[] = [
	{
		id: "g-real-1",
		administradora: "PORTO",
		creditValue: 90_000,
		monthlyPayment: 1_100,
		termMonths: 80,
	} as GroupSummary,
	{
		id: "g-real-2",
		administradora: "ITAU",
		creditValue: 85_000,
		monthlyPayment: 1_050,
		termMonths: 84,
	} as GroupSummary,
];

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue(undefined),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	buildOtherOptions: vi.fn(),
	meta: {} as ConversationMetadata,
	processText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session", () => ({ getOrCreateConversation: vi.fn(async () => ({ id: CONV_ID })) }));
vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
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
	runDirectiveWithOrchestrator: vi.fn(),
	runSearchSummaryWithOrchestrator: vi.fn(),
	fireGate: vi.fn(),
	runTransitionWithOrchestrator: vi.fn(),
}));
vi.mock("./proxy", () => ({
	getHandoffState: vi.fn().mockResolvedValue({ isHandedOff: false }),
	startInterestHandoff: vi.fn(),
}));
vi.mock("@/lib/bevi/other-options", () => ({ buildOtherOptions: mocks.buildOtherOptions }));

import { dispatchInteractiveReply } from "./interactive-handlers";

function dispatch(replyId: string, replyTitle = "Ver outras opções") {
	return dispatchInteractiveReply({
		from: WA,
		replyId,
		replyTitle,
		processTextMessage: mocks.processText,
	});
}

beforeEach(() => {
	for (const m of [
		mocks.sendText,
		mocks.sendInteractive,
		mocks.saveMessage,
		mocks.persistMeta,
		mocks.buildOtherOptions,
		mocks.processText,
	])
		m.mockClear();
	mocks.meta = { currentCategory: "auto" } as ConversationMetadata;
	mocks.buildOtherOptions.mockResolvedValue({
		text: "Claro! Essas são as outras opções que encontrei pro seu perfil — compara com calma:",
		groups: OTHER_GROUPS,
	});
});

afterEach(() => vi.clearAllMocks());

describe("FIX-119 — WhatsApp decision_outras determinístico (paridade route.ts:521-548)", () => {
	it("clicar 'Ver outras opções' é reclamado pelo dispatcher (retorna true), não vira texto livre", async () => {
		const claimed = await dispatch("decision_outras");
		expect(claimed).toBe(true);
		// NÃO delega ao modelo (processTextMessage = turno livre)
		expect(mocks.processText).not.toHaveBeenCalled();
	});

	it("chama buildOtherOptions(conversationId, meta) — mesmo caminho model-free do web", async () => {
		await dispatch("decision_outras");
		expect(mocks.buildOtherOptions).toHaveBeenCalledTimes(1);
		const [convId] = mocks.buildOtherOptions.mock.calls[0] ?? [];
		expect(convId).toBe(CONV_ID);
	});

	it("emite o comparison_table com os grupos REAIS da descoberta (via sendInteractiveMessage)", async () => {
		await dispatch("decision_outras");
		// texto de intro + persistência da mensagem do assistente
		expect(mocks.sendText).toHaveBeenCalledWith(
			WA,
			expect.stringContaining("outras opções que encontrei"),
		);
		expect(mocks.saveMessage).toHaveBeenCalledWith(
			CONV_ID,
			"assistant",
			expect.stringContaining("outras opções"),
			"whatsapp",
		);
		// comparison_table com os grupos reais — a lista interativa cita as adms reais
		expect(mocks.sendInteractive).toHaveBeenCalledTimes(1);
		const interactive = mocks.sendInteractive.mock.calls[0]?.[1] as {
			type: string;
			action?: { sections?: Array<{ rows?: Array<{ id: string }> }> };
		};
		expect(interactive.type).toBe("list");
		const rowIds = interactive.action?.sections?.[0]?.rows?.map((r) => r.id) ?? [];
		expect(rowIds).toContain("group_g-real-1");
		expect(rowIds).toContain("group_g-real-2");
	});

	it("registra o clique do usuário no histórico (recordUserClick)", async () => {
		await dispatch("decision_outras");
		expect(mocks.saveMessage).toHaveBeenCalledWith(
			CONV_ID,
			"user",
			"Ver outras opções",
			"whatsapp",
		);
	});

	it("erro em buildOtherOptions NÃO cai em silêncio nem no modelo — texto de fallback", async () => {
		mocks.buildOtherOptions.mockRejectedValueOnce(new Error("sem outras ofertas no cache"));
		const claimed = await dispatch("decision_outras");
		expect(claimed).toBe(true);
		expect(mocks.processText).not.toHaveBeenCalled();
		expect(mocks.sendText).toHaveBeenCalledWith(
			WA,
			expect.stringMatching(/refazer a busca|instante/i),
		);
	});
});
