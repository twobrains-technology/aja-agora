// FIX-246 (rodada 3, Fable r2 — causa-raiz do veredito 4/10): os cards
// `two_paths`/`embedded_bid`/`scarcity` tinham 0 EMISSÕES AO VIVO em 7
// oportunidades porque dependiam do LLM obedecer um directive pra chamar
// `present_X` — invariante crítico no PROMPT, não em CÓDIGO (Lei 1/4).
//
// Este teste é de INTEGRAÇÃO (não só folha): sobe o handler POST /api/chat
// REAL contra o DB real, com um agente MOCADO que NUNCA chama nenhuma tool —
// só produz texto. Se o card ainda assim aparecer no stream (e persistir no
// banco), a emissão é PROVADAMENTE server-side determinística, não
// dependente de o modelo obedecer.

import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	artifacts as artifactsTable,
	conversations,
	messages as messagesTable,
} from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

// Agente MOCADO: produz SÓ texto (a frase de reação), NUNCA chama tool
// nenhuma — prova que o card não depende de tool-call.
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						text: "Perfeito, respeito total. Então deixa eu ser bem transparente:",
					};
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

vi.mock("@/lib/agent/personas-repo", () => ({
	getPersona: vi.fn().mockResolvedValue({
		id: "auto",
		role: "specialist",
		category: "auto",
		isActive: true,
		examples: [],
	}),
}));

const { POST } = await import("./route");

function makeReq(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	});
}

/** Estado PÓS-reveal (passo 3+4 concluído) — gate `lance` só é alcançável
 * depois disso (FIX-215: lance é pós-reveal). `recommendedOffer.groupId`
 * (FIX-246) ancora a emissão determinística do scarcity. */
const POS_REVEAL_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	experiencePrev: "returning",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	recommendedAdministradora: "CANOPUS",
	recommendedOffer: {
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		termMonths: 72,
		monthlyPayment: 812,
		groupId: "grupo-real-abc",
	},
	qualifyAnswers: { creditMin: 76_500, creditMax: 90_000, prazoMeses: 72 },
};

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

describeIfDb("FIX-246 — cards server-side: emissão determinística SEM tool-call do LLM", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("gate lance='so_parcela' emite o card two_paths no stream E persiste no banco (agente NUNCA chamou tool)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: POS_REVEAL_META })
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Só a parcela, sem lance" }] }],
				action: { kind: "gate", gate: "lance", value: "so_parcela", label: "Só a parcela, sem lance" },
			}),
		);
		const text = await res.text();

		// O card saiu no STREAM (SSE), formatado como data-artifact two_paths.
		expect(text).toContain('"type":"two_paths"');
		// O convite pra decidir é o texto FIXO — nunca gerado pelo modelo mocado
		// (que só produziu a frase de reação, sem mencionar "certo ou errado").
		expect(text.toLowerCase()).toContain("não tem certo ou errado");

		// E persistiu no banco (artifact real vinculado a uma mensagem real).
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
		const twoPaths = persisted.find((a) => a.type === "two_paths");
		expect(twoPaths).toBeDefined();
		expect(twoPaths?.payload.administradora).toBe("CANOPUS");
		expect(twoPaths?.payload.monthlyPayment).toBe(812);
	});

	it("gate lance='no' emite o card embedded_bid no stream E persiste no banco (agente NUNCA chamou tool)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: POS_REVEAL_META })
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Por enquanto não" }] }],
				action: { kind: "gate", gate: "lance", value: "no", label: "Por enquanto não" },
			}),
		);
		const text = await res.text();

		expect(text).toContain('"type":"embedded_bid"');

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
		const embeddedBid = persisted.find((a) => a.type === "embedded_bid");
		expect(embeddedBid).toBeDefined();
		expect(embeddedBid?.payload.creditValue).toBe(90_000);
		expect(String(embeddedBid?.payload.disclaimer)).toMatch(/crédito recebido diminui/i);
	});

	it("gate simulator-offer='no' emite o card scarcity no stream E no banco (agente NUNCA chamou tool)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: { ...POS_REVEAL_META, simulatorOfferDispatched: true },
			})
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Agora não" }] }],
				action: { kind: "gate", gate: "simulator-offer", value: "no", label: "Agora não" },
			}),
		);
		const text = await res.text();

		expect(text).toContain('"type":"scarcity"');

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
		const scarcity = persisted.find((a) => a.type === "scarcity");
		expect(scarcity).toBeDefined();
		expect(scarcity?.payload.groupCode).toBe("grupo-real-abc");
	});
});
