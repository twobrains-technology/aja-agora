// FIX-280 (loop r9, baseline Sonnet 3/10, G4 — Funcional 5/10): present_whatsapp_optin
// era puramente LLM-discricionário — mesmo toolset, mesmo estado de sistema,
// disparava em mario-sem-lance turno 7 e não em madalena no mesmo ponto do
// funil. Mesma receita do FIX-246/253: a tool SAI do toolset (tool-policy.ts)
// e a emissão vira SERVER-SIDE determinística (buildWhatsappOptinCard,
// orchestrator/index.ts+server-cards.ts). Integração (DB real): 2 conversas
// com meta IDÊNTICO, agente MOCADO nunca chama present_whatsapp_optin (a tool
// nem está mais no toolset).
//
// FIX-303 (rodada r10 onda 2, 2026-07-12): o PONTO de disparo migrou do
// pós-reveal pro FECHO (pós present_contract_form) — o card soltava logo após
// a recomendação, sem o usuário ter pedido e sem proposta nenhuma na tela
// (achado do teste manual com Qwen 3.5 Fast). Os 2 testes abaixo agora
// verificam a NEGATIVA (reveal sozinho não é gatilho); o teste do disparo no
// fecho vive em index.fix-303-whatsapp-optin-fecho.integration.test.ts.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Contador de chamadas a .stream() compartilhado entre o mock (dentro do
// vi.mock, hoisted) e o teste (beforeEach) — vi.clearAllMocks() NÃO reseta
// closures customizadas, só histórico de chamada/implementação padrão.
const { callState } = vi.hoisted(() => ({ callState: { count: 0, variant: "a" } }));

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => {
				callState.count += 1;
				const n = callState.count;
				// 2ª chamada .stream() = o directive de busca (search-summary) que o
				// orchestrator dispara internamente (index.ts, nextGateToFire==="search")
				// — é AQUI que o reveal acontece (present_recommendation_card marca
				// revealCompleted=true). A 1ª chamada é o turno do usuário; a 3ª (se
				// houver) é o directive de opt-in do WhatsApp que o orchestrator injeta
				// LOGO EM SEGUIDA — o agente NUNCA vê/chama present_whatsapp_optin (a
				// tool nem está no toolset), só escreve texto livre.
				if (n === 2) {
					return {
						fullStream: (async function* () {
							yield {
								type: "text-delta",
								id: `s${n}`,
								text:
									callState.variant === "a"
										? "Olha o que encontrei pra você:"
										: "Achei uma opção boa, dá uma olhada:",
							};
							yield {
								type: "tool-call",
								toolName: "present_recommendation_card",
								input: {
									administradora: "CANOPUS",
									category: "auto",
									creditValue: 90_000,
									monthlyPayment: 812,
									termMonths: 72,
									score: 0.9,
								},
								toolCallId: `tc-rec-${n}`,
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
							text: callState.variant === "a" ? `Boa!` : `Show, combinado.`,
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

// Ponto do funil imediatamente ANTES da busca: desire respondido, identidade
// coletada, valor do bem já definido — o único gate pendente é `search`
// (nextGate() qualify-state.ts). searchDispatched AUSENTE de propósito.
const PRE_SEARCH_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "auto",
	currentCategory: "auto",
	identityCollected: true,
	qualifyAnswers: { creditMin: 76_500, creditMax: 90_000 },
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

describeIfDb(
	"FIX-280/FIX-303 — whatsapp_optin server-side determinístico (2 conversas, meta idêntico)",
	() => {
		let convId: string;
		beforeEach(() => {
			vi.clearAllMocks();
			callState.count = 0;
		});
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it("conversa A: reveal completo SEM proposta apresentada → whatsapp_optin NÃO aparece (FIX-303)", async () => {
			callState.variant = "a";
			const [c] = await db
				.insert(conversations)
				.values({ contactName: "Kairo", channel: "web", metadata: PRE_SEARCH_META })
				.returning();
			convId = c.id;

			const events = await drain(convId, "Bora, quero ver as opções");

			const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
			// FIX-297 (rodada 10): o hero fica pendente no reveal original — só sai
			// depois que o usuário consentir no gate reco-consent (pós-experience).
			expect(artifactTypes).not.toContain("recommendation_card");
			// FIX-303: sem present_contract_form (proposta) neste turno, o optin
			// não dispara mais — só reveal não é gatilho suficiente.
			expect(artifactTypes).not.toContain("whatsapp_optin");

			const [convRow] = await db
				.select()
				.from(conversations)
				.where(eq(conversations.id, convId));
			const persistedMeta = convRow.metadata as ConversationMetadata;
			expect(persistedMeta.whatsappOptinShown).not.toBe(true);
			// O payload coagido do hero sobrevive no meta pra emissão determinística
			// posterior (reco-consent), nunca perdido/descartado.
			expect(persistedMeta.pendingRecommendationCard).toBeDefined();
		});

		it("conversa B: MESMO meta, texto do LLM totalmente diferente → MESMO resultado (determinismo, whatsapp_optin ainda NÃO aparece)", async () => {
			callState.variant = "b";
			const [c] = await db
				.insert(conversations)
				.values({ contactName: "Kairo", channel: "web", metadata: PRE_SEARCH_META })
				.returning();
			convId = c.id;

			const events = await drain(convId, "Show, pode seguir com a busca");

			const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
			expect(artifactTypes).not.toContain("recommendation_card");
			expect(artifactTypes).not.toContain("whatsapp_optin");

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
			expect(persisted.some((a) => a.type === "whatsapp_optin")).toBe(false);
		});
	},
);
