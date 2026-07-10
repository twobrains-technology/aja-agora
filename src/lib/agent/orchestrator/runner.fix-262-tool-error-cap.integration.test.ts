// Integration (DB real) — FIX-262 (P1, veredito Fable r5, 2026-07-10, causa-raiz
// N1/N2): (a) quando o LLM chama uma tool FORA do toolset da fase (o AI SDK v6
// emite `tool-error`, NoSuchToolError), o runner NUNCA pode deixar a narração
// crua do modelo (que nega a oferta — "não tenho essa opção aberta aqui")
// chegar ao usuário; o código assume o turno com uma resposta determinística
// que reafirma que as opções já mostradas continuam válidas. (b) um turno
// nunca pode ultrapassar um cap duro de tool-calls (o loop real observado foi
// de 34 tool-calls / 593s). Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_CALL_HARD_CAP } from "./runner";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Controla qual roteiro de fullStream o agent stub produz neste teste.
let scenario: "tool-error-negation" | "tool-call-cap" = "tool-error-negation";

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					if (scenario === "tool-error-negation") {
						// Reproduz a espiral de negação real (veredito r5, N1): o modelo
						// tenta comparar 2 marcas → chama search_groups FORA do toolset
						// da fase (reveal/closing excluem descoberta) → AI SDK emite
						// tool-error → e o modelo, vendo isso, tentaria narrar negação.
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
						// A NARRAÇÃO CRUA que o modelo geraria vendo o erro — o runner tem
						// que SUPRIMIR (nunca pode chegar ao usuário: nega oferta real).
						yield {
							type: "text-delta",
							id: "s1",
							text: "Poxa, não tenho essa opção da RODOBENS aberta aqui — só vejo o que já te mostrei antes.",
						};
						return;
					}
					// scenario === "tool-call-cap": o modelo entra em loop de retry —
					// bem mais tool-calls do que o cap duro permite.
					const total = TOOL_CALL_HARD_CAP + 5;
					for (let i = 0; i < total; i++) {
						yield {
							type: "tool-call",
							toolName: "simulate_quota",
							input: { groupId: `grp-${i}`, creditValue: 90000 },
							toolCallId: `tc-${i}`,
						};
						yield {
							type: "tool-result",
							toolName: "simulate_quota",
							output: { monthlyPayment: 1200 },
							toolCallId: `tc-${i}`,
						};
					}
					yield {
						type: "text-delta",
						id: "sN",
						text: "Tive um problema aqui — deixa eu tentar de novo.",
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

async function drainUserTurn(
	conversationId: string,
	userText: string,
): Promise<{
	text: string;
	finishReasons: string[];
	toolCallEvents: number;
}> {
	let text = "";
	const finishReasons: string[] = [];
	let toolCallEvents = 0;
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Kairo",
	});
	for await (const ev of gen) {
		if (ev.type === "text-delta") text += ev.text;
		if (ev.type === "finish") finishReasons.push(ev.reason);
		if (ev.type === "tool-call") toolCallEvents += 1;
	}
	return { text, finishReasons, toolCallEvents };
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

describeIfDb("FIX-262 — tool-error nunca vira negação de oferta real", () => {
	let convId: string;
	beforeEach(() => {
		vi.clearAllMocks();
		scenario = "tool-error-negation";
	});
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("suprime a narração de negação e responde com fallback determinístico", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: REVEAL_READY_META })
			.returning();
		convId = c.id;

		const { text, finishReasons } = await drainUserTurn(convId, "Compara a RODOBENS com a ITAÚ");

		// A negação crua do modelo NUNCA chega ao usuário — invariante do bloco.
		expect(text).not.toMatch(/não tenho essa opção/i);
		expect(text).not.toMatch(/aberta aqui/i);
		// Fallback determinístico reafirma que as opções mostradas continuam válidas.
		expect(text.length).toBeGreaterThan(0);
		expect(finishReasons).toContain("tool-error-recovered");
	});

	it("persiste apenas o fallback determinístico no histórico (não a negação)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: REVEAL_READY_META })
			.returning();
		convId = c.id;

		await drainUserTurn(convId, "Compara a RODOBENS com a ITAÚ");

		const rows = await db
			.select({ role: messagesTable.role, content: messagesTable.content })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const assistantMsgs = rows.filter((r) => r.role === "assistant");
		const joined = assistantMsgs.map((m) => m.content).join("\n");
		expect(joined).not.toMatch(/não tenho essa opção/i);
	});
});

describeIfDb("FIX-262 — cap duro de tool-calls por turno (nunca mais 34/593s)", () => {
	let convId: string;
	beforeEach(() => {
		vi.clearAllMocks();
		scenario = "tool-call-cap";
	});
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("turno nunca ultrapassa o cap duro de tool-calls, mesmo com o modelo em loop", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: REVEAL_READY_META })
			.returning();
		convId = c.id;

		const { toolCallEvents, finishReasons, text } = await drainUserTurn(
			convId,
			"Quero ver todas as opções de novo",
		);

		expect(toolCallEvents).toBeLessThanOrEqual(TOOL_CALL_HARD_CAP);
		expect(finishReasons).toContain("tool-call-cap-exceeded");
		// O fallback repetido ("Tive um problema... tentar de novo") do loop real
		// NUNCA chega ao usuário — cortado pelo cap, não relayado.
		expect(text).not.toMatch(/tive um problema/i);
	});
});
