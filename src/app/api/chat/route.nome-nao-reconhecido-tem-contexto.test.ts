/**
 * D1 (PRD 19/08/2026, conversa da Rute) — O AGENTE NÃO PEDE O NOME NO VÁCUO.
 *
 * A cliente respondeu à pergunta do agente ("qual é o tipo de imóvel?") dentro
 * do campo do card de nome — que é o campo que tem onde digitar. O conteúdo
 * ("Casa em condomínio") foi corretamente RECUSADO como nome, e aí o servidor
 * cuspiu, sem passar pelo modelo, uma frase fixa:
 *
 *   "Pode me dizer como prefere ser chamado(a)? Pode ser só o primeiro nome."
 *
 * Nenhuma palavra sobre o que ela acabou de dizer. O "em condomínio" morreu
 * ali, o tipo do imóvel foi perguntado três vezes na mesma conversa, e o
 * registro final guardou apenas "uma casa".
 *
 * A correção não é escrever uma frase melhor no servidor: é **devolver o
 * conteúdo ao turno**. O que ela digitou reentra como fala do cliente, passa
 * pelo analyzer (que extrai o bem, o valor, o que houver) e chega ao modelo com
 * a pergunta anterior no contexto — ele reage ao que ela disse e só então
 * pergunta o nome, com as palavras dele.
 *
 * Mocks: só o adapter (é ele que chama o LLM). Reais: route, DB, validação de
 * nome.
 */

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, messages as messagesTable } from "@/db/schema";

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));

const adapter = vi.hoisted(() => ({
	pipeUserTurn: vi.fn(async (_args: { conversationId: string; userText: string }) => {}),
	pipeDirectiveTurn: vi.fn(async (_args: { conversationId: string; directive: string }) => ({
		emittedVisible: true,
	})),
	pipeGatePrompt: vi.fn(async (_args: unknown) => {}),
	pipeTransitionTurn: vi.fn(async (_args: unknown) => {}),
}));

vi.mock("@/lib/web/adapter", () => adapter);
vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import("./route");

let ipSeq = 0;
function makeReq(body: unknown): NextRequest {
	ipSeq += 1;
	return new NextRequest("http://localhost/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": `10.0.9.${ipSeq % 250}`,
		},
		body: JSON.stringify(body),
	});
}

describe("D1 — conteúdo recusado como nome reentra como fala do cliente", () => {
	let convId: string;

	beforeEach(async () => {
		adapter.pipeUserTurn.mockClear();
		adapter.pipeDirectiveTurn.mockClear();
		adapter.pipeGatePrompt.mockClear();
		const [c] = await db.insert(conversations).values({}).returning();
		convId = c.id;
	});

	afterEach(async () => {
		await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
		await db.delete(leads).where(eq(leads.conversationId, convId));
		await db.delete(conversations).where(eq(conversations.id, convId));
	});

	it('"Casa em condomínio" no campo do nome vira TURNO DO CLIENTE, não frase fixa do servidor', async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Casa em condomínio" }] }],
				action: {
					kind: "gate",
					gate: "name",
					value: { name: "Casa em condomínio" },
					label: "Casa em condomínio",
				},
			}),
		);
		const streamed = await res.text();

		// O modelo é quem responde — com o que ela disse no contexto.
		expect(adapter.pipeUserTurn).toHaveBeenCalledTimes(1);
		expect(adapter.pipeUserTurn.mock.calls[0][0]).toMatchObject({
			conversationId: convId,
			userText: "Casa em condomínio",
		});

		// A frase fixa do servidor não existe mais.
		expect(streamed).not.toContain("prefere ser chamado");
		expect(adapter.pipeGatePrompt).not.toHaveBeenCalled();

		// Nome inválido não vira nome do lead.
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName ?? null).toBeNull();
	});

	it("a fala do cliente é gravada UMA vez (o turno persiste, o route não duplica)", async () => {
		await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Casa em condomínio" }] }],
				action: {
					kind: "gate",
					gate: "name",
					value: { name: "Casa em condomínio" },
					label: "Casa em condomínio",
				},
			}),
		).then((r) => r.text());

		// O adapter está mockado (não persiste), então o que sobra no banco é o que
		// o ROUTE gravou: nada — a persistência da fala é do turno.
		const msgs = await db.query.messages.findMany({
			where: eq(messagesTable.conversationId, convId),
		});
		expect(msgs.filter((m) => m.role === "user")).toHaveLength(0);
	});

	it("campo vazio não vira turno mudo — o gate volta a perguntar", async () => {
		// O componente desabilita o envio com o campo vazio, mas a API é
		// alcançável direto. Turno de cliente com texto vazio chegaria ao modelo
		// sem nada a responder, e turno mudo é o pior desfecho possível.
		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "   " }] }],
				action: { kind: "gate", gate: "name", value: { name: "   " }, label: "   " },
			}),
		);
		await res.text();

		expect(adapter.pipeUserTurn).not.toHaveBeenCalled();
		expect(adapter.pipeGatePrompt).toHaveBeenCalledTimes(1);
	});

	it("nome plausível continua sendo salvo e conduzido pelo directive (sem regressão)", async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [{ role: "user", parts: [{ type: "text", text: "Pode me chamar de Rute" }] }],
				action: {
					kind: "gate",
					gate: "name",
					value: { name: "Rute" },
					label: "Pode me chamar de Rute",
				},
			}),
		);
		await res.text();

		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Rute");
		expect(adapter.pipeDirectiveTurn).toHaveBeenCalledTimes(1);
		expect(adapter.pipeUserTurn).not.toHaveBeenCalled();

		// A fala do cliente ("Pode me chamar de Rute") continua no histórico.
		const msgs = await db.query.messages.findMany({
			where: eq(messagesTable.conversationId, convId),
		});
		expect(msgs.filter((m) => m.role === "user").map((m) => m.content)).toEqual([
			"Pode me chamar de Rute",
		]);
	});
});
