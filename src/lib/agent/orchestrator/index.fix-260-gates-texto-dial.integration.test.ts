// FIX-260 (rodada 5, veredito Fable r4, regressões) — dois gates respondidos
// por TEXTO LIVRE não avançavam corretamente:
// 1. lance-embutido: só o clique (route.ts) consumia a resposta — texto livre
//    deixava nextGate() preso em "lance-embutido" pra sempre, reemitindo o
//    card embedded_bid + a educação a cada turno (loop até clicar).
// 2. simulator-offer: "Quero ver sim!" (texto) pulava o dial — o gate já
//    tinha sido marcado "dispatched" na EMISSÃO (padrão consent), então o
//    texto seguinte caía direto no gate "decision", sem nunca chamar o
//    directive do simulador (só o clique disparava present_contemplation_dial).

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

let mockIntent = "providing_info";

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
		resolveAgent: vi.fn().mockResolvedValue(makeAgent("Beleza, seguindo com você.")),
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

const LANCE_EMBUTIDO_PENDING_META: ConversationMetadata = {
	desireAsked: true,
	qualifyConsented: true,
	currentPersona: "auto",
	currentCategory: "auto",
	experiencePrev: "returning",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	simulatorOfferDispatched: false,
	decisionDispatched: false,
	recommendedAdministradora: "CANOPUS",
	recommendedOffer: {
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		termMonths: 72,
		monthlyPayment: 812,
		groupId: "grupo-real-abc",
	},
	qualifyAnswers: {
		creditMin: 76_500,
		creditMax: 90_000,
		prazoMeses: 72,
		hasLance: "no",
		// lanceEmbutido AUSENTE de propósito — nextGate() devolve "lance-embutido".
	},
};

const SIMULATOR_OFFER_PENDING_META: ConversationMetadata = {
	...LANCE_EMBUTIDO_PENDING_META,
	simulatorOfferDispatched: true,
	qualifyAnswers: {
		...LANCE_EMBUTIDO_PENDING_META.qualifyAnswers,
		lanceEmbutido: false,
	},
};

async function drain(conversationId: string, userText: string) {
	const events: Array<{ type: string; artifactType?: string; gate?: string }> = [];
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

describeIfDb("FIX-260 — gates lance-embutido/simulator-offer respondidos por TEXTO", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("lance-embutido por TEXTO ('considero sim') CONSOME o gate — nextGate avança, sem loop", async () => {
		mockIntent = "providing_info";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: LANCE_EMBUTIDO_PENDING_META })
			.returning();
		convId = c.id;

		const events = await drain(convId, "considero sim, quero usar o lance embutido");

		// Consumido: o próximo gate NUNCA é "lance-embutido" de novo (senão é loop).
		const gateEvents = events.filter((e) => e.type === "gate");
		expect(gateEvents.some((e) => e.gate === "lance-embutido")).toBe(false);

		const [row] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, convId));
		const meta = row.metadata as ConversationMetadata;
		expect(meta.qualifyAnswers?.lanceEmbutido).toBe(true);
	});

	it("lance-embutido por TEXTO ('agora não quero') CONSOME como recusa — sem loop", async () => {
		mockIntent = "providing_info";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: LANCE_EMBUTIDO_PENDING_META })
			.returning();
		convId = c.id;

		await drain(convId, "agora não, obrigado");

		const [row] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, convId));
		const meta = row.metadata as ConversationMetadata;
		expect(meta.qualifyAnswers?.lanceEmbutido).toBe(false);
	});

	it("simulator-offer por TEXTO ('Quero ver sim!') dispara o directive do dial — NÃO pula direto pro gate decision", async () => {
		mockIntent = "ready_to_proceed";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: SIMULATOR_OFFER_PENDING_META })
			.returning();
		convId = c.id;

		const events = await drain(convId, "Quero ver sim!");

		const gateEvents = events.filter((e) => e.type === "gate");
		expect(gateEvents.some((e) => e.gate === "decision")).toBe(false);

		const [row] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, convId));
		const meta = row.metadata as ConversationMetadata;
		expect(meta.simulatorOfferAnswered).toBe(true);

		const rows = await db
			.select({ content: messagesTable.content, role: messagesTable.role })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		expect(rows.some((m) => m.role === "user" && m.content === "Quero ver sim!")).toBe(true);
	});

	it("simulator-offer por TEXTO negativo ('agora não') NÃO dispara o dial — segue pro decision normalmente", async () => {
		mockIntent = "ready_to_proceed";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: SIMULATOR_OFFER_PENDING_META })
			.returning();
		convId = c.id;

		await drain(convId, "agora não, pode seguir");

		const [row] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, convId));
		const meta = row.metadata as ConversationMetadata;
		expect(meta.simulatorOfferAnswered ?? false).toBe(false);
	});
});
