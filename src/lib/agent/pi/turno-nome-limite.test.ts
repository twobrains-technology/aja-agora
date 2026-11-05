// P11 (Kairo, 05/11) — O TETO DE PEDIDOS DE NOME SAIU DO RUNTIME.
//
// O remendo (`pergunta-de-nome.ts` cortava o pedido que passasse do limite) virou
// conduta na caixa de prompt. Este teste prova o novo contrato pelo caminho real
// do turno: TODOS os pedidos de nome que o modelo fizer chegam ao cliente (nada
// é cortado), e quando um turno pede o nome já depois do limite do histórico, o
// sinal `pedido_de_nome_recorrente` registra o caso para correção de conduta.
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

describe("o teto de pedidos de nome é conduta agora, não corte", () => {
	it("seis turnos sem nome, o modelo pergunta toda vez: todos os pedidos chegam ao cliente", async () => {
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
		// O corte saiu: TODOS os pedidos que o modelo fez chegam ao cliente.
		expect(pedidos).toHaveLength(6);
		for (let i = 0; i < 6; i++) {
			expect(falas.some((f) => f.includes(`Resposta ${i + 1} do vendedor`))).toBe(true);
		}
	});

	it("do terceiro pedido em diante, o sinal `pedido_de_nome_recorrente` registra o caso", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "web", status: "active", isSimulated: true, contactName: null })
			.returning({ id: conversations.id });
		criadas.push(conv.id);

		const falasDoCliente = ["oi, quero um carro", "uns 90 mil", "parcela até 1.200", "e o lance?"];
		const beats = falasDoCliente.map((_, i) => ({
			text: `Resposta ${i + 1} do vendedor. E como você se chama?`,
		}));
		const servidor = await subirServidorRoteirizado(beats);
		const logs: string[] = [];
		const espiar = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			logs.push(args.map((a) => String(a)).join(" "));
		});
		const run = createRunTurnLivre({
			provider: { id: "litellm", baseUrl: servidor.url, apiKey: "teste", model: "roteirizado" },
			busca: async () => [],
		});
		try {
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
		} finally {
			espiar.mockRestore();
			await servidor.fechar();
		}

		// Turnos 1 e 2: dentro do limite (0 e 1 pedidos antes) — sem sinal.
		// Turnos 3 e 4: já depois do limite (2 e 3 pedidos antes) — sinal a cada turno.
		const sinais = logs.filter(
			(l) => l.includes("[sinal]") && l.includes("pedido_de_nome_recorrente"),
		);
		expect(sinais).toHaveLength(2);
		expect(sinais[0]).toContain('"value":2');
		expect(sinais[1]).toContain('"value":3');
	});
});
