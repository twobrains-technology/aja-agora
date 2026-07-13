/**
 * FIX-330 (rodada 10, achado ao vivo pós-FIX-329 — 3ª variante de P4,
 * distinta do FIX-326/328/329) — dossiê fresco do Mario mostrou "Quer ajustar
 * o valor do bem? [...] Você já fez consórcio antes?" no MESMO turno: 2
 * perguntas reais, vindas de blocos DIFERENTES de uma resposta multi-tool-call
 * (o modelo narra, chama uma tool, narra mais, chama outra tool, narra o
 * fecho).
 *
 * Causa-raiz: `ephemeralFilter.flush()` era chamado em TODA fronteira de
 * bloco/pré-tool-call (`runner.ts`, FIX-182/FIX-188) — não só no fim real do
 * turno — e `flush()` SEMPRE libera a pergunta segurada (FIX-298). A pergunta
 * do bloco 1 escapava pro stream ANTES do bloco final (que também termina em
 * pergunta), resultando em 2 perguntas na MESMA mensagem persistida.
 *
 * Fix: as fronteiras intermediárias usam `flushPending()` (novo método —
 * esvazia só o texto pendente, NUNCA libera a pergunta segurada); só o fim
 * REAL do turno (`flush()`) pode liberar.
 *
 * Teste de INTEGRAÇÃO: sobe `runTurn` REAL contra o DB real, com um agente
 * MOCADO que produz 2 blocos de texto (ids diferentes) — cada um terminando
 * em pergunta — com uma tool-call NO MEIO (fronteira intermediária real).
 */

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations, messages as messagesTable } from "@/db/schema";
import type { ConversationMetadata } from "@/lib/agent/personas";

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						id: "bloco-1",
						text: "Aqui está o detalhamento completo da ITAÚ. Quer ajustar o valor do bem?",
					};
					yield {
						type: "tool-call",
						toolName: "save_contact_name",
						input: { name: "Mario" },
						toolCallId: "tc-1",
					};
					yield {
						type: "text-delta",
						id: "bloco-2",
						text: "Essas são as melhores alternativas pro seu perfil, Mario. Você já fez consórcio antes?",
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

const { runTurn } = await import("@/lib/agent/orchestrator");

// Estado TERMINAL (sem gate nenhum com pergunta própria pendente) — isola a
// verificação: sem NENHUM gate disparando, o único jeito de sobrar 2 "?" no
// texto é a fuga PREMATURA do bloco 1 (o bug que este fix corrige).
const TERMINAL_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "auto",
	currentCategory: "auto",
	experiencePrev: "returning",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	decisionDispatched: true,
	qualifyAnswers: {
		creditMin: 76_500,
		creditMax: 90_000,
		prazoMeses: 12,
		hasLance: "so_parcela",
	},
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

describe("FIX-330 — pergunta de bloco INTERMEDIÁRIO não escapa antes do fim real do turno", () => {
	let convId: string;
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("2 blocos de texto (com tool-call no meio), bloco 1 termina em pergunta — não sobrevive no texto final nem na mensagem persistida", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Mario", channel: "web", metadata: TERMINAL_META })
			.returning();
		convId = c.id;

		const events: Array<{ type: string; text?: string }> = [];
		const gen = runTurn({
			channel: "web",
			conversationId: convId,
			userText: "A Canopus parece boa, parcela baixa",
			isUserTurn: true,
			contactName: "Mario",
			skipLeadCollection: true,
			skipAnalyzer: true,
			userIntent: "neutral",
			userKey: null,
		});
		for await (const ev of gen) {
			if (ev.type === "text-delta") events.push({ type: ev.type, text: ev.text });
			else events.push({ type: ev.type });
		}

		const fullText = events
			.filter((e) => e.type === "text-delta")
			.map((e) => e.text)
			.join("");

		const questionMarks = fullText.match(/\?/g) ?? [];
		expect(
			questionMarks.length,
			`esperava NO MÁXIMO 1 "?" no turno inteiro — texto: ${JSON.stringify(fullText)}`,
		).toBeLessThanOrEqual(1);
		expect(fullText).not.toContain("Quer ajustar o valor do bem?");
		expect(fullText).toContain("Essas são as melhores alternativas");

		const msgs = await db
			.select({ content: messagesTable.content, role: messagesTable.role })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const assistantMsg = msgs.find((m) => m.role === "assistant");
		expect(assistantMsg?.content).not.toContain("Quer ajustar o valor do bem?");
	});
});
