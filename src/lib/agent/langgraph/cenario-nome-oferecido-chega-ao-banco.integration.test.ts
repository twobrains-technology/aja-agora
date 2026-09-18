/**
 * PONTA A PONTA: a apresentação vira `contact_name`, e quem grava é a TOOL.
 *
 * A jornada da vitrine deixou de perguntar o nome a quem já traz o valor — então
 * a única chance de tê-lo é a apresentação espontânea. O caminho que a grava é o
 * modelo chamando `save_contact_name`, com o servidor ancorando o que ele tenta
 * escrever. (A tentativa de capturar por regex no servidor foi revertida; o
 * porquê está em `nodes/capture.nao-inventa-fora-do-gate.test.ts`.)
 *
 * Este arquivo fecha o caminho até o dado que a mesa lê, porque entre a tool e a
 * coluna há um `saveContactName` com âncora, um `persist` com `where isNull` e um
 * `run-turn` que re-hidrata o nome a cada turno. Nenhum teste de unidade passa
 * por esses três.
 *
 * O caso é literal do app, com a vitrine ligada:
 *
 *   👤 "Oi, me chamo Ana e quero um carro de 80 mil"
 *   🤖 [save_contact_name("Ana")] "Oi Ana! …"
 *   banco: contact_name = "Ana"
 */

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

async function nomeNoBanco(conversationId: string): Promise<string | null> {
	const row = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { contactName: true },
	});
	return row?.contactName ?? null;
}

describeIfDb("apresentação espontânea chega à coluna", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("o modelo chama save_contact_name → contact_name = 'Ana'", async () => {
		const r = await runScenario({
			contactName: null,
			turns: [
				{
					user: "Oi, me chamo Ana e quero um carro de 80 mil",
					intent: "providing_info",
					extrai: (meta) => {
						meta.currentCategory = "auto";
						meta.qualifyAnswers = { ...(meta.qualifyAnswers ?? {}), creditMax: 80_000 };
					},
					beats: [
						{
							text: "Perfeito, Ana! Já vou buscar as cartas.",
							toolCalls: [{ name: "save_contact_name", args: { name: "Ana" } }],
						},
						// O `converse` chama `.stream()` de novo depois da tool — sem este
						// beat a fila do modelo scriptado acaba e o turno pendura.
						{ text: " Deixa eu ver o que tem pra 80 mil." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeNoBanco(r.conversationId)).toBe("Ana");
	});

	it("o modelo INVENTA um nome que ninguém disse → o servidor recusa", async () => {
		// A âncora é o que sobra de defesa quando a extração é do modelo, e ela
		// precisa valer no grafo, não só na função. "Cliente" no fecho de uma
		// conversa sem apresentação é o caso real da rodada 7.
		const r = await runScenario({
			contactName: null,
			turns: [
				{
					user: "quero um carro de 80 mil",
					intent: "providing_info",
					extrai: (meta) => {
						meta.currentCategory = "auto";
						meta.qualifyAnswers = { ...(meta.qualifyAnswers ?? {}), creditMax: 80_000 };
					},
					beats: [
						{
							text: "Fechado!",
							toolCalls: [{ name: "save_contact_name", args: { name: "Cliente" } }],
						},
						{ text: " Vamos lá." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeNoBanco(r.conversationId)).toBeNull();
	});

	it("quem NÃO se apresenta continua sem nome — nada é inventado no lugar", async () => {
		// A metade que impede o conserto de virar o defeito "Quitar" de novo: sem
		// apresentação, a coluna fica vazia, e é assim que tem de ser.
		const r = await runScenario({
			contactName: null,
			turns: [
				{
					user: "quero um carro de 80 mil",
					intent: "providing_info",
					extrai: (meta) => {
						meta.currentCategory = "auto";
						meta.qualifyAnswers = { ...(meta.qualifyAnswers ?? {}), creditMax: 80_000 };
					},
					beats: [{ text: "Show! Buscando as cartas de 80 mil." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeNoBanco(r.conversationId)).toBeNull();
	});

	it("apresentação num turno POSTERIOR também é gravada", async () => {
		// Na jornada da vitrine a carta vem antes, e a pessoa costuma se apresentar
		// depois — no turno em que decide seguir. `run-turn` re-hidrata o nome da
		// coluna a cada turno, então este caso passa por um estado diferente do
		// primeiro.
		const r = await runScenario({
			contactName: null,
			turns: [
				{
					user: "quero um carro de 80 mil",
					intent: "providing_info",
					extrai: (meta) => {
						meta.currentCategory = "auto";
						meta.qualifyAnswers = { ...(meta.qualifyAnswers ?? {}), creditMax: 80_000 };
					},
					// DOIS beats: o turno do reveal chama `.stream()` duas vezes (o
					// `scenario.ts` documenta isso). Com um só, o beat do turno seguinte
					// era consumido aqui — e a tool `save_contact_name("Paulo")` rodava
					// no turno cuja fala não tem "Paulo", onde a âncora corretamente a
					// recusa (`name_invalid`). Desalinhamento de beats, não defeito de
					// produto: é a armadilha que este repositório já catalogou.
					beats: [{ text: "Buscando." }, { text: " Achei estas aqui." }],
				},
				{
					user: "gostei dessa. sou o Paulo, como faço?",
					intent: "providing_info",
					beats: [
						{
							text: "Ótimo, Paulo.",
							toolCalls: [{ name: "save_contact_name", args: { name: "Paulo" } }],
						},
						{ text: " Vou te mostrar o próximo passo." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeNoBanco(r.conversationId)).toBe("Paulo");
	});
});
