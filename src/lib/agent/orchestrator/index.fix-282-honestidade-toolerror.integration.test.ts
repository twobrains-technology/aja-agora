// Integration (DB real) — FIX-282 (P1, veredito Sonnet r9pos, G-B/I2,
// 2026-07-12): o fallback determinístico do tool-error/cap (FIX-262/266)
// era CEGO ao conteúdo da pergunta do usuário — quando o cliente questiona a
// EXATIDÃO do valor ("é de 120 mil como pedi?") ou o CRITÉRIO da recomendação
// ("por que essa e não outra?") logo após o reveal, e o modelo tenta
// `search_groups` fora de fase pra "conferir" (tool-error), o orchestrator
// respondia com o fallback genérico ("as opções continuam valendo...") —
// nem confirma, nem nega, nunca responde a pergunta. A resposta honesta
// (comparação real rawCreditValue × creditValue, diretiva FIX-277) já existe
// em `meta`, mas nunca chegava a rodar porque este fallback a substituía
// antes. Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Reproduz o probe-i2: o modelo tenta `search_groups` fora do toolset da fase
// reveal (revealCompleted=true, decisionDispatched=false, sem troca de faixa)
// → AI SDK emite tool-error → a narração crua é suprimida e o orchestrator
// assume o turno.
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
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
						id: "s1",
						text: "Sim, é exatamente o valor que você pediu, sem ajuste nenhum.",
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
const { buildToolErrorRecoveryFallback, buildToolErrorRecoveryFallbackRepeat } = await import(
	"./directives"
);
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

// ITAÚ 124.599 — usuário pediu 120.000 (probe-i2-justificativa, dossie.json
// turnos 7-9). rawCreditValue (creditClampedFrom ?? creditMax) = 120.000,
// creditValue real = 124.599 — diverge 3,8%, mesmo cenário do FIX-277.
const REVEAL_READY_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	revealCompleted: true,
	recommendedAdministradora: "ITAÚ",
	recommendedOffer: {
		administradora: "ITAÚ",
		creditValue: 124_599,
		termMonths: 200,
		monthlyPayment: 2182.01,
		groupId: "grp-itau",
	},
	qualifyAnswers: { creditMin: 100_000, creditMax: 120_000, prazoMeses: 60, hasLance: "yes" },
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

async function drainUserTurn(conversationId: string, userText: string): Promise<string> {
	let text = "";
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Rafael",
	});
	for await (const ev of gen) {
		if (ev.type === "text-delta") text += ev.text;
	}
	return text;
}

describeIfDb(
	"FIX-282 — pergunta de exatidão/critério no tool-error recebe resposta honesta, não o fallback cego",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it('usuário pergunta se a carta "bate" com o pedido + insiste no critério → resposta cita rawCreditValue × creditValue reais, NUNCA o fallback genérico cego', async () => {
			convId = await seedConversation(REVEAL_READY_META);

			const text = await drainUserTurn(
				convId,
				"Peraí, essa carta que você recomendou é de 120 mil como pedi? Por que essa e não outra?",
			);

			expect(text).not.toBe(buildToolErrorRecoveryFallback({ name: "Rafael" }));
			expect(text).not.toMatch(/as op[çc][õo]es que j[áa] apareceram aqui/i);
			expect(text).not.toMatch(/me diz o nome da administradora/i);
			// comparação real dos dois valores, no padrão do FIX-277 (rawCreditValue × creditValue)
			expect(text).toMatch(/120\.000/);
			expect(text).toMatch(/124\.599/);
		});

		it("insistência no MESMO turno de critério (2ª vez seguida) continua respondendo com os números reais, não repete o fallback genérico verbatim", async () => {
			convId = await seedConversation(REVEAL_READY_META);
			// 1ª pergunta já respondida com o fallback genérico noutro turno anterior
			// (simula o turno 8 do dossiê já ter caído no bug antigo).
			await db.insert(messagesTable).values({
				conversationId: convId,
				role: "assistant",
				content: buildToolErrorRecoveryFallback({ name: "Rafael" }),
				channel: "web",
			});

			const text = await drainUserTurn(convId, "Mas por que essa e não outra? Qual o critério?");

			expect(text).not.toBe(buildToolErrorRecoveryFallback({ name: "Rafael" }));
			expect(text).not.toBe(
				buildToolErrorRecoveryFallbackRepeat({ name: "Rafael", offers: [] }),
			);
			expect(text).toMatch(/120\.000/);
			expect(text).toMatch(/124\.599/);
		});

		it('"quero ver mais opções" (I1, wants_more_options genuíno) NÃO é tratado como pergunta de exatidão/critério — continua no fallback antigo', async () => {
			convId = await seedConversation(REVEAL_READY_META);

			const text = await drainUserTurn(convId, "quero ver mais opções");

			expect(text.endsWith(buildToolErrorRecoveryFallback({ name: "Rafael" }))).toBe(true);
		});
	},
);
