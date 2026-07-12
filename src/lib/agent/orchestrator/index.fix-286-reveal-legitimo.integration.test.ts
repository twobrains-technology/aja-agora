// Integration (DB real) — FIX-286 (P0, veredito Sonnet r9pos2 §3, 2026-07-12):
// o guard de tool-error/cap (FIX-262) foi desenhado e testado só pro cenário
// de REPETIÇÃO pós-reveal ("as opções que já apareceram continuam valendo",
// verdadeiro quando `meta.revealCompleted === true`) — nunca pro caso em que a
// falha acontece NO MEIO da PRIMEIRA apresentação do turno, quando
// `search_groups`/`recommend_groups` já tinham retornado grupos reais. Nesse
// caso a frase "já apareceram" é uma MENTIRA (nada apareceu ainda) e
// `recommendation_card`/`gate:experience` nunca disparam. Skip sem DB.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Grupo real (mesmo shape do `toModelGroupSummary` devolvido por search/recommend).
const REAL_GROUP = {
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

// Reproduz o turno 7 do dossiê (probe-i2-justificativa): o usuário acabou de
// confirmar o valor do bem → o modelo chama search_groups (OK) → recommend_groups
// (OK, grupos reais + score ranqueado) → uma 3ª tool-call (apresentação) falha
// como tool-error. `search_groups`/`recommend_groups` JÁ retornaram dados reais
// neste turno; nenhum reveal existia antes (`revealCompleted` ausente no meta).
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", id: "s0", text: "Deixa eu buscar as opções pra você:" };
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
						output: { groups: [REAL_GROUP], total: 1 },
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
							recommendations: [
								{
									...REAL_GROUP,
									score: 0.91,
									scoreBreakdown: {
										monthlyFit: 0.9,
										contemplation: 0.85,
										adminFee: 0.95,
										termMatch: 0.88,
									},
									alternativa: false,
								},
							],
							total: 1,
							expansionUsed: false,
							insufficientOptions: false,
						},
					};
					// 3ª tool-call (apresentação) — o AI SDK v6 emite `tool-error` em vez
					// de `tool-result` (mesmo padrão do FIX-262/tool-policy).
					yield {
						type: "tool-call",
						toolName: "search_groups",
						input: { category: "auto" },
						toolCallId: "tc-err",
					};
					yield {
						type: "tool-error",
						toolCallId: "tc-err",
						toolName: "search_groups",
						input: { category: "auto" },
						error: new Error("Model tried to call unavailable tool 'search_groups'."),
					};
					// Narração crua que o runner SUPRIME (nunca deve chegar ao usuário).
					yield {
						type: "text-delta",
						id: "s1",
						text: "Rafael, as opções que já apareceram aqui pra você continuam valendo.",
					};
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
const { conversations, messages: messagesTable } = await import("@/db/schema");
const { runTurn } = await import("@/lib/agent/orchestrator");
const { buildToolErrorRecoveryFallback } = await import("./directives");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;
type TurnEvent = import("./types").TurnEvent;

// PRIMEIRA busca da conversa — sem `revealCompleted` (nunca houve reveal
// antes), mesmo estado do turno 7 do dossiê (gate credit acabou de confirmar
// o valor do bem).
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

describeIfDb(
	"FIX-286 — guard de tool-error não suprime um reveal LEGÍTIMO já buscado no turno",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it("materializa o recommendation_card a partir dos grupos reais e NUNCA diz 'já apareceram' quando revealCompleted ainda era false", async () => {
			convId = await seedConversation(FIRST_SEARCH_META);

			const { text, events } = await drainUserTurn(convId, "Valor do bem: R$ 120.000");

			// A mentira do fallback antigo nunca pode sair — nada tinha aparecido.
			expect(text).not.toMatch(/j[áa]\s+apareceram/i);
			expect(text).not.toBe(buildToolErrorRecoveryFallback({ name: "Rafael" }));

			// recommendation_card É emitido, coagido a partir do grupo REAL do turno.
			const artifactEvents = events.filter((e) => e.type === "artifact");
			expect(artifactEvents.length).toBeGreaterThan(0);
			const card = artifactEvents.find(
				(e) => e.type === "artifact" && e.artifactType === "recommendation_card",
			);
			expect(card).toBeDefined();
			if (card && card.type === "artifact") {
				const payload = card.payload as Record<string, unknown>;
				expect(payload.administradora).toBe("RODOBENS");
				expect(payload.creditValue).toBe(120_000);
				expect(payload.monthlyPayment).toBeCloseTo(1580.42);
				expect(payload.groupId).toBe("grp-rodobens-real-1");
			}

			// revealCompleted vira true — habilita o gate "experience" no turno
			// seguinte (evidência indireta de que "gate:experience nunca dispara"
			// do veredito foi corrigido: o estado que o bloqueava está resolvido).
			const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
			const meta = conv?.metadata as ConversationMetadata;
			expect(meta.revealCompleted).toBe(true);
		});

		it("persiste no histórico o texto honesto + o card — nunca a negação crua nem 'já apareceram'", async () => {
			convId = await seedConversation(FIRST_SEARCH_META);

			await drainUserTurn(convId, "Valor do bem: R$ 120.000");

			const rows = await db
				.select({ role: messagesTable.role, content: messagesTable.content })
				.from(messagesTable)
				.where(eq(messagesTable.conversationId, convId));
			const assistantMsgs = rows.filter((r) => r.role === "assistant");
			const joined = assistantMsgs.map((m) => m.content).join("\n");
			expect(joined).not.toMatch(/j[áa]\s+apareceram/i);
		});
	},
);
