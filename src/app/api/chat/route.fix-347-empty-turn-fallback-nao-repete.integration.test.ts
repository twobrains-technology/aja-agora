// Integration (DB real) — FIX-347 (loop-de-goal desamarra, rodada 4, P1.1):
// "Regressão exigida": o fallback de turno-vazio nunca aparece 2× na mesma
// conversa. `pickEmptyTurnFallback` (empty-turn-guard.ts) já tem cobertura
// unitária da função pura; este teste sobe o handler POST /api/chat REAL
// contra o DB real (mesmo padrão do FIX-323/271) pra provar o fio inteiro:
// route.ts varre o histórico do assistant e troca a frase quando o
// EMPTY_TURN_FALLBACK original já foi usado antes.
//
// O mock do modelo aqui NUNCA escreve texto (fullStream vazio) — turno mudo
// de verdade, sem sanitizer envolvido — pra isolar esta regressão da lógica
// de retry-com-motivo (já coberta em
// index.fix-347-turno-vazio-retry-motivo.integration.test.ts).

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { EMPTY_TURN_FALLBACK, EMPTY_TURN_FALLBACK_REPEAT } from "@/lib/chat/empty-turn-guard";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

// Turno SEMPRE mudo: nenhum text-delta, nenhuma tool-call. Reproduz o "modelo
// não disse nada" (hipótese 1 do card FIX-347) — deliberadamente NÃO aciona
// o retry-com-motivo (isso é outro teste), só a rede final do route.ts.
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				// biome-ignore lint/correctness/useYield: fullStream vazio de propósito — turno mudo de verdade.
				fullStream: (async function* () {})(),
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

const { POST } = await import("./route");

function makeReq(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	});
}

// Mesma fase TERMINAL do teste de retry-com-motivo (nextGate resolve
// "search"/terminal, decideShowGate=false) — turno livre sem gate pendente,
// sem oferta mencionável no texto do usuário.
const TERMINAL_META: ConversationMetadata = {
	currentPersona: "moto",
	currentCategory: "moto",
	expertiseLevel: "neutro",
	desireAsked: true,
	experiencePrev: "first",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	decisionDispatched: true,
	// FIX-309: sem isto, o topic_picker (menu de dúvidas pós-experience=first)
	// dispara AUTOMATICAMENTE no 1o turno de usuário e mascara o turno vazio
	// com um artifact real — no dossiê real (moto-web t5) esse card já tinha
	// aparecido bem antes do turno 9 reproduzido aqui.
	topicPickerDispatched: true,
	qualifyAnswers: {
		creditMin: 30_000,
		creditMax: 35_738,
		prazoMeses: 60,
		hasLance: "yes",
		lanceValue: 3_659.57,
		lanceEmbutido: false,
	},
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

describeIfDb("FIX-347 — EMPTY_TURN_FALLBACK nunca repete a mesma frase 2x na mesma conversa", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("1o turno mudo: fallback ORIGINAL. 2o turno mudo (mesma conversa): variante, NUNCA a mesma frase", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Mario", channel: "web", metadata: TERMINAL_META })
			.returning();
		convId = c.id;

		const res1 = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "sim, mostra pra mim" }] }],
			}),
		);
		const text1 = await res1.text();
		expect(text1).toContain(EMPTY_TURN_FALLBACK);

		const res2 = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "quero ver as outras opções" }] }],
			}),
		);
		const text2 = await res2.text();

		// A REGRESSÃO exigida pelo card: nunca a mesma frase 2x na mesma conversa.
		expect(text2).not.toContain(EMPTY_TURN_FALLBACK);
		expect(text2).toContain(EMPTY_TURN_FALLBACK_REPEAT);
	});
});
