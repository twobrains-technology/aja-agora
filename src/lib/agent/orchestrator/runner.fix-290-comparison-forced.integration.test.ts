// Integration (DB real) — FIX-290 (P0 sistêmico, veredito r9pos3 Sonnet §3,
// 2026-07-12): o pareamento `present_recommendation_card` × `present_comparison_table`
// ("REGRA DURA... INSEPARÁVEIS", directives.ts:348) era só regra-no-prompt — se o
// modelo parasse de gerar tool-calls após a 1ª, nada no código forçava a 2ª. O card
// recomendado aparecia sozinho e a tabela comparativa simplesmente sumia (dossiê
// probe-i2-justificativa, turno 7: artifactTypes sem comparison_table/gate:experience/
// whatsapp_optin). Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Dois grupos reais (mesmo shape do `toModelGroupSummary` devolvido por
// search/recommend) — o ramo 2+ grupos é o que exige comparison_table.
const GROUP_A = {
	id: "grp-rodobens-real-1",
	administradora: "RODOBENS",
	category: "auto",
	creditValue: 120_000,
	monthlyPayment: 1580.42,
	adminFeePercent: 18,
	termMonths: 80,
	contemplationRate: 0.032,
	availableSlots: 3,
};
const GROUP_B = {
	id: "grp-itau-real-1",
	administradora: "ITAU",
	category: "auto",
	creditValue: 118_000,
	monthlyPayment: 1540.1,
	adminFeePercent: 16,
	termMonths: 80,
	contemplationRate: 0.028,
	availableSlots: 5,
};

// Controla quantos grupos o stub de recommend_groups/search_groups devolve
// (2 = ramo forçado; 1 = caso de borda que NUNCA força a tabela).
let groupCount: 1 | 2 = 2;
// Controla se o modelo chama a 2ª tool (present_comparison_table) no mesmo
// turno — caminho feliz (idempotente, não deve duplicar).
let modelCallsComparisonTable = false;

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					const groups = groupCount === 2 ? [GROUP_A, GROUP_B] : [GROUP_A];
					yield { type: "text-delta", id: "s0", text: "Encontrei essas opções pra você:" };
					yield {
						type: "tool-call",
						toolName: "search_groups",
						input: { category: "auto", creditMin: 100_000, creditMax: 120_000 },
						toolCallId: "tc-search",
					};
					yield {
						type: "tool-result",
						toolName: "search_groups",
						toolCallId: "tc-search",
						output: { groups, total: groups.length },
					};
					yield {
						type: "tool-call",
						toolName: "recommend_groups",
						input: { budget: 1600, desiredTermMonths: 80, creditMax: 120_000 },
						toolCallId: "tc-recommend",
					};
					yield {
						type: "tool-result",
						toolName: "recommend_groups",
						toolCallId: "tc-recommend",
						output: {
							recommendations: groups.map((g, i) => ({
								...g,
								score: i === 0 ? 0.91 : 0.8,
								scoreBreakdown: {
									monthlyFit: 0.9,
									contemplation: 0.85,
									adminFee: 0.95,
									termMatch: 0.88,
								},
								alternativa: i !== 0,
							})),
							total: groups.length,
							expansionUsed: false,
							insufficientOptions: false,
						},
					};
					yield {
						type: "tool-call",
						toolName: "present_recommendation_card",
						input: {
							id: GROUP_A.id,
							administradora: GROUP_A.administradora,
							category: GROUP_A.category,
							creditValue: GROUP_A.creditValue,
							monthlyPayment: GROUP_A.monthlyPayment,
							adminFeePercent: GROUP_A.adminFeePercent,
							termMonths: GROUP_A.termMonths,
							contemplationRate: GROUP_A.contemplationRate,
							score: 0.91,
							scoreBreakdown: {
								monthlyFit: 0.9,
								contemplation: 0.85,
								adminFee: 0.95,
								termMatch: 0.88,
							},
						},
						toolCallId: "tc-recommendation",
					};
					yield {
						type: "tool-result",
						toolName: "present_recommendation_card",
						toolCallId: "tc-recommendation",
						output: `[Recomendacao apresentada: ${GROUP_A.administradora} - ${GROUP_A.category} - Score 91%]`,
					};
					if (modelCallsComparisonTable) {
						yield {
							type: "tool-call",
							toolName: "present_comparison_table",
							input: {
								groups: groups.map((g) => ({
									id: g.id,
									administradora: g.administradora,
									category: g.category,
									creditValue: g.creditValue,
									monthlyPayment: g.monthlyPayment,
									adminFeePercent: g.adminFeePercent,
									termMonths: g.termMonths,
									availableSlots: g.availableSlots,
									contemplationRate: g.contemplationRate,
								})),
								highlightBestIndex: 0,
							},
							toolCallId: "tc-comparison",
						};
						yield {
							type: "tool-result",
							toolName: "present_comparison_table",
							toolCallId: "tc-comparison",
							output: `[Tabela comparativa com ${groups.length} grupos apresentada ao usuario]`,
						};
					}
					// O modelo PARA aqui — nunca chama present_comparison_table quando
					// modelCallsComparisonTable=false (reproduz o turno 7 do dossiê).
				})(),
				finishReason: Promise.resolve("tool-calls" as const),
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

const { db } = await import("@/db");
const {
	conversations,
	messages: messagesTable,
	artifacts: artifactsTable,
} = await import("@/db/schema");
const { runTurn } = await import("@/lib/agent/orchestrator");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;
type TurnEvent = import("./types").TurnEvent;

const FIRST_SEARCH_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	identityCollected: true,
	qualifyAnswers: { creditMin: 100_000, creditMax: 120_000, prazoMeses: 80, hasLance: "yes" },
};

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Rafael", metadata: meta })
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

async function drainUserTurn(
	conversationId: string,
	userText: string,
): Promise<{ text: string; events: TurnEvent[] }> {
	let text = "";
	const events: TurnEvent[] = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Rafael",
	});
	for await (const ev of gen) {
		events.push(ev);
		if (ev.type === "text-delta") text += ev.text;
	}
	return { text, events };
}

describeIfDb("FIX-290 — comparison_table nunca some do reveal quando o modelo para na 1ª tool", () => {
	let convId: string;
	beforeEach(() => {
		vi.clearAllMocks();
		groupCount = 2;
		modelCallsComparisonTable = false;
	});
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("2+ grupos, modelo chama só present_recommendation_card e para: comparison_table é forçado server-side", async () => {
		convId = await seedConversation(FIRST_SEARCH_META);

		const { events } = await drainUserTurn(convId, "Valor do bem: R$ 120.000");

		const artifactEvents = events.filter((e) => e.type === "artifact");
		const recommendation = artifactEvents.find(
			(e) => e.type === "artifact" && e.artifactType === "recommendation_card",
		);
		const comparison = artifactEvents.find(
			(e) => e.type === "artifact" && e.artifactType === "comparison_table",
		);
		expect(recommendation).toBeDefined();
		expect(comparison).toBeDefined();
		if (comparison && comparison.type === "artifact") {
			const payload = comparison.payload as { groups?: Array<Record<string, unknown>> };
			expect(Array.isArray(payload.groups)).toBe(true);
			expect(payload.groups?.length).toBe(2);
			const ids = payload.groups?.map((g) => g.id);
			expect(ids).toEqual(expect.arrayContaining([GROUP_A.id, GROUP_B.id]));
			// Coagido server-side (mesmo padrão do FIX-191): números vêm do grupo
			// REAL indexado, nunca do que a LLM teria digitado.
			const rowA = payload.groups?.find((g) => g.id === GROUP_A.id);
			expect(rowA?.creditValue).toBe(GROUP_A.creditValue);
			expect(rowA?.monthlyPayment).toBeCloseTo(GROUP_A.monthlyPayment);
		}

		// Persistido no DB junto do resto dos artifacts do turno.
		const rows = await db
			.select({ type: artifactsTable.type })
			.from(artifactsTable)
			.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
			.where(eq(messagesTable.conversationId, convId));
		expect(rows.some((r) => r.type === "comparison_table")).toBe(true);
	});

	it("caso de borda — 1 grupo único: NUNCA força comparison_table", async () => {
		groupCount = 1;
		convId = await seedConversation(FIRST_SEARCH_META);

		const { events } = await drainUserTurn(convId, "Valor do bem: R$ 120.000");

		const artifactEvents = events.filter((e) => e.type === "artifact");
		const comparison = artifactEvents.find(
			(e) => e.type === "artifact" && e.artifactType === "comparison_table",
		);
		expect(comparison).toBeUndefined();
	});

	it("caminho feliz — modelo chama as duas tools normalmente: idempotente, sem duplicar", async () => {
		modelCallsComparisonTable = true;
		convId = await seedConversation(FIRST_SEARCH_META);

		const { events } = await drainUserTurn(convId, "Valor do bem: R$ 120.000");

		const artifactEvents = events.filter((e) => e.type === "artifact");
		const comparisonEvents = artifactEvents.filter(
			(e) => e.type === "artifact" && e.artifactType === "comparison_table",
		);
		expect(comparisonEvents.length).toBe(1);
	});
});
