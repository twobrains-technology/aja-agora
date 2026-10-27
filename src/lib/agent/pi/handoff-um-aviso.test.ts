// UM AVISO DE HANDOFF POR CONVERSA.
//
// Print do dono (27/10/2026, ~19:30): o aviso "Pra esse caso, recomendo conversar direto com
// nosso consultor humano." saía DUAS vezes na mesma conversa — logo depois de "Como você se
// chama?" e de novo depois de "Kairo, abri o caso pra nossa mesa. Um atende humano assume por
// aqui.".
//
// O gatilho era `ctx.pediuHumano`, flag do TURNO: no turno 1 o cliente pediu uma pessoa, ainda
// sem nome — o caso NÃO abriu (`abrirCasoNaMesa` devolve `sem-lead`) — e o aviso saiu assim
// mesmo; no turno 2 o caso abriu de fato e o aviso saiu OUTRA vez, porque nada na conversa
// lembrava que ele já tinha saído.
//
// Este teste roda os DOIS turnos como o cliente viveu (tools e persistência reais, modelo
// roteirizado) e conta os avisos: um por conversa, e o aviso é do caso que EXISTE.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, mesaHandoffs, messages } from "@/db/schema";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre } from "./turno-livre";

// O anúncio para a MESA (WhatsApp do atendente) é fronteira externa desta medição: o que se
// conta aqui é o AVISO QUE O CLIENTE VÊ, que nasce no evento `handoff` do turno.
vi.mock("@/lib/mesa/dispatch", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/mesa/dispatch")>()),
	anunciarCasoNaMesa: vi.fn(),
}));

const criadas: string[] = [];

afterEach(async () => {
	for (const id of criadas.splice(0)) {
		await db.delete(mesaHandoffs).where(eq(mesaHandoffs.conversationId, id));
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function novaConversa(): Promise<string> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	return conv.id;
}

/** Roda um turno inteiro e devolve os eventos do stream. */
async function rodarTurno(args: {
	conversationId: string;
	userText: string;
	beats: Parameters<typeof subirServidorRoteirizado>[0];
}): Promise<{ eventos: TurnEvent[]; fechar: () => Promise<void> }> {
	const servidor = await subirServidorRoteirizado(args.beats);
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
	});
	const eventos: TurnEvent[] = [];
	for await (const ev of run({
		channel: "web",
		conversationId: args.conversationId,
		userText: args.userText,
		isUserTurn: true,
		contactName: null,
	}))
		eventos.push(ev);
	return { eventos, fechar: servidor.fechar };
}

const avisos = (eventos: TurnEvent[]) => eventos.filter((ev) => ev.type === "handoff");

const PEDIDO = {
	toolCalls: [{ name: "falar_com_humano", args: { motivo: "cliente pediu uma pessoa" } }],
};

describe("o aviso de handoff sai UMA vez por conversa", () => {
	it("a sequência do dono (pedido sem nome → nome) tem UM aviso, e é o do caso aberto", async () => {
		const conversationId = await novaConversa();

		// Turno 1 — "quero falar com alguém": o agente pede o nome, e o caso ainda NÃO existe:
		// sem lead não há caso na mesa (`abrirCasoNaMesa` devolve `sem-lead`).
		const primeiro = await rodarTurno({
			conversationId,
			userText: "quero falar com uma pessoa",
			beats: [PEDIDO, { text: "Como você se chama?" }],
		});
		await primeiro.fechar();

		// Turno 2 — "meu nome é Kairo": o nome vira lead, o caso abre, e o agente confirma a
		// transferência.
		const segundo = await rodarTurno({
			conversationId,
			userText: "meu nome é Kairo",
			beats: [PEDIDO, { text: "Kairo, abri o caso pra nossa mesa. Um atende humano assume." }],
		});
		await segundo.fechar();

		// O aviso é do caso que EXISTE: no turno em que ele não abriu, não há aviso nenhum.
		expect(avisos(primeiro.eventos)).toHaveLength(0);
		expect(avisos(segundo.eventos)).toHaveLength(1);
		expect([...avisos(primeiro.eventos), ...avisos(segundo.eventos)]).toHaveLength(1);

		const caso = await db.query.mesaHandoffs.findFirst({
			where: eq(mesaHandoffs.conversationId, conversationId),
		});
		expect(caso?.status).toBe("aberto");

		// E no texto que ficou gravado: UM aviso, não dois.
		const linhas = await db
			.select({ role: messages.role, content: messages.content })
			.from(messages)
			.where(eq(messages.conversationId, conversationId));
		const avisosNoTexto = linhas.filter(
			(m) =>
				m.role === "assistant" &&
				/(consultor humano|abri o caso pra nossa mesa|atendente humano assume)/i.test(m.content),
		);
		expect(avisosNoTexto).toHaveLength(1);
	});

	it("o cliente que insiste em pedir uma pessoa não ganha um segundo aviso", async () => {
		const conversationId = await novaConversa();
		const avisosDaConversa: TurnEvent[] = [];

		for (const fala of [
			"quero falar com uma pessoa",
			"meu nome é Kairo",
			"quero falar com um atendente agora",
		]) {
			const turno = await rodarTurno({
				conversationId,
				userText: fala,
				beats: [PEDIDO, { text: "Deixa comigo." }],
			});
			await turno.fechar();
			avisosDaConversa.push(...avisos(turno.eventos));
		}

		expect(avisosDaConversa).toHaveLength(1);
	});
});
