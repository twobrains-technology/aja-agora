// BUG 19: o card de PREENCHIMENTO sai DEPOIS do texto do turno, mesmo quando o modelo chama a
// tool antes de escrever a pergunta (invariante de layout do servidor, P11).
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	for (const id of criadas.splice(0)) {
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

async function rodar(tipo: string): Promise<TurnEvent[]> {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: "web", status: "active", isSimulated: true })
		.returning({ id: conversations.id });
	criadas.push(conv.id);
	const servidor = await subirServidorRoteirizado([
		{ toolCalls: [{ name: "mostrar_card", args: { tipo, payload: {} } }] },
		{ text: "Carro, anotado! Qual o seu WhatsApp?" },
	]);
	const run = createRunTurnLivre({
		provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
	});
	const eventos: TurnEvent[] = [];
	for await (const ev of run({
		channel: "web",
		conversationId: conv.id,
		userText: "Quero comprar um carro.",
		isUserTurn: true,
		contactName: null,
	}))
		eventos.push(ev);
	await servidor.fechar();
	return eventos;
}

describe("card de preenchimento depois da fala", () => {
	it.each(["whatsapp_optin", "name_prompt"])(
		"%s: a tool vem antes do texto e o card sai depois dele",
		async (tipo) => {
			const eventos = await rodar(tipo);
			const iTexto = eventos.findIndex(
				(e) => e.type === "text-delta" && e.text.includes("Qual o seu WhatsApp"),
			);
			const iCard = eventos.findIndex((e) => e.type === "artifact" && e.artifactType === tipo);
			expect(iTexto, "texto da pergunta no stream").toBeGreaterThanOrEqual(0);
			expect(iCard, `card ${tipo} no stream`).toBeGreaterThanOrEqual(0);
			expect(iCard).toBeGreaterThan(iTexto);
		},
	);
});
