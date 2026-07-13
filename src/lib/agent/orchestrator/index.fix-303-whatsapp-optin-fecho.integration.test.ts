// FIX-303 (rodada r10 onda 2, loop-de-goal consórcio, 2026-07-12): "Continua o
// WhatsApp... Anotei seu WhatsApp" aparecia logo após o reveal (recomendação),
// sem o usuário ter pedido e ANTES de qualquer proposta apresentada — achado
// de teste manual com Qwen 3.5 Fast. O gatilho migrou de `revealCompleted`
// pro FECHO: só dispara no MESMO turno em que `present_contract_form` (passo
// 5, proposta real) aparece pela 1ª vez (`whatsapp-optin-guard.ts`,
// orchestrator/index.ts). Integração (DB real): agente MOCADO chama
// present_contract_form — o orchestrator emite whatsapp_optin DEPOIS,
// server-side, sem tool-call nenhuma pro optin.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Contador de chamadas a .stream() compartilhado entre o mock (hoisted) e o
// teste — a 1ª chamada é o turno do usuário (present_contract_form); a 2ª (se
// houver) é o directive de opt-in do WhatsApp que o orchestrator injeta em
// seguida — o agente NUNCA vê/chama present_whatsapp_optin (fora do
// toolset), só escreve texto livre.
const { callState } = vi.hoisted(() => ({ callState: { count: 0 } }));

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => {
				callState.count += 1;
				const n = callState.count;
				if (n === 1) {
					return {
						fullStream: (async function* () {
							yield {
								type: "text-delta",
								id: `s${n}`,
								text: "Boa! Pra confirmar seu plano, só preciso de uns dados rápidos:",
							};
							yield {
								type: "tool-call",
								toolName: "present_contract_form",
								input: { administradora: "CANOPUS" },
								toolCallId: `tc-contract-${n}`,
							};
						})(),
						finishReason: Promise.resolve("tool-calls" as const),
						providerMetadata: Promise.resolve({}),
					};
				}
				return {
					fullStream: (async function* () {
						yield {
							type: "text-delta",
							id: `s${n}`,
							text: "Show, kairo! Anotei seu WhatsApp.",
						};
					})(),
					finishReason: Promise.resolve("stop" as const),
					providerMetadata: Promise.resolve({}),
				};
			},
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

// Ponto do funil imediatamente ANTES do fecho: reveal já completo, decisão já
// dirigida — falta só o usuário confirmar (present_contract_form, passo 5).
const PRE_CONTRACT_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	desireAsked: true,
	identityCollected: true,
	qualifyAnswers: { creditMin: 76_500, creditMax: 90_000 },
	revealCompleted: true,
	searchDispatched: true,
	recommendedAdministradora: "CANOPUS",
	recommendedOffer: {
		administradora: "CANOPUS",
		creditValue: 90_000,
		termMonths: 72,
		monthlyPayment: 812,
		groupId: "g-1",
	},
	decisionDispatched: true,
};

async function drain(conversationId: string, userText: string) {
	const events: Array<{ type: string; artifactType?: string }> = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Kairo",
		skipAnalyzer: true,
		skipLeadCollection: true,
		userIntent: "ready_to_proceed",
	});
	for await (const ev of gen) {
		events.push(
			ev.type === "artifact" ? { type: ev.type, artifactType: ev.artifactType } : { type: ev.type },
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

describeIfDb("FIX-303 — whatsapp_optin dispara no FECHO (pós present_contract_form)", () => {
	let convId: string;
	beforeEach(() => {
		vi.clearAllMocks();
		callState.count = 0;
	});
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("present_contract_form dispatch → whatsapp_optin emitido no MESMO turno, sem tool-call do LLM", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: PRE_CONTRACT_META })
			.returning();
		convId = c.id;

		const events = await drain(convId, "Show, quero seguir com a CANOPUS");

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).toContain("contract_form");
		expect(artifactTypes).toContain("whatsapp_optin");

		const [convRow] = await db.select().from(conversations).where(eq(conversations.id, convId));
		const persistedMeta = convRow.metadata as ConversationMetadata;
		expect(persistedMeta.contractFormDispatched).toBe(true);
		expect(persistedMeta.whatsappOptinShown).toBe(true);
	});

	it("retry de fechamento pendente (FIX-27): contract_form redisparado NÃO reabre o optin", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: { ...PRE_CONTRACT_META, contractRetryPending: true },
			})
			.returning();
		convId = c.id;

		const events = await drain(convId, "Tenta de novo, por favor");

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).toContain("contract_form");
		expect(artifactTypes).not.toContain("whatsapp_optin");

		const [convRow] = await db.select().from(conversations).where(eq(conversations.id, convId));
		const persistedMeta = convRow.metadata as ConversationMetadata;
		expect(persistedMeta.whatsappOptinShown).not.toBe(true);
	});
});
