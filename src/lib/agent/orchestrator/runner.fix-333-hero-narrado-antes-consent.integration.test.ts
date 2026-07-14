// FIX-333 (rodada 2, loop-de-goal desamarra, veredito Sonnet rodada 1, web
// 4/10 — 4/4 dossiês): pós-`search`, o servidor emite SÓ a `comparison_table`
// (correto: o hero é liberado depois do gate `reco-consent`, FIX-297 — reveal
// em dois tempos). Mas o card suprimido não impede o MODELO de narrar o
// conteúdo do hero em texto livre: ele já viu score/administradora/parcela do
// top-1 no tool-result de `recommend_groups`, no MESMO turno em que
// `comparison_table` sai. Root cause: o guard `hero-awaits-reco-consent`
// (artifact-guard.ts) suprime o CARD, não o DADO — o texto do modelo escapa.
//
// Correção: `sanitizer.ts` ganha um guard determinístico
// (`isPrematureTopOfferClaim`) que dropa qualquer segmento de fala citando a
// administradora ou o valor de parcela da oferta que ainda está PENDENTE de
// consentimento (`meta.recoConsentAnswered !== true`) — o dado nunca chega ao
// usuário, mesmo que o modelo insista em falar dele. Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Números do dossiê real (veredito rodada 1, auto-web t6): "Tá aí a ITAÚ em
// destaque — parcela de R$ 3.549,75 por mês durante 50 meses".
const GROUP_TOP = {
	id: "grp-itau-real-1",
	administradora: "ITAÚ",
	category: "auto",
	creditValue: 92_902,
	monthlyPayment: 3549.75,
	adminFeePercent: 16,
	termMonths: 50,
	contemplationRate: 0.12,
	availableSlots: 6,
};
const GROUP_OTHER = {
	id: "grp-rodobens-real-1",
	administradora: "RODOBENS",
	category: "auto",
	creditValue: 90_000,
	monthlyPayment: 1580.42,
	adminFeePercent: 18,
	termMonths: 80,
	contemplationRate: 0.032,
	availableSlots: 3,
};

const LEAKED_NARRATION =
	"Tá aí a ITAÚ em destaque — parcela de R$ 3.549,75 por mês durante 50 meses, e contempla bastante gente.";

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", id: "s0", text: "Encontramos 2 boas opções pra você." };
					yield {
						type: "tool-call",
						toolName: "search_groups",
						input: { category: "auto" },
						toolCallId: "tc-search",
					};
					yield {
						type: "tool-result",
						toolName: "search_groups",
						toolCallId: "tc-search",
						output: { groups: [GROUP_TOP, GROUP_OTHER], total: 2 },
					};
					yield {
						type: "tool-call",
						toolName: "recommend_groups",
						input: { budget: 3600, desiredTermMonths: 50, creditMax: 92_902 },
						toolCallId: "tc-recommend",
					};
					yield {
						type: "tool-result",
						toolName: "recommend_groups",
						toolCallId: "tc-recommend",
						output: {
							// FIX-334: recommend_groups não devolve mais score/scoreBreakdown
							// crus pro modelo — rank (posição ordinal) + scoreLabel qualitativo.
							recommendations: [
								{ ...GROUP_TOP, rank: 0, scoreLabel: "Boa compatibilidade", alternativa: false },
								{ ...GROUP_OTHER, rank: 1, scoreLabel: "Compatível com seu perfil", alternativa: true },
							],
							total: 2,
							expansionUsed: false,
							insufficientOptions: false,
						},
					};
					// Reprodução do vazamento real: o modelo narra o hero em texto livre,
					// no MESMO turno, ANTES de qualquer consentimento (reco-consent).
					yield { type: "text-delta", id: "s1", text: LEAKED_NARRATION };
					yield {
						type: "tool-call",
						toolName: "present_recommendation_card",
						input: {
							id: GROUP_TOP.id,
							administradora: GROUP_TOP.administradora,
							category: GROUP_TOP.category,
							creditValue: GROUP_TOP.creditValue,
							monthlyPayment: GROUP_TOP.monthlyPayment,
							termMonths: GROUP_TOP.termMonths,
						},
						toolCallId: "tc-recommendation",
					};
					yield {
						type: "tool-result",
						toolName: "present_recommendation_card",
						toolCallId: "tc-recommendation",
						output: `[Recomendacao apresentada: ${GROUP_TOP.administradora}]`,
					};
					yield {
						type: "tool-call",
						toolName: "present_comparison_table",
						input: { groups: [{ id: GROUP_TOP.id }, { id: GROUP_OTHER.id }] },
						toolCallId: "tc-comparison",
					};
					yield {
						type: "tool-result",
						toolName: "present_comparison_table",
						toolCallId: "tc-comparison",
						output: "[Tabela apresentada]",
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
	qualifyAnswers: { creditMin: 80_000, creditMax: 92_902, prazoMeses: 50, hasLance: "yes" },
};

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Fernanda", metadata: meta })
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
		contactName: "Fernanda",
	});
	for await (const ev of gen) {
		events.push(ev);
		if (ev.type === "text-delta") text += ev.text;
	}
	return { text, events };
}

describeIfDb(
	"FIX-333 — reveal não narra hero (administradora/parcela do top-1) antes do reco-consent",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it("turno pós-search com reco-consent pendente: a fala do modelo não contém administradora nem parcela do top-1", async () => {
			convId = await seedConversation(FIRST_SEARCH_META);

			const { text, events } = await drainUserTurn(convId, "Valor do bem: R$ 92.902");

			expect(text).not.toMatch(/ita[uú]/i);
			expect(text).not.toMatch(/3[.,]?549[.,]75/);

			// O card do hero continua suprimido (FIX-297) — comportamento intacto,
			// este fix é só sobre o TEXTO livre do modelo.
			const artifactEvents = events.filter((e) => e.type === "artifact");
			const recommendation = artifactEvents.find(
				(e) => e.type === "artifact" && e.artifactType === "recommendation_card",
			);
			expect(recommendation).toBeUndefined();
		});
	},
);
