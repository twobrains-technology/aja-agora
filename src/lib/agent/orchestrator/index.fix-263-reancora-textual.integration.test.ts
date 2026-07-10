// Integration (DB real) — FIX-263 (P1, veredito Fable r5, seam PARCIAL,
// 2026-07-10): confirmação TEXTUAL de uma oferta JÁ EXIBIDA (nome de
// administradora batendo com um card do reveal) nunca re-ancorava
// `recommendedOffer`/`recommendedAdministradora` — só o clique (choose_offer,
// route.ts) fazia isso. Ao vivo: o usuário confirmou ITAÚ 92.902 por texto 3×
// mas o hero/aviso de troca de marca no fechamento seguia nomeando a ÂNCORA
// (snapshot stale) — o aviso citava a marca ANTERIOR errada. Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Agent stub mínimo — a re-ancoragem acontece ANTES da chamada ao modelo, então
// o stub só precisa terminar o turno sem erro (texto curto, sem tool-calls).
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", id: "s0", text: "Show, seguimos com a ITAÚ então." };
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

const { db } = await import("@/db");
const {
	conversations,
	messages: messagesTable,
	artifacts: artifactsTable,
} = await import("@/db/schema");
const { runTurn } = await import("@/lib/agent/orchestrator");
const { metaOf } = await import("@/lib/conversation/meta");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

const ANCORA_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	revealCompleted: true,
	recommendedAdministradora: "ÂNCORA",
	recommendedOffer: {
		administradora: "ÂNCORA",
		category: "auto",
		creditValue: 90000,
		termMonths: 180,
		monthlyPayment: 1213.85,
		groupId: "grp-ancora",
	},
	qualifyAnswers: { creditMin: 80_000, creditMax: 100_000, prazoMeses: 60, hasLance: "yes" },
};

// Cota ITAÚ REALMENTE exibida no comparison_table do reveal (com os 3 números
// completos) — é contra ISSO que resolveOfferMentionForConversation resolve.
const COMPARISON_TABLE_PAYLOAD = {
	groups: [
		{
			id: "grp-ancora",
			administradora: "ÂNCORA",
			creditValue: 90000,
			termMonths: 180,
			monthlyPayment: 1213.85,
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

async function seedConversationWithReveal(meta: ConversationMetadata): Promise<string> {
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

async function drainUserTurn(conversationId: string, userText: string): Promise<void> {
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Kairo",
	});
	for await (const _ev of gen) {
		// drena
	}
}

describeIfDb("FIX-263 — confirmação textual re-ancora recommendedOffer (igual ao clique)", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("confirmar ITAÚ por texto (nome batendo com cota exibida) → recommendedOffer/recommendedAdministradora viram ITAÚ", async () => {
		convId = await seedConversationWithReveal(ANCORA_META);

		await drainUserTurn(convId, "Show, pode ser a ITAÚ mesmo, vamos com ela");

		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = metaOf(conv);
		expect(
			meta.recommendedAdministradora,
			"a confirmação textual da ITAÚ deveria re-ancorar recommendedAdministradora (estava ÂNCORA, stale)",
		).toBe("ITAÚ");
		expect(meta.recommendedOffer?.groupId).toBe("grp-itau");
		expect(meta.recommendedOffer?.creditValue).toBe(92902);
		expect(meta.recommendedOffer?.termMonths).toBe(200);
		expect(meta.recommendedOffer?.monthlyPayment).toBe(2182.01);
	});

	it("sem menção clara (ambígua ou nenhuma) → recommendedOffer permanece intacto (nunca ancora no escuro)", async () => {
		convId = await seedConversationWithReveal(ANCORA_META);

		await drainUserTurn(convId, "Me explica de novo como funciona o lance embutido");

		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = metaOf(conv);
		expect(meta.recommendedAdministradora).toBe("ÂNCORA");
		expect(meta.recommendedOffer?.groupId).toBe("grp-ancora");
	});

	it("pré-reveal (nada mostrado ainda) → nunca re-ancora, mesmo citando o nome de uma administradora", async () => {
		convId = await seedConversationWithReveal({
			...ANCORA_META,
			revealCompleted: false,
		});

		await drainUserTurn(convId, "Pode ser a ITAÚ mesmo");

		const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
		const meta = metaOf(conv);
		expect(meta.recommendedAdministradora).toBe("ÂNCORA");
	});
});
