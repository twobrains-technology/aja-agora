// FIX-301 (P7, loop-de-goal r10) — "na entendi" ... "uai nao sei voce nao me
// perguntou nada": o agente abria um menu genérico (vetor do FIX-300) ou
// repetia o mesmo card sem reconhecer a confusão. Este teste prova que o
// turno REANCORA no MESMO gate/card, com um lead-in simplificado, ANTES de
// invocar a LLM (Lei 4 — o short-circuit acontece cedo, resolveAgent nunca é
// chamado; se fosse chamado DEPOIS, o texto livre já teria streamado).

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

let mockIntent = "confused";

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return {
		...actual,
		analyzeTurn: vi.fn().mockImplementation(async () => ({
			reasoning: "test",
			detectedCategory: null,
			detectedSubTopic: null,
			isExplicitSwitch: false,
			expertiseLevel: "neutro",
			experiencePrev: null,
			creditMin: null,
			creditMax: null,
			prazoMeses: null,
			hasLance: null,
			desiredItem: null,
			motivation: null,
			monthlySavings: null,
			fgtsValue: null,
			userIntent: mockIntent,
		})),
	};
});

// Se o short-circuit FALHAR e o turno chegar a invocar a LLM, este mock
// devolve texto fabricado — prova negativa: se o texto do teste bater com
// isso, o short-circuit não aconteceu.
const FABRICATED_TEXT = "Deixa eu te explicar tudo sobre consórcio do zero...";

const resolveAgentMock = vi.fn().mockResolvedValue({
	stream: async () => ({
		fullStream: (async function* () {
			yield { type: "text-delta", id: "s0", text: FABRICATED_TEXT };
		})(),
		finishReason: Promise.resolve("stop" as const),
		providerMetadata: Promise.resolve({}),
	}),
});
vi.mock("@/lib/agent/agents", () => ({
	resolveAgent: (...args: unknown[]) => resolveAgentMock(...args),
	invalidateAgentCache: vi.fn(),
}));

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { db } = await import("@/db");
const {
	conversations,
	messages: messagesTable,
	artifacts: artifactsTable,
} = await import("@/db/schema");
const { runTurn } = await import("@/lib/agent/orchestrator");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

const DECISION_PENDING_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "auto",
	currentCategory: "auto",
	experiencePrev: "returning",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	recommendedAdministradora: "CANOPUS",
	qualifyAnswers: {
		creditMin: 76_500,
		creditMax: 90_000,
		prazoMeses: 72,
		hasLance: "no",
		lanceEmbutido: false,
	},
	simulatorOfferDispatched: true,
	decisionDispatched: true,
	contractClosed: false,
};

const CREDIT_PENDING_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "auto",
	currentCategory: "auto",
	identityCollected: true,
	// qualifyAnswers.creditMax AUSENTE de propósito — nextGate() devolve "credit".
};

type DrainedEvent = { type: string; artifactType?: string; gate?: string };

async function drain(conversationId: string, userText: string): Promise<DrainedEvent[]> {
	const events: DrainedEvent[] = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Kairo",
		skipLeadCollection: true,
	});
	for await (const ev of gen) {
		events.push(
			ev.type === "artifact"
				? { type: ev.type, artifactType: ev.artifactType }
				: ev.type === "gate"
					? { type: ev.type, gate: ev.gate }
					: { type: ev.type },
		);
	}
	return events;
}

async function seed(meta: ConversationMetadata): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Kairo", channel: "web", metadata: meta })
		.returning();
	return c.id;
}

async function cleanup(convId: string): Promise<void> {
	const msgs = await db
		.select({ id: messagesTable.id })
		.from(messagesTable)
		.where(eq(messagesTable.conversationId, convId));
	const ids = msgs.map((m) => m.id);
	if (ids.length > 0) {
		await db.delete(artifactsTable).where(inArray(artifactsTable.messageId, ids));
	}
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describeIfDb("FIX-301 — clarify: usuário confuso reancora no MESMO gate, sem invocar a LLM", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("'não entendi' no gate decision (já dispatched) → reapresenta o card decision_prompt, LLM NUNCA invocada", async () => {
		mockIntent = "confused";
		convId = await seed(DECISION_PENDING_META);

		const events = await drain(convId, "não entendi");

		expect(resolveAgentMock).not.toHaveBeenCalled();
		expect(events.some((e) => e.type === "artifact" && e.artifactType === "decision_prompt")).toBe(
			true,
		);
		expect(events.some((e) => e.type === "text-delta")).toBe(true);

		const rows = await db
			.select({ content: messagesTable.content, role: messagesTable.role })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		expect(rows.some((m) => m.role === "user" && m.content === "não entendi")).toBe(true);
		expect(rows.some((m) => m.content === FABRICATED_TEXT)).toBe(false);
	});

	it("'não entendi' com gate de COLETA pendente (credit) → reemite o MESMO gate, LLM NUNCA invocada", async () => {
		mockIntent = "confused";
		convId = await seed(CREDIT_PENDING_META);

		const events = await drain(convId, "não entendi, como assim?");

		expect(resolveAgentMock).not.toHaveBeenCalled();
		expect(events.some((e) => e.type === "gate" && e.gate === "credit")).toBe(true);
	});

	it("intent NÃO confuso (providing_info) no mesmo estado → NÃO short-circuita, turno segue normal", async () => {
		mockIntent = "providing_info";
		convId = await seed(DECISION_PENDING_META);

		const events = await drain(convId, "sim, faz sentido");

		expect(resolveAgentMock).toHaveBeenCalled();
		expect(events.some((e) => e.type === "text-delta")).toBe(true);
	});

	// Regressão do gate da onda 1 (rodada 10): a 1ª versão deste fix reusava
	// `expressing_doubt` como sinal de confusão e quebrou o FIX-266 (r9) — "deixa
	// eu pensar aqui" é expressing_doubt POR DESIGN (hesitação sobre decisão que
	// entende), não confusão sobre a pergunta. Prova que hesitação NÃO short-
	// circuita — só `confused` (intent distinta) reancora.
	it("intent expressing_doubt (hesitação — 'deixa eu pensar', NÃO confusão) → NÃO short-circuita, turno segue normal", async () => {
		mockIntent = "expressing_doubt";
		convId = await seed(DECISION_PENDING_META);

		const events = await drain(convId, "deixa eu pensar aqui");

		expect(resolveAgentMock).toHaveBeenCalled();
		expect(events.some((e) => e.type === "text-delta")).toBe(true);
	});
});
