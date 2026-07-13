// FIX-325 (rodada 10, veredito Sonnet A.5 + decisão de produto do Kairo,
// AskUserQuestion 2026-07-13): o gate `reco-consent` ("Posso te mostrar a
// opção que eu recomendo?") só reconhecia consentimento via YES_TEXT_MARKERS/
// intent "ready_to_proceed" (FIX-297/308) — quando o usuário respondia
// nomeando uma administradora ESPECÍFICA já exibida no comparison_table (ex.:
// "A Canopus parece boa, parcela baixa"), isso nunca contava como consentimento.
// Consequência (achado ao vivo, dossiê Mario): `recoConsentAnswered` ficava
// PARA SEMPRE undefined, e como `nextGate()` trava TODA a cascata pós-reveal
// atrás dele (timeframe/lance/decision), o funil nunca avançava pela via
// natural de texto — só o clique "Tenho interesse" (fast-path independente em
// route.ts) fechava a conversa, sem nunca passar por decision/two_paths no
// tempo certo. Decisão do Kairo: nomear uma opção já exibida É consentimento
// inequívoco — mesmo mecanismo de resolução por menção já usado em
// resolveOfferMentionForConversation (FIX-258/263), reaproveitado aqui.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

let mockIntent = "neutral";

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual =
		await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>("@/lib/agent/turn-analyzer");
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
			userIntent: mockIntent,
			extraSignals: [],
		})),
	};
});

vi.mock("@/lib/agent/agents", () => {
	function makeAgent(text: string) {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", id: "s0", text };
				})(),
				finishReason: Promise.resolve("stop" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}
	return {
		resolveAgent: vi.fn().mockResolvedValue(makeAgent("Show! Segue com você.")),
		invalidateAgentCache: vi.fn(),
	};
});

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agent/personas-repo", () => ({
	getPersona: vi.fn().mockResolvedValue({
		id: "auto",
		role: "specialist",
		category: "auto",
		isActive: true,
		examples: [],
	}),
}));

const { db } = await import("@/db");
const {
	conversations,
	messages: messagesTable,
	artifacts: artifactsTable,
} = await import("@/db/schema");
const { runTurn } = await import("@/lib/agent/orchestrator");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

const PENDING_RECOMMENDATION_CARD = {
	administradora: "CANOPUS",
	category: "auto",
	creditValue: 90_000,
	termMonths: 72,
	monthlyPayment: 812,
	groupId: "grp-canopus",
};

const COMPARISON_TABLE_PAYLOAD = {
	groups: [
		{ id: "grp-canopus", administradora: "CANOPUS", creditValue: 90_000, termMonths: 72, monthlyPayment: 812 },
		{ id: "grp-itau", administradora: "ITAÚ", creditValue: 92_902, termMonths: 51, monthlyPayment: 2182.01 },
	],
};

function recoConsentPendingMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		qualifyConsented: true,
		currentPersona: "auto",
		currentCategory: "auto",
		experiencePrev: "returning",
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		recoConsentDispatched: true,
		simulatorOfferDispatched: false,
		decisionDispatched: false,
		pendingRecommendationCard: PENDING_RECOMMENDATION_CARD,
		qualifyAnswers: {
			creditMin: 76_500,
			creditMax: 90_000,
		},
		...over,
	};
}

async function seedConversationWithReveal(meta: ConversationMetadata): Promise<string> {
	const [c] = await db.insert(conversations).values({ contactName: "Mario", metadata: meta }).returning();
	const messageId = await db
		.insert(messagesTable)
		.values({
			conversationId: c.id,
			role: "assistant",
			content: "[card: comparison_table]",
			channel: "web",
		})
		.returning({ id: messagesTable.id })
		.then((rows) => rows[0].id);
	await db.insert(artifactsTable).values({
		messageId,
		type: "comparison_table",
		payload: COMPARISON_TABLE_PAYLOAD,
	});
	return c.id;
}

async function drain(conversationId: string, userText: string) {
	const events: Array<{ type: string; artifactType?: string; gate?: string }> = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Mario",
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

describeIfDb("FIX-325 — reco-consent reconhece menção a administradora JÁ EXIBIDA como consentimento", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it('"A Canopus parece boa, parcela baixa" (administradora já exibida) libera o hero e marca recoConsentAnswered', async () => {
		mockIntent = "neutral";
		convId = await seedConversationWithReveal(recoConsentPendingMeta());

		const events = await drain(convId, "A Canopus parece boa, parcela baixa");

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "recommendation_card")).toBe(
			true,
		);

		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = conv?.metadata as ConversationMetadata;
		expect(meta.recoConsentAnswered).toBe(true);
	});

	it("cascata avança pra timeframe/lance/decision no MESMO fio depois da menção reconhecida (não fica presa em reco-consent)", async () => {
		mockIntent = "neutral";
		convId = await seedConversationWithReveal(recoConsentPendingMeta());

		await drain(convId, "A Canopus parece boa, parcela baixa");

		const { nextGate } = await import("@/lib/agent/qualify-state");
		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = conv?.metadata as ConversationMetadata;
		expect(nextGate(meta, { hasContactName: true })).not.toBe("reco-consent");
	});

	it("regressão — texto SEM menção a administradora exibida (ambíguo) NÃO conta como consentimento", async () => {
		mockIntent = "neutral";
		convId = await seedConversationWithReveal(recoConsentPendingMeta());

		const events = await drain(convId, "como assim, me explica melhor essa recomendação?");

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "recommendation_card")).toBe(
			false,
		);
		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = conv?.metadata as ConversationMetadata;
		expect(meta.recoConsentAnswered ?? false).toBe(false);
	});

	it("regressão — administradora mencionada mas NUNCA exibida não conta como consentimento (nunca ancora no escuro)", async () => {
		mockIntent = "neutral";
		convId = await seedConversationWithReveal(recoConsentPendingMeta());

		const events = await drain(convId, "queria uma da Embracon, tem?");

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "recommendation_card")).toBe(
			false,
		);
		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = conv?.metadata as ConversationMetadata;
		expect(meta.recoConsentAnswered ?? false).toBe(false);
	});
});
