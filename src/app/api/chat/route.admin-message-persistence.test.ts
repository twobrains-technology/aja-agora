/**
 * BUG-ADMIN-MESSAGE-MISSING (descoberto em 2026-05-18) + FIX-185 (2026-07-01)
 *
 * Sintoma original: admin abre uma conversa de lead no painel e NÃO vê todas as
 * mensagens. Usuário fez 12 turns no chat web, mas o admin GET só retornou até a
 * 9ª. Mensagens recentes ficavam "perdidas" (ghost). Causa: `runner.ts` só
 * persistia a assistant message quando `fullResponse.length > 0` — turnos que
 * produziam SÓ tool-call sem texto (save_contact_name, present_*) viravam ghost.
 * FIX: o runner passou a persistir SEMPRE que houve emissão (texto OU tool),
 * gravando um marker `[tool: <nomes>]` quando não há texto (runner.ts:383).
 *
 * ── FIX-185 (2026-07-01): o teste estava VERMELHO, e NÃO por flakiness ──
 *
 * Rodando `pnpm test:integration`, 2 casos falhavam contando 36 e 27 em vez de 24.
 * Investigado a fundo (causa PROVADA, não hipótese):
 *
 *  1) NÃO é cleanup/acúmulo entre execuções. Cada teste cria um `convId` novo no
 *     `beforeEach` e conta SÓ as messages desse convId (o `afterEach` ainda limpa).
 *     Rodado 3× seguidas → 36/27 IDÊNTICO todas as vezes, sem crescer. Determinístico.
 *
 *  2) É DOUBLE-PERSIST intencional (soma de dois fixes independentes) num turno de
 *     tool SILENCIOSA (save_contact_name, sem texto):
 *       • runner.ts:383 persiste o marker `[tool: save_contact_name]` (o fix do
 *         BUG-ADMIN-MESSAGE-MISSING acima — admin não pode perder o turno);
 *       • route.ts, via `isTurnEmpty` (FIX-172), considera um turno de tool
 *         SILENCIOSA como "mudo" e dispara o `EMPTY_TURN_FALLBACK` — uma SEGUNDA
 *         assistant message ("Acho que me perdi, pode mandar de novo?"), pra o
 *         usuário não ficar com a tela congelada (regressão real observada no
 *         WhatsApp: loop de save_contact_name sem gerar texto).
 *     Logo cada turno de tool silenciosa grava 1 user + 2 assistant = 3 rows:
 *       - "tool-only" (12 turns silenciosos): 12 user + 24 assistant = 36.
 *       - "mixed" (12 turns, 3 silenciosos): 12 user + (9 texto + 3 marker + 3
 *         fallback) = 12 + 15 = 27.
 *     O teste ANTIGO assumia exato 2N — um invariante que ficou ESTÁLE quando o
 *     FIX-172 (fallback) entrou DEPOIS do fix do marker. A falha era ortogonal ao
 *     propósito do teste (anti-ghosting): admin agora recebe de MAIS, nunca de menos.
 *
 * As asserts abaixo foram atualizadas pra a composição INTENCIONAL atual (marker +
 * fallback), determinística, SEM afrouxar a garantia central (anti-ghosting): todo
 * turno do usuário tem ≥1 assistant depois dele e o admin devolve EXATAMENTE o que
 * está no DB (nada perdido). Se um dia o produto deduplicar o marker+fallback (é uma
 * decisão de produto/UX — reconciliar BUG-ADMIN-MESSAGE-MISSING × FIX-172, fora do
 * escopo deste card), estas contagens exatas quebram e forçam uma revisão consciente.
 *
 * Mocks aplicados:
 *  - `resolveAgent` → agent stub com `fullStream` determinístico (sem Anthropic).
 *  - `analyzeTurn` → análise neutra (sem Anthropic).
 *  - `requireRole` → admin autenticado (bypass de cookie/session).
 *  - `checkRateLimit` → sempre allow (permite N POSTs em ráfaga).
 *  - memory bridge → desligado (sem Letta).
 * Tudo o resto (DB, route handlers, orchestrator, saveMessage, createUIMessageStream,
 * o fallback de turno vazio) roda REAL.
 */

import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages as messagesTable } from "@/db/schema";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn().mockResolvedValue({
		error: null,
		session: { user: { id: "test-admin", role: "admin" } },
	}),
}));

// `analyzeTurn` faz `generateObject` contra Anthropic. Em testes,
// curto-circuitamos com análise neutra — não afeta o caminho de persistência
// de mensagens (que é o que estamos validando).
vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return {
		...actual,
		analyzeTurn: vi.fn().mockResolvedValue({
			reasoning: "test",
			detectedCategory: null,
			detectedSubTopic: null,
			isExplicitSwitch: false,
			expertiseLevel: "neutro",
			experiencePrev: null,
			creditMin: null,
			creditMax: null,
			prazoMeses: null,
			hasLance: null,
			userIntent: "neutral",
			extraSignals: [],
		}),
	};
});

// `resolveAgent` retorna um agent fake cuja `.stream()` produz fullStream
// async iterable. O modo é controlado por `agentModeRef.value`:
//  - "text"      → emite text-delta determinístico (turno com texto).
//  - "tool-only" → emite SÓ um tool-call `save_contact_name` (tool SILENCIOSA)
//    sem text-delta. O runner persiste o marker `[tool: save_contact_name]` E o
//    route, por `isTurnEmpty` (FIX-172), dispara o EMPTY_TURN_FALLBACK → 2 rows.
//  - "mixed"     → alterna text e tool-only por turno (simulando fluxo real).
const agentModeRef = vi.hoisted(() => ({
	value: "text" as "text" | "tool-only" | "mixed",
	turnCounter: 0,
}));

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
				const lastUser = [...messages].reverse().find((m) => m.role === "user");
				const echo = lastUser?.content ?? "ack";
				const replyText = `ACK_ASSISTANT(${echo.slice(0, 40)})`;
				const mode = agentModeRef.value;
				let useToolOnly: boolean;
				if (mode === "text") useToolOnly = false;
				else if (mode === "tool-only") useToolOnly = true;
				else {
					// "mixed" → mesma distribuição que o relato (~25% turns sem texto).
					// 12 turns reais: turns 3, 7, 11 sem texto.
					const i = agentModeRef.turnCounter;
					useToolOnly = i === 3 || i === 7 || i === 11;
				}
				agentModeRef.turnCounter += 1;
				const parts: Array<
					| { type: "text-delta"; text: string }
					| {
							type: "tool-call";
							toolName: string;
							input: Record<string, unknown>;
							toolCallId: string;
					  }
				> = useToolOnly
					? [
							{
								type: "tool-call",
								toolName: "save_contact_name",
								input: { name: echo },
								toolCallId: `tc-${Math.random().toString(36).slice(2)}`,
							},
						]
					: [
							{ type: "text-delta", text: replyText.slice(0, 10) },
							{ type: "text-delta", text: replyText.slice(10) },
						];
				return {
					fullStream: (async function* () {
						for (const p of parts) yield p;
					})(),
					finishReason: Promise.resolve(
						(useToolOnly ? "tool-calls" : "stop") as "stop" | "tool-calls",
					),
					providerMetadata: Promise.resolve({}),
				};
			},
		};
	}
	return {
		resolveAgent: vi.fn().mockResolvedValue(makeAgent()),
		invalidateAgentCache: vi.fn(),
	};
});

// Memory adapter desligado pra evitar Letta no teste.
vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

// Imports dinâmicos pra garantir que mocks estejam ativos antes do load.
const { POST } = await import("./route");
const { GET: ADMIN_GET } = await import("@/app/api/admin/conversations/[id]/route");

function makePostReq(body: unknown): NextRequest {
	const req = new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": "127.0.0.1",
		},
		body: JSON.stringify(body),
	});
	return req;
}

function makeAdminGetReq(): Request {
	return new Request("http://localhost/api/admin/conversations/x", { method: "GET" });
}

async function cleanup(convId: string): Promise<void> {
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

type AdminMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: string;
};

type AdminGetResponse = {
	conversation: { id: string };
	messages: AdminMessage[];
};

/**
 * Garantia central (anti-ghosting do BUG-ADMIN-MESSAGE-MISSING): todo turno do
 * usuário produz ≥1 assistant DEPOIS dele e antes do próximo user. Sem isso o
 * histórico do admin "some". Robusto ao nº exato de assistants por turno (o turno
 * de tool silenciosa produz 2: marker + fallback).
 */
function assertNoGhostedUserTurn(messages: AdminMessage[]): void {
	const userIdx = messages
		.map((m, i) => (m.role === "user" ? i : -1))
		.filter((i) => i >= 0);
	for (let k = 0; k < userIdx.length; k++) {
		const from = userIdx[k] + 1;
		const to = k + 1 < userIdx.length ? userIdx[k + 1] : messages.length;
		const assistantsAfter = messages.slice(from, to).filter((m) => m.role === "assistant").length;
		expect(
			assistantsAfter,
			`turno do usuário #${k} (msg index ${userIdx[k]}) ficou GHOST: nenhuma assistant depois dele`,
		).toBeGreaterThanOrEqual(1);
	}
}

describe("BUG-ADMIN-MESSAGE-MISSING / FIX-185 — admin GET devolve TODAS as messages (determinístico) após N turns", () => {
	let convId: string;

	async function runTurnsAndFetch(
		N: number,
	): Promise<{ sentTexts: string[]; body: AdminGetResponse; dbCount: number }> {
		const sentTexts: string[] = [];
		for (let i = 0; i < N; i++) {
			const userText = `turn-${i}-payload`;
			sentTexts.push(userText);
			const res = await POST(
				makePostReq({
					conversationId: convId,
					messages: [{ role: "user", parts: [{ type: "text", text: userText }] }],
				}),
			);
			expect(res.status, `POST do turn ${i} retornou ${res.status}`).toBe(200);
			// Drena o stream — execute callback só termina quando consumidor leu tudo.
			await res.text();
		}
		const adminRes = await ADMIN_GET(makeAdminGetReq(), {
			params: Promise.resolve({ id: convId }),
		});
		expect(adminRes.status).toBe(200);
		const body = (await adminRes.json()) as AdminGetResponse;
		const dbCountRow = await db
			.select({ c: sql<number>`COUNT(*)::int` })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		return { sentTexts, body, dbCount: dbCountRow[0]?.c ?? 0 };
	}

	beforeEach(async () => {
		const [c] = await db.insert(conversations).values({ contactName: "TestUser" }).returning();
		convId = c.id;
		agentModeRef.value = "text";
		agentModeRef.turnCounter = 0;
	});

	afterEach(async () => {
		await cleanup(convId);
	});

	it("agente que sempre emite texto → 12 turns geram 24 messages, ordem user/assistant intercalada", async () => {
		agentModeRef.value = "text";
		const N = 12;
		const { sentTexts, body, dbCount } = await runTurnsAndFetch(N);

		expect(body.messages.length).toBe(2 * N);
		expect(dbCount).toBe(2 * N);
		// Admin devolve EXATAMENTE o que está no DB (nada perdido, nada a mais).
		expect(body.messages.length).toBe(dbCount);

		for (let i = 0; i < N; i++) {
			expect(body.messages[2 * i]?.role).toBe("user");
			expect(body.messages[2 * i]?.content).toBe(sentTexts[i]);
			expect(body.messages[2 * i + 1]?.role).toBe("assistant");
		}
		assertNoGhostedUserTurn(body.messages);
	}, 30_000);

	it("REGRESSÃO anti-ghost + FIX-185: 12 turns de tool SILENCIOSA → nenhum turno vira ghost; composição intencional = marker + fallback (36 rows)", async () => {
		// Cada turno de tool silenciosa (save_contact_name, sem texto) grava DUAS
		// assistant rows INTENCIONALMENTE: o marker `[tool: save_contact_name]`
		// (runner.ts:383, admin não pode perder o turno) e o EMPTY_TURN_FALLBACK
		// (route/isTurnEmpty, FIX-172 — turno mudo não pode congelar a tela).
		// A garantia central: NENHUM turno vira ghost (o bug original).
		agentModeRef.value = "tool-only";
		const N = 12;
		const { body, dbCount } = await runTurnsAndFetch(N);

		const userMsgs = body.messages.filter((m) => m.role === "user");
		const asstMsgs = body.messages.filter((m) => m.role === "assistant");
		const markerMsgs = asstMsgs.filter((m) => m.content === "[tool: save_contact_name]");
		const fallbackMsgs = asstMsgs.filter((m) => m.content === EMPTY_TURN_FALLBACK);

		// Anti-ghost: cada user turn tem assistant depois (o bug original era 0).
		assertNoGhostedUserTurn(body.messages);
		expect(userMsgs.length).toBe(N);
		// Composição INTENCIONAL determinística: N markers + N fallbacks.
		expect(markerMsgs.length, "esperava N markers [tool: save_contact_name]").toBe(N);
		expect(fallbackMsgs.length, "esperava N EMPTY_TURN_FALLBACK").toBe(N);
		expect(asstMsgs.length).toBe(2 * N);
		expect(body.messages.length).toBe(3 * N);
		// Admin devolve EXATAMENTE o que está no DB — nada perdido, contagem estável.
		expect(dbCount).toBe(3 * N);
		expect(body.messages.length).toBe(dbCount);
	}, 30_000);

	it("FIX-185: 12 turns com 3 tool-only intercalados → admin devolve 27 (12 user + 9 texto + 3 marker + 3 fallback), determinístico", async () => {
		// Distribuição mista: turns 3, 7, 11 produzem só tool-call silenciosa.
		// 9 turns de texto (1 assistant cada) + 3 turns silenciosos (2 cada:
		// marker + fallback) + 12 user = 12 + 15 = 27. Nunca 21/9 (o bug original).
		agentModeRef.value = "mixed";
		const N = 12;
		const { body, dbCount } = await runTurnsAndFetch(N);

		const userMsgs = body.messages.filter((m) => m.role === "user");
		const asstMsgs = body.messages.filter((m) => m.role === "assistant");
		const markerMsgs = asstMsgs.filter((m) => m.content === "[tool: save_contact_name]");
		const fallbackMsgs = asstMsgs.filter((m) => m.content === EMPTY_TURN_FALLBACK);

		assertNoGhostedUserTurn(body.messages);
		expect(userMsgs.length).toBe(N);
		// 3 turnos silenciosos → 3 markers + 3 fallbacks; 9 turnos de texto → 9 asst.
		expect(markerMsgs.length).toBe(3);
		expect(fallbackMsgs.length).toBe(3);
		expect(asstMsgs.length).toBe(15);
		expect(body.messages.length).toBe(27);
		expect(dbCount).toBe(27);
		// Admin devolve EXATAMENTE o que está no DB.
		expect(body.messages.length).toBe(dbCount);
	}, 30_000);
});
