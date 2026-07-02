// Integration (DB real) — FIX-186 (Kairo 2026-07-01): quando a descoberta na
// Bevi falha (após retry), o modelo NÃO pode narrar o erro cru ("tive um
// problema — dificuldade técnica pontual") nem empilhar preâmbulos "vou buscar".
// O runDiscovery retorna o marcador `__discoveryFailed` (não re-lança); o runner
// detecta, SUPRIME a narração seguinte do modelo e sinaliza; o orchestrator
// materializa a mensagem amigável FIXA (Lei 1: código dispõe). Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Agent stub: reproduz a trajetória do bug — preâmbulo honesto + search_groups
// que FALHA (tool-result com o marcador do FIX-186) + a narração de erro cru que
// o modelo geraria no step seguinte (DEVE ser suprimida pelo runner).
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", id: "s0", text: "Bora ver o que encaixa na sua faixa:" };
					yield {
						type: "tool-call",
						toolName: "search_groups",
						input: { category: "auto", creditMin: 20_000, creditMax: 200_000 },
						toolCallId: "tc-search",
					};
					yield {
						type: "tool-result",
						toolName: "search_groups",
						output: {
							__discoveryFailed: true,
							error: "descoberta falhou apos retry — sistema conduz",
						},
						toolCallId: "tc-search",
					};
					// A NARRAÇÃO CRUA que o modelo geraria vendo o erro — o runner tem
					// que SUPRIMIR (não pode chegar ao usuário).
					yield {
						type: "text-delta",
						id: "s1",
						text: "Ihh, tive um problema aqui agora — uma dificuldade técnica pontual pra acessar os grupos. Deixa eu buscar de novo.",
					};
					// FIX-187: e MESMO ASSIM o modelo tenta emitir a PROPOSTA FANTASMA
					// (o card "Esse plano faz sentido?" do print, com números). O guard
					// tem que DROPAR — nada ancorado em dado que não carregou.
					yield {
						type: "tool-call",
						toolName: "present_recommendation_card",
						input: {
							administradora: "BANCO DO BRASIL",
							category: "auto",
							creditValue: 131042,
							monthlyPayment: 2365.57,
							termMonths: 72,
							score: 0.9,
						},
						toolCallId: "tc-rec",
					};
					yield {
						type: "tool-call",
						toolName: "present_decision_prompt",
						input: { administradora: "BANCO DO BRASIL" },
						toolCallId: "tc-dec",
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
const { conversations, messages: messagesTable, artifacts: artifactsTable } = await import(
	"@/db/schema"
);
const { runTurn } = await import("@/lib/agent/orchestrator");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

const REVEAL_READY_META: ConversationMetadata = {
	currentPersona: "moto",
	currentCategory: "moto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	qualifyAnswers: { creditMin: 35_000, creditMax: 40_000, prazoMeses: 8, hasLance: "no" },
};

async function drainDirectiveTurn(conversationId: string): Promise<{
	text: string;
	finishReasons: string[];
	artifactTypes: string[];
}> {
	let text = "";
	const finishReasons: string[] = [];
	const artifactTypes: string[] = [];
	// Turno de DIRETIVA (isUserTurn=false, skipAnalyzer) = o passo de busca que o
	// orchestrator dispara pós-qualify. Aqui o fake agent falha a descoberta.
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText: "[diretiva de busca]",
		isUserTurn: false,
		contactName: "Kairo",
		skipAnalyzer: true,
		skipLeadCollection: true,
	});
	for await (const ev of gen) {
		if (ev.type === "text-delta") text += ev.text;
		if (ev.type === "finish") finishReasons.push(ev.reason);
		if (ev.type === "artifact") artifactTypes.push(ev.artifactType);
	}
	return { text, finishReasons, artifactTypes };
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

describeIfDb("FIX-186 — descoberta falhada NÃO vira narração de erro (fallback determinístico)", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("suprime a narração crua do modelo e emite a mensagem amigável FIXA", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: REVEAL_READY_META })
			.returning();
		convId = c.id;

		const { text, finishReasons } = await drainDirectiveTurn(convId);

		// A narração crua do modelo (pós-falha) foi SUPRIMIDA — nada disso vaza.
		expect(text).not.toMatch(/problema/i);
		expect(text).not.toMatch(/dificuldade t[ée]cnica/i);
		expect(text).not.toMatch(/buscar de novo/i);

		// A mensagem determinística de fallback CHEGOU ao usuário.
		expect(text).toMatch(/não consegui carregar as opções/i);
		expect(text.toLowerCase()).toContain("especialista");

		// O turno fechou pelo caminho de descoberta falhada.
		expect(finishReasons).toContain("discovery-failed");
	});

	it("[FIX-187] NENHUM card de proposta é emitido após a busca falhar (guard dropa)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: REVEAL_READY_META })
			.returning();
		convId = c.id;

		const { artifactTypes } = await drainDirectiveTurn(convId);

		// A proposta fantasma do print (recommendation_card + decision_prompt) NÃO
		// pode chegar — ancorada em dado que não carregou (CLAUDE.md #2).
		expect(artifactTypes).not.toContain("recommendation_card");
		expect(artifactTypes).not.toContain("decision_prompt");
	});

	it("persiste APENAS a mensagem determinística no histórico (não a narração do modelo)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", metadata: REVEAL_READY_META })
			.returning();
		convId = c.id;

		await drainDirectiveTurn(convId);

		const rows = await db
			.select({ role: messagesTable.role, content: messagesTable.content })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const assistantMsgs = rows.filter((r) => r.role === "assistant");
		const joined = assistantMsgs.map((m) => m.content).join("\n");
		expect(joined).toMatch(/não consegui carregar as opções/i);
		expect(joined).not.toMatch(/dificuldade t[ée]cnica/i);
	});
});
