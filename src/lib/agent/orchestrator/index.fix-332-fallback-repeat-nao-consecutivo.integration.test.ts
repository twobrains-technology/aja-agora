// Integration (DB real) — FIX-332, item P2.7 (veredito rodada 1, canal web):
// "Madalena, as opções que já apareceram aqui pra você continuam valendo..."
// aparece IDÊNTICO 2x na MESMA conversa (turnos 10 e 15) — não-consecutivos.
// O guard anti-repetição (index.ts, `buildToolErrorRecoveryFallback`) só
// comparava com o ÚLTIMO turno do assistant (`[...history].reverse().find(...)`)
// — como houve outro turno do assistant ENTRE as duas ocorrências, o guard não
// via a repetição e a MESMA frase voltava a cada 2 turnos.
//
// Fix: o guard passa a varrer TODO o histórico do assistant nesta conversa,
// não só o turno imediatamente anterior.
//
// Cenário aqui usa `present_decision_prompt` — tool que NUNCA entra no toolset
// do LLM em nenhuma fase (FIX-253) — pra produzir um tool-error genuíno e
// ESTÁVEL, independente da correção de search_groups deste mesmo fix (que
// passa a aceitar search_groups pós-reveal). Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", id: "s0", text: "Deixa eu conferir isso pra você:" };
					yield {
						type: "tool-call",
						toolName: "present_decision_prompt",
						input: {},
						toolCallId: "tc-err",
					};
					yield {
						type: "tool-error",
						toolCallId: "tc-err",
						toolName: "present_decision_prompt",
						input: {},
						error: new Error("Model tried to call unavailable tool 'present_decision_prompt'."),
					};
					yield {
						type: "text-delta",
						id: "s1",
						text: "Poxa, não tenho essa opção aberta aqui.",
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
const { buildToolErrorRecoveryFallback } = await import("./directives");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

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

/** Seed com histórico: comparison_table + N mensagens do assistant (na ORDEM
 * dada) ANTES do turno de usuário que o teste dispara. */
async function seedConversationWithHistory(
	meta: ConversationMetadata,
	assistantTexts: string[],
): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Kairo", metadata: meta })
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
	for (const text of assistantTexts) {
		await db.insert(messagesTable).values({
			conversationId: c.id,
			role: "assistant",
			content: text,
			channel: "web",
		});
	}
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
		contactName: "Kairo",
	});
	for await (const ev of gen) {
		if (ev.type === "text-delta") text += ev.text;
	}
	return text;
}

describeIfDb(
	"FIX-332 (P2.7) — guard anti-repetição varre TODO o histórico, não só o último turno",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it("fallback genérico usado 2 turnos atrás (NÃO-consecutivo) — NUNCA repete idêntico na 2ª ocorrência", async () => {
			const generic = buildToolErrorRecoveryFallback({ name: "Kairo" });
			// Histórico: [comparison_table, generic (turno N), "Perfeito, mais
			// alguma coisa?" (turno N+1, NÃO relacionado)] — o guard antigo só olha
			// o ÚLTIMO turno do assistant ("Perfeito...") e não vê o generic.
			convId = await seedConversationWithHistory(REVEAL_READY_META, [
				generic,
				"Perfeito, mais alguma coisa?",
			]);

			const text = await drainUserTurn(convId, "ok deixa eu pensar aqui");

			expect(text.endsWith(generic)).toBe(false);
			// A variante "repeat" lista as cotas já exibidas em vez de repetir a
			// mesma frase genérica.
			expect(text).toMatch(/RODOBENS/i);
			expect(text).toMatch(/ITA[UÚ]/i);
		});

		it("fallback genérico NUNCA usado antes → 1ª ocorrência usa o genérico normalmente (sem regressão)", async () => {
			convId = await seedConversationWithHistory(REVEAL_READY_META, []);

			const text = await drainUserTurn(convId, "ok deixa eu pensar aqui");

			expect(text.endsWith(buildToolErrorRecoveryFallback({ name: "Kairo" }))).toBe(true);
		});
	},
);
