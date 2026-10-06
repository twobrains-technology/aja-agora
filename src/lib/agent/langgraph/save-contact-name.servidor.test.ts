/**
 * A recusa por ÂNCORA num turno SERVER-AUTHORED (sem fala do cliente).
 *
 * `save_contact_name` só ancora no que o CLIENTE disse neste turno. Em turno
 * server-authored o grafo passa `userText: null` de propósito (a "fala" do
 * turno é a DIRECTIVE do servidor — ver `converse.ts:500` e o tipo
 * `ConsorcioToolsContext.userText`). O defeito: o tool-result da recusa dizia
 * ao modelo `A fala dele foi: ""` e mandava pedir o nome de novo — uma fala
 * vazia inventada e um pedido repetido, num turno em que o cliente não falou.
 *
 * Aqui se prova no GRAFO (modelo dublado, Postgres de verdade): sem fala do
 * cliente neste turno, o fato entregue ao MODELO não carrega fala vazia nem
 * manda repetir o pedido de nome. É contexto ao modelo, nunca fala ao cliente.
 */
import { ToolMessage } from "@langchain/core/messages";
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";
import { modelosRoteirizados } from "./testing/scripted-model";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("recusa de nome por âncora em turno do servidor", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("turno server-authored sem fala do cliente → o tool-result não inventa fala vazia nem manda pedir o nome de novo", async () => {
		const indice = modelosRoteirizados.length;
		const r = await runScenario({
			contactName: null,
			turns: [
				{
					// Turno do SERVIDOR (directive): o cliente não falou nada aqui.
					user: "[DIRECTIVE] retome a conversa",
					isUserTurn: false,
					intent: "neutral",
					beats: [
						{
							text: "Deixa eu retomar.",
							toolCalls: [{ name: "save_contact_name", args: { name: "Ana" } }],
						},
						{ text: " Pronto." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		const modelo = modelosRoteirizados[indice];
		const toolResults = modelo.mensagensRecebidas
			.flat()
			.filter((m): m is ToolMessage => m instanceof ToolMessage);
		const conteudo = toolResults
			.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
			.join("\n");

		// O que NÃO pode continuar acontecendo: a fala vazia inventada e o pedido repetido.
		expect(conteudo).not.toContain("A fala dele foi");
		expect(conteudo).not.toContain("pergunte o nome");

		// E o fato verdadeiro tem que chegar ao modelo:
		expect(conteudo).toContain("Ana");
		expect(conteudo).toContain("não foi dito pelo cliente");
	});
});
