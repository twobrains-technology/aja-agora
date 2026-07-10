// Integration (DB real) — FIX-266 (P1, veredito Fable r6, "o que segura o 7"
// #1, 2026-07-10): o fallback determinístico do tool-error/cap (FIX-262)
// pedia "me diz o nome da administradora" mesmo quando o usuário TINHA
// acabado de nomear, na própria mensagem, uma oferta já exibida em tela —
// contenção sem resolução, e repetia a MESMA frase 2× seguidas quando não
// resolvia. Este teste reproduz os dois cenários ao vivo (tool-error real,
// como no FIX-262) contra uma comparison_table seedada (como no FIX-263).
// Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Reproduz a espiral do FIX-262: o modelo chama uma tool fora do toolset da
// fase → AI SDK emite tool-error → a narração crua (que negaria a oferta)
// tem que ser suprimida e o orchestrator assume o turno.
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

async function seedConversation(
	meta: ConversationMetadata,
	priorAssistantText?: string,
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
	if (priorAssistantText) {
		await db.insert(messagesTable).values({
			conversationId: c.id,
			role: "assistant",
			content: priorAssistantText,
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

describeIfDb("FIX-266 — recuperação do tool-error resolve a menção em vez de pedir de novo", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it('usuário nomeia a ITAÚ (já exibida) no MESMO turno que dispara o tool-error → resolve, NUNCA pede "me diz o nome"', async () => {
		convId = await seedConversation(REVEAL_READY_META);

		// Menção a UMA só administradora (nome único) — resolve determinístico
		// (2 nomes na mesma frase é ambíguo por design, FIX-264).
		const text = await drainUserTurn(convId, "Quero saber mais da ITAÚ de novo");

		expect(text).not.toMatch(/me diz o nome/i);
		expect(text).not.toMatch(/não tenho essa opção/i);
		expect(text).toMatch(/ITA[UÚ]/i);
		expect(text).toMatch(/continua valendo/i);
	});

	it("sem menção resolvível e sem fallback anterior → usa o fallback genérico (1ª ocorrência)", async () => {
		convId = await seedConversation(REVEAL_READY_META);

		const text = await drainUserTurn(convId, "ok deixa eu pensar aqui");

		// O stub também emite texto ANTES do tool-error (streaming real, FIX-262
		// já cobre que a NEGAÇÃO pós-erro é suprimida) — o fallback determinístico
		// é sempre a ÚLTIMA coisa que chega.
		expect(text.endsWith(buildToolErrorRecoveryFallback({ name: "Kairo" }))).toBe(true);
	});

	it("fallback genérico já foi a ÚLTIMA mensagem do assistant → NUNCA repete idêntico, lista as opções", async () => {
		const generic = buildToolErrorRecoveryFallback({ name: "Kairo" });
		convId = await seedConversation(REVEAL_READY_META, generic);

		const text = await drainUserTurn(convId, "ok deixa eu pensar aqui");

		expect(text.endsWith(generic)).toBe(false);
		expect(text).toMatch(/RODOBENS/i);
		expect(text).toMatch(/ITA[UÚ]/i);
	});
});
