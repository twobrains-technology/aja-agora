/**
 * A recusa por ÂNCORA conta o FATO ao modelo.
 *
 * Caso real, conversa `9b09c3c7` (05/10 15:08): a cliente disse "Bruna", o modelo
 * copiou "Ana" do exemplo do prompt e chamou `save_contact_name("Ana")`. A âncora
 * do servidor recusou — correto — mas devolveu um `name_invalid` opaco; sem saber
 * o PORQUÊ, o modelo inventou "o sistema não deixou registrar Bruna".
 *
 * Aqui se prova no GRAFO (modelo dublado, Postgres de verdade): a recusa por
 * âncora devolve ao MODELO o fato do servidor — o nome proposto não está na fala
 * e a fala do cliente foi "Bruna". É contexto ao modelo, nunca fala ao cliente.
 */
import { ToolMessage } from "@langchain/core/messages";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { modelosRoteirizados } from "./testing/scripted-model";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

async function nomeNoBanco(conversationId: string): Promise<string | null> {
	const row = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { contactName: true },
	});
	return row?.contactName ?? null;
}

describeIfDb("recusa de nome por âncora conta o fato ao modelo", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("a cliente diz 'Bruna' e o modelo propõe 'Ana' → não grava E o tool-result diz por quê", async () => {
		const indice = modelosRoteirizados.length;
		const r = await runScenario({
			contactName: null,
			turns: [
				{
					user: "Oi, me chamo Bruna e quero um carro de 80 mil",
					intent: "providing_info",
					extrai: (meta) => {
						meta.currentCategory = "auto";
						meta.qualifyAnswers = { ...(meta.qualifyAnswers ?? {}), creditMax: 80_000 };
					},
					beats: [
						{
							text: "Perfeito!",
							toolCalls: [{ name: "save_contact_name", args: { name: "Ana" } }],
						},
						{ text: " Deixa eu ver o que tem pra 80 mil." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		// A âncora continua recusando: o nome proposto não vira dado.
		expect(await nomeNoBanco(r.conversationId)).toBeNull();

		// E o que o MODELO recebe de volta carrega o fato, não um código opaco.
		const modelo = modelosRoteirizados[indice];
		const toolResults = modelo.mensagensRecebidas
			.flat()
			.filter((m): m is ToolMessage => m instanceof ToolMessage);
		const conteudo = toolResults.map((m) => JSON.stringify(m.content)).join("\n");

		expect(conteudo).toContain("Ana");
		expect(conteudo).toContain("não foi dito pelo cliente");
		expect(conteudo).toContain("Bruna");
		expect(conteudo).not.toContain("name_invalid");
	});
});