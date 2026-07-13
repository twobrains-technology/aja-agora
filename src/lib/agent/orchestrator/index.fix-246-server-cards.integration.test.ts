// FIX-246 (rodada 3, Fable r2 — causa-raiz): mesma emissão server-side
// determinística de scarcity/two_paths, agora no caminho de TEXTO LIVRE
// (orchestrator/index.ts — usado pelos canais web E whatsapp). Integração
// (DB real): agente MOCADO nunca chama nenhuma tool.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", id: "s0", text: "Boa! Esse plano encaixa bem no que você pediu." };
				})(),
				finishReason: Promise.resolve("stop" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}
	return {
		resolveAgent: vi.fn().mockResolvedValue(makeAgent()),
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

const POS_REVEAL_META: ConversationMetadata = {
	desireAsked: true,
	qualifyConsented: true,
	currentPersona: "auto",
	currentCategory: "auto",
	experiencePrev: "returning",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	// FIX-297: reco-consent precisa estar resolvido pra nextGate cruzar
	// timeframe/lance até chegar em "decision".
	recoConsentDispatched: true,
	simulatorOfferDispatched: true,
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
		lanceEmbutido: false,
	},
};

async function drain(conversationId: string, userText: string) {
	const events: Array<{ type: string; artifactType?: string }> = [];
	const gen = runTurn({
		channel: "whatsapp",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Kairo",
		skipAnalyzer: true,
		skipLeadCollection: true,
		userIntent: "ready_to_proceed",
	});
	for await (const ev of gen) {
		events.push(ev.type === "artifact" ? { type: ev.type, artifactType: ev.artifactType } : { type: ev.type });
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

describeIfDb("FIX-246 — index.ts (texto livre/whatsapp): scarcity/two_paths server-side", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("caminho normal (não so_parcela): emite scarcity ANTES do decision_prompt ser dirigido, sem tool-call", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "whatsapp", metadata: POS_REVEAL_META })
			.returning();
		convId = c.id;

		const events = await drain(convId, "Bora, gostei desse plano");

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).toContain("scarcity");

		const rows = await db
			.select({ id: messagesTable.id })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const persisted = await db
			.select()
			.from(artifactsTable)
			.where(
				inArray(
					artifactsTable.messageId,
					rows.map((r) => r.id),
				),
			);
		expect(persisted.some((a) => a.type === "scarcity")).toBe(true);
	});

	it("caminho 'só a parcela': emite two_paths + o convite fixo (texto), sem tool-call", async () => {
		const soParcelaMeta: ConversationMetadata = {
			...POS_REVEAL_META,
			qualifyAnswers: { ...POS_REVEAL_META.qualifyAnswers, hasLance: "so_parcela" },
		};
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "whatsapp", metadata: soParcelaMeta })
			.returning();
		convId = c.id;

		const events = await drain(convId, "Bora, gostei desse plano");

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).toContain("two_paths");
		// scarcity NÃO dispara no caminho so_parcela (spec 04-copy-fluxos.md).
		expect(artifactTypes).not.toContain("scarcity");

		const rows = await db
			.select({ id: messagesTable.id })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const persisted = await db
			.select()
			.from(artifactsTable)
			.where(
				inArray(
					artifactsTable.messageId,
					rows.map((r) => r.id),
				),
			);
		expect(persisted.some((a) => a.type === "two_paths")).toBe(true);
	});
});
