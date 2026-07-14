// Integration (DB real) — FIX-332 (P0.1, veredito rodada 1 do loop
// "desamarra-agente", web 4/10 + whatsapp 3/10, 2026-07-13): o sintoma-mor que
// a cirurgia deveria ter matado sobreviveu num terceiro caminho. Pós-reveal, o
// usuário pede pra detalhar/simular uma oferta já mostrada ("simula a ITAÚ com
// meu FGTS") e o modelo chama `search_groups` — que NÃO existia no toolset da
// fase `reveal` (tool-policy.ts). O AI SDK devolve NoSuchToolError → o runner
// DESCARTA a fala inteira do turno → o orchestrator (index.ts:797) materializa
// o fallback enlatado ("as opções que já apareceram... continuam valendo") —
// e o pedido do usuário nunca é atendido (pior caso do veredito: imóvel, 5x
// seguidas).
//
// Este teste reproduz o loop no nível do orchestrator: o mock de resolveAgent
// consulta a POLICY REAL (`allowedTools`) pra decidir se search_groups é
// aceito ou vira tool-error — exatamente o eixo que este fix muda. Roda RED
// antes da correção em tool-policy.ts (search_groups fora do toolset →
// branch de erro → fallback enlatado) e GREEN depois (search_groups aceito →
// a fala do próprio modelo sobrevive).
//
// A prova de que a Bevi NÃO é rechamada nesse caminho vive num teste mais
// direto (ai-sdk.fix-332-search-groups-pos-reveal.test.ts, com spy no
// adapter) — aqui o mock não toca a Bevi de verdade, só o AI SDK real. Skip
// sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/agents", async () => {
	const { allowedTools } = await import("@/lib/agent/orchestrator/tool-policy");
	type Meta = import("@/lib/agent/personas").ConversationMetadata;

	function makeAgent(meta: Meta) {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					const allowed = new Set(allowedTools(meta));
					if (allowed.has("search_groups")) {
						// PÓS-FIX: search_groups existe no toolset da fase reveal — o AI
						// SDK real executa a tool (ai-sdk.ts intercepta e devolve os
						// grupos JÁ EXIBIDOS, sem tocar a Bevi) e o modelo segue com a
						// PRÓPRIA fala, nunca descartada.
						yield {
							type: "tool-call",
							toolName: "search_groups",
							input: { category: "auto" },
							toolCallId: "tc-ok",
						};
						yield {
							type: "tool-result",
							toolCallId: "tc-ok",
							toolName: "search_groups",
							output: {
								groups: [
									{
										id: "grp-itau",
										administradora: "ITAÚ",
										creditValue: 92902,
										termMonths: 200,
										monthlyPayment: 2182.01,
									},
								],
								total: 1,
								note: "Estes são os grupos já exibidos nesta conversa.",
							},
						};
						yield {
							type: "text-delta",
							id: "s1",
							text: "Show, aqui está de novo a ITAÚ com o FGTS que você pediu: parcela de R$ 2.182,01.",
						};
					} else {
						// HOJE (bug): search_groups fora do toolset da fase reveal — o AI
						// SDK real dispararia NoSuchToolError aqui; reproduzimos o mesmo
						// tool-error observado nos logs de produção.
						yield { type: "text-delta", id: "s0", text: "Deixa eu conferir isso pra você:" };
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
						yield {
							type: "text-delta",
							id: "s2",
							text: "Poxa, não tenho essa opção aberta aqui.",
						};
					}
				})(),
				finishReason: Promise.resolve("tool-calls" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}

	return {
		resolveAgent: vi.fn((_persona: unknown, meta: Meta) => Promise.resolve(makeAgent(meta))),
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

// Mesmo estado do veredito: reveal completo, SEM troca de faixa de valor (o
// afirmativo/pedido do usuário é sobre a MESMA faixa já descoberta) — o
// cenário exato em que search_groups estava fora do toolset antes deste fix.
const REVEAL_READY_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	revealCompleted: true,
	recommendedAdministradora: "RODOBENS",
	qualifyAnswers: { creditMin: 80_000, creditMax: 100_000, prazoMeses: 60, hasLance: "yes" },
};

const COMPARISON_TABLE_PAYLOAD = {
	groups: [
		{
			id: "grp-rodobens",
			administradora: "RODOBENS",
			creditValue: 90000,
			termMonths: 180,
			monthlyPayment: 1218.92,
		},
		{
			id: "grp-itau",
			administradora: "ITAÚ",
			creditValue: 92902,
			termMonths: 200,
			monthlyPayment: 2182.01,
		},
	],
};

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Fernanda", metadata: meta })
		.returning();
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

async function drainUserTurn(conversationId: string, userText: string): Promise<string> {
	let text = "";
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Fernanda",
	});
	for await (const ev of gen) {
		if (ev.type === "text-delta") text += ev.text;
	}
	return text;
}

describeIfDb(
	"FIX-332 — search_groups pós-reveal deixa de virar tool-error + fallback enlatado",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it("pedido sobre oferta já exibida faz o modelo chamar search_groups — a FALA DO MODELO sobrevive, nunca o fallback enlatado", async () => {
			convId = await seedConversation(REVEAL_READY_META);

			const text = await drainUserTurn(convId, "simula de novo pra mim com o FGTS");

			// Assinatura do fallback enlatado (buildToolErrorRecoveryFallback) —
			// NUNCA pode aparecer quando search_groups é aceito e resolve.
			expect(text).not.toMatch(/continua(m)? valendo/i);
			expect(text).not.toMatch(/me diz o nome da administradora/i);
			expect(text).not.toMatch(/n[aã]o tenho essa op[cç][aã]o aberta/i);
			// A resposta é a fala do PRÓPRIO modelo, com o dado real devolvido
			// pela tool interceptada (não re-buscado na Bevi).
			expect(text).toMatch(/ITA[UÚ]/i);
			expect(text).toMatch(/2\.182,01/);
		});
	},
);
