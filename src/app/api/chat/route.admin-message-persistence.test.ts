/**
 * BUG-ADMIN-MESSAGE-MISSING (descoberto em 2026-05-18)
 *
 * Sintoma reportado: admin abre uma conversa de lead no painel e NÃO vê
 * todas as mensagens. Usuário relatou ter feito 12 turns no chat web,
 * mas o admin GET /api/admin/conversations/[id] só retornou até a
 * 9ª mensagem. Mensagens recentes ficam "perdidas" temporariamente.
 *
 * Hipóteses investigadas (este teste valida CONTRATO, não causa raiz):
 *
 * 1) Race no persist: o `saveMessage(assistant)` em
 *    `src/lib/agent/orchestrator/runner.ts:191` só roda APÓS o `for await`
 *    consumir todo o stream do agent. O execute callback do
 *    `createUIMessageStream` é awaited, mas se algum await intermediário
 *    rejeitar/throw silenciosamente, a assistant message vira ghost.
 *
 * 2) saveMessage(assistant) só ocorre quando `fullResponse.length > 0`
 *    (runner.ts:190). Se o turn produzir só tool calls / artifacts sem
 *    texto (e.g. present_value_picker, present_simulation_result), a
 *    assistant message NUNCA é persistida — admin vê (user, user, ...)
 *    sem a contraparte. Isso bate exatamente com o relato "12 turns,
 *    9 messages" (12 user + ~9 assistant com texto = ~21, mas o user
 *    contou "turns" = pares).
 *
 * 3) Ordering por created_at sem tiebreak: `simulatorNow()` retorna
 *    `Date` JS (resolução ms). Em ráfaga rápida, várias linhas caem no
 *    mesmo ms — `ORDER BY created_at ASC` deixa ordem indeterminada,
 *    podendo "embaralhar" a renderização do admin.
 *
 * O QUE O TESTE AFIRMA (contrato anti-regressão):
 *
 * Após N POSTs sequenciais a `/api/chat` (cada um drenando o stream
 * completo via `await res.text()`), o GET admin
 * `/api/admin/conversations/[id]` DEVE retornar **exatamente 2N messages**
 * (N user + N assistant), em ordem cronológica estável (created_at ASC,
 * com tiebreak determinístico). Conteúdos batem com o que foi enviado/
 * respondido. Nenhuma message "perdida".
 *
 * Mocks aplicados:
 *  - `resolveAgent` → agent stub que retorna `fullStream` determinístico
 *    com text-delta curto. Sem chamada à Anthropic.
 *  - `analyzeTurn` → análise neutra. Sem chamada à Anthropic.
 *  - `requireRole` → admin autenticado. Bypass de cookie/session.
 *  - `checkRateLimit` → sempre allow. Permite N POSTs em ráfaga.
 *
 * Tudo o resto (DB, route handlers, orchestrator, saveMessage,
 * createUIMessageStream) roda real. Bug, se existir, vai aparecer no
 * length / ordering / conteúdo das messages.
 */

import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages as messagesTable } from "@/db/schema";

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi
		.fn()
		.mockResolvedValue({
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
//  - "text"      → emite text-delta determinístico (caminho 1: persiste OK).
//  - "tool-only" → emite SÓ um tool-call sem text-delta. Reproduz o cenário
//    onde o agent chama present_value_picker / save_contact_name etc e não
//    acompanha com texto. saveMessage(assistant) do runner.ts:190 só ocorre
//    se fullResponse.length > 0 — então essa assistant message vira ghost
//    no admin.
//  - "mixed"     → alterna text e tool-only por turno (simulating real flow).
const agentModeRef = vi.hoisted(() => ({
	value: "text" as "text" | "tool-only" | "mixed",
	turnCounter: 0,
}));

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
				const lastUser = [...messages]
					.reverse()
					.find((m) => m.role === "user");
				const echo = lastUser?.content ?? "ack";
				const replyText = `ACK_ASSISTANT(${echo.slice(0, 40)})`;
				const mode = agentModeRef.value;
				let useToolOnly: boolean;
				if (mode === "text") useToolOnly = false;
				else if (mode === "tool-only") useToolOnly = true;
				else {
					// "mixed" → mesma distribuição que o relato (~25% turns sem texto).
					// 12 turns reais: turns 3, 7, 11 sem texto → admin viu 9.
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
	const req = new Request("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": "127.0.0.1",
		},
		body: JSON.stringify(body),
	}) as unknown as NextRequest & {
		cookies: { get: (name: string) => { value: string } | undefined };
	};
	req.cookies = { get: () => undefined };
	return req;
}

function makeAdminGetReq(): Request {
	return new Request("http://localhost/api/admin/conversations/x", { method: "GET" });
}

async function cleanup(convId: string): Promise<void> {
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

type AdminGetResponse = {
	conversation: { id: string };
	messages: Array<{
		id: string;
		role: "user" | "assistant" | "system";
		content: string;
		createdAt: string;
	}>;
};

describe("BUG-ADMIN-MESSAGE-MISSING — admin GET retorna TODAS as messages após N turns sequenciais", () => {
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
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "TestUser" })
			.returning();
		convId = c.id;
		agentModeRef.value = "text";
		agentModeRef.turnCounter = 0;
	});

	afterEach(async () => {
		await cleanup(convId);
	});

	it("smoke: agente que sempre emite texto → 12 turns geram 24 messages, ordem correta", async () => {
		agentModeRef.value = "text";
		const N = 12;
		const { sentTexts, body, dbCount } = await runTurnsAndFetch(N);

		expect(body.messages.length).toBe(2 * N);
		expect(dbCount).toBe(2 * N);

		for (let i = 0; i < N; i++) {
			expect(body.messages[2 * i]?.role).toBe("user");
			expect(body.messages[2 * i]?.content).toBe(sentTexts[i]);
			expect(body.messages[2 * i + 1]?.role).toBe("assistant");
		}
	}, 30_000);

	it("REGRESSÃO: agente que responde com tool-call sem texto → assistant message NÃO PODE ser perdida (12 turns → 24 messages, hoje devolve 12 — só os user)", async () => {
		// Reproduz o caminho "agente chamou tool sem acompanhar com texto" —
		// e.g. save_contact_name, present_value_picker. Hoje
		// `src/lib/agent/orchestrator/runner.ts:190` grava a assistant message
		// SÓ quando `fullResponse.length > 0`. Resultado: turn fica como
		// (user, [nada]) — admin vê só metade.
		agentModeRef.value = "tool-only";
		const N = 12;
		const { body, dbCount } = await runTurnsAndFetch(N);

		// CONTRATO: cada turn produz um par (user + assistant) — mesmo que o
		// "assistant turn" seja uma chamada de tool sem texto, o admin precisa
		// ver QUE algo aconteceu (placeholder, marker, ou full assistant row
		// com content vazio + persona). Sem isso, o histórico do admin some.
		expect(
			body.messages.length,
			`Esperava ${2 * N} messages (12 user + 12 assistant/tool-marker); admin retornou ${body.messages.length}. ` +
				`Distribuição de roles: user=${body.messages.filter((m) => m.role === "user").length}, ` +
				`assistant=${body.messages.filter((m) => m.role === "assistant").length}. ` +
				`Causa raiz: runner.ts:190 só persiste assistant quando fullResponse.length > 0.`,
		).toBe(2 * N);
		expect(dbCount).toBe(2 * N);
	}, 30_000);

	it("CENÁRIO DO RELATO: 12 turns com 3 tool-only intercalados → admin DEVE ver 24 messages (não 21/9)", async () => {
		// Bate exatamente com o reporte do usuário: "fiz 12 turns, só vi até o 9".
		// Distribuição mista: turns 3, 7, 11 produzem só tool-call sem texto.
		// Hoje admin recebe 12 user + 9 assistant = 21 (perdeu 3 messages).
		agentModeRef.value = "mixed";
		const N = 12;
		const { body, dbCount } = await runTurnsAndFetch(N);

		const userMsgs = body.messages.filter((m) => m.role === "user");
		const asstMsgs = body.messages.filter((m) => m.role === "assistant");

		expect(
			body.messages.length,
			`Cenário do relato: esperava 24, admin retornou ${body.messages.length} ` +
				`(user=${userMsgs.length}, assistant=${asstMsgs.length}). ` +
				`Mensagens perdidas = ${2 * N - body.messages.length}. ` +
				`Confirma BUG-ADMIN-MESSAGE-MISSING — admin perde turnos em que ` +
				`o agent chamou tool sem responder com texto.`,
		).toBe(2 * N);
		expect(userMsgs.length).toBe(N);
		expect(asstMsgs.length).toBe(N);
		expect(dbCount).toBe(2 * N);
	}, 30_000);
});
