// O NOME SE PEDE NA ABERTURA E, NO MÁXIMO, MAIS UMA VEZ (líder, 28/10 04:35) — pelo caminho real do
// turno (stream + banco). Medido nos prints final-02b/03b: três pedidos de nome numa conversa de 6+
// turnos sem nome, com o modelo roteirizado para perguntar TODA vez (o que o Haiku quase fez).
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, messages, usoDeIa } from "@/db/schema";
import { pedeONome } from "./pergunta-de-nome";
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

describe("o nome não é pedido mais que duas vezes na conversa", () => {
	it("seis turnos sem nome, o modelo pergunta toda vez: só os dois primeiros pedidos chegam ao cliente", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
			.returning({ id: conversations.id });
		criadas.push(conv.id);

		const falasDoCliente = [
			"oi, quero um carro",
			"uns 90 mil",
			"pode ser a parcela até 1.200",
			"qual a diferença entre as duas",
			"e o lance, como funciona?",
			"ok, e se eu quiser sair do consórcio?",
		];
		const beats = falasDoCliente.map((_, i) => ({
			text: `Resposta ${i + 1} do vendedor sobre o que você perguntou. E como você se chama?`,
		}));
		const servidor = await subirServidorRoteirizado(beats);
		const run = createRunTurnLivre({
			provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
			busca: async () => [],
		});
		for (const userText of falasDoCliente) {
			for await (const _ of run({
				channel: "web",
				conversationId: conv.id,
				userText,
				isUserTurn: true,
				contactName: null,
			})) {
				// só drena o stream
			}
		}
		await servidor.fechar();

		const falas = (
			await db
				.select({ role: messages.role, content: messages.content })
				.from(messages)
				.where(eq(messages.conversationId, conv.id))
				.orderBy(messages.createdAt)
		)
			.filter((m) => m.role === "assistant" && !m.content.startsWith("[card: "))
			.map((m) => m.content);

		const pedidos = falas.filter(pedeONome);
		expect(falas.length).toBeGreaterThanOrEqual(6);
		expect(pedidos).toHaveLength(2);
		// o resto da resposta não some: só o pedido do nome sai
		for (let i = 2; i < 6; i++) {
			expect(falas.some((f) => f.includes(`Resposta ${i + 1} do vendedor`))).toBe(true);
		}
	});
});
