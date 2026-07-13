// FIX-323 (rodada 10, veredito Sonnet A.4 — achado MÉDIA, dossiê Mario onda
// 4/10 ao vivo): `pipeClosingCeremony` (extraída no FIX-311) tem 3 chamadores
// (ação `interest`, gate `simulator-offer` yes/no) e NENHUM verificava
// `hasLance==="so_parcela"` — só o clique estrutural do PRÓPRIO gate `lance`
// tratava esse caso (route.ts, ramo `action.gate==="lance"` valor
// "so_parcela"). Quem recusa lance por TEXTO LIVRE (FIX-321 corrigiu a
// CAPTURA) e fecha clicando "Tenho interesse" (o caminho MAIS comum de
// fechamento) nunca via `two_paths` — sempre caía na cerimônia normal
// (scarcity+decision_prompt), porque `pipeClosingCeremony` não sabia da
// exceção que `orchestrator/index.ts` (`nextGateToFire==="decision"`) já
// implementava pro caminho de texto livre.
//
// Teste de INTEGRAÇÃO (mesmo padrão do FIX-311): sobe o handler POST
// /api/chat REAL contra o DB real, com um agente MOCADO que só produz texto.

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", text: "Boa, bora seguir então." };
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

const POS_REVEAL_SO_PARCELA_META: ConversationMetadata = {
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
	qualifyAnswers: { creditMin: 76_500, creditMax: 90_000, prazoMeses: 72, hasLance: "so_parcela" },
};

async function cleanup(convId: string): Promise<void> {
	const msgs = await db
		.select({ id: messagesTable.id })
		.from(messagesTable)
		.where(eq(messagesTable.conversationId, convId));
	const ids = msgs.map((m) => m.id);
	if (ids.length > 0) {
		const { inArray } = await import("drizzle-orm");
		await db.delete(artifactsTable).where(inArray(artifactsTable.messageId, ids));
	}
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describeIfDb("FIX-323 — pipeClosingCeremony respeita hasLance='so_parcela' em TODOS os fast-paths", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("ação 'interest' com hasLance='so_parcela' emite two_paths — NUNCA scarcity/decision_prompt", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Mario", channel: "web", metadata: POS_REVEAL_SO_PARCELA_META })
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Tenho interesse!" }] }],
				action: { kind: "interest", administradora: "CANOPUS", label: "Tenho interesse!" },
			}),
		);
		const text = await res.text();

		expect(text).toContain('"type":"two_paths"');
		expect(text).not.toContain('"type":"scarcity"');
		expect(text).not.toContain('"type":"decision_prompt"');
	});

	it("gate simulator-offer='yes' com hasLance='so_parcela' emite two_paths — NUNCA scarcity/decision_prompt", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Mario",
				channel: "web",
				metadata: { ...POS_REVEAL_SO_PARCELA_META, simulatorOfferDispatched: false },
			})
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Bora ver!" }] }],
				action: { kind: "gate", gate: "simulator-offer", value: "yes", label: "Bora ver!" },
			}),
		);
		const text = await res.text();

		expect(text).toContain('"type":"two_paths"');
		expect(text).not.toContain('"type":"scarcity"');
		expect(text).not.toContain('"type":"decision_prompt"');
	});

	it("REGRESSÃO — ação 'interest' SEM so_parcela continua com scarcity→decision_prompt (FIX-311 intacto)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: {
					...POS_REVEAL_SO_PARCELA_META,
					qualifyAnswers: { ...POS_REVEAL_SO_PARCELA_META.qualifyAnswers, hasLance: "yes" },
				},
			})
			.returning();
		convId = c.id;

		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Tenho interesse!" }] }],
				action: { kind: "interest", administradora: "CANOPUS", label: "Tenho interesse!" },
			}),
		);
		const text = await res.text();

		const scarcityIdx = text.indexOf('"type":"scarcity"');
		const decisionIdx = text.indexOf('"type":"decision_prompt"');
		expect(scarcityIdx).toBeGreaterThan(-1);
		expect(decisionIdx).toBeGreaterThan(-1);
		expect(scarcityIdx).toBeLessThan(decisionIdx);
		expect(text).not.toContain('"type":"two_paths"');
	});
});
