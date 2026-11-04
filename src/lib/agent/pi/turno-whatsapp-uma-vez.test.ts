// O CARD DE WHATSAPP SAI UMA VEZ POR CONVERSA (líder, 28/10 05:05) — pelo caminho real do turno
// (stream + banco). No print final-02c o card "Continuar pelo WhatsApp" saiu de novo no turno
// "e se a proposta não sair?", com o número que o cliente já tinha dado.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages, usoDeIa } from "@/db/schema";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { subirServidorRoteirizado } from "./testing/servidor-roteirizado";
import { createRunTurnLivre } from "./turno-livre";

const criadas: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const id of criadas.splice(0)) {
		await db.delete(usoDeIa).where(eq(usoDeIa.conversationId, id));
		await db.delete(messages).where(eq(messages.conversationId, id));
		await db.delete(conversations).where(eq(conversations.id, id));
	}
});

describe("card whatsapp_optin: uma vez por conversa", () => {
	it("o modelo pede o card nos dois turnos; só o primeiro chega ao cliente", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
			.returning({ id: conversations.id });
		criadas.push(conv.id);

		const servidor = await subirServidorRoteirizado([
			{ text: "", toolCalls: [{ name: "mostrar_card", args: { tipo: "whatsapp_optin" } }] },
			{ text: "Se a tela fechar, a gente continua por aqui no WhatsApp." },
			{ text: "", toolCalls: [{ name: "mostrar_card", args: { tipo: "whatsapp_optin" } }] },
			{ text: "Sem problema, eu continuo pelo WhatsApp no número que você passou." },
		]);
		const run = createRunTurnLivre({
			provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
			busca: async () => [],
		});
		const cardsPorTurno: number[] = [];
		for (const userText of ["e se eu fechar a tela?", "e se a proposta não sair?"]) {
			const eventos: TurnEvent[] = [];
			for await (const ev of run({
				channel: "web",
				conversationId: conv.id,
				userText,
				isUserTurn: true,
				contactName: null,
			}))
				eventos.push(ev);
			cardsPorTurno.push(
				eventos.filter((e) => e.type === "artifact" && e.artifactType === "whatsapp_optin").length,
			);
		}
		await servidor.fechar();

		expect(cardsPorTurno).toEqual([1, 0]);
	});
});
