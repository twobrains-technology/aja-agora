/**
 * O cliente responde o nome que o AGENTE pediu — e o servidor tem que gravar.
 *
 * ── Visto ao vivo, no browser, em 31/08/2026 ────────────────────────────────
 *
 *   🤖  Perfeito! R$ 80 mil é um bom orçamento para um carro legal.
 *       Qual é o seu primeiro nome, pra eu poder te chamar?
 *   👤  Marina
 *   🤖  Prazer, Marina!
 *   📋  [card]  Como posso te chamar?          ← pedindo de novo
 *
 * O modelo entendeu. O servidor não gravou. E como não gravou, `nextGate`
 * continuou devolvendo `name` e o card foi pendurado embaixo do "Prazer,
 * Marina!" — no gate mais frágil do funil, pedindo o dado que a pessoa acabara
 * de dar.
 *
 * ── A causa, e por que ela é minha ──────────────────────────────────────────
 *
 * `captureAnswerNode` passou a exigir `funnel.nameCardExibido` nesta mesma
 * branch, e por um bom motivo: sem essa âncora, qualquer resposta curta com o
 * gate `name` ativo virava nome — foi assim que nasceu o lead chamado "Suv",
 * respondendo "SUV" à pergunta do MODELO sobre carroceria.
 *
 * Mas a âncora escolhida cobria um caminho só. Quando quem pergunta o nome é o
 * MODELO (e não o card — que cede a vez justamente quando o modelo já
 * perguntou, FIX-379), `nameCardExibido` é falso e a resposta se perde.
 *
 * ── A correção: DUAS autorizações, o mesmo princípio ────────────────────────
 *
 * A captura passa a aceitar dois fatos do servidor, e continua recusando tudo
 * o mais:
 *
 *   `nameCardExibido`      — o card do nome saiu no turno anterior;
 *   `modelAskedForName`    — o modelo pediu o nome no turno anterior.
 *
 * O segundo é temporalmente correto sem precisar ser consumido: `converse`
 * reescreve esse sinal a cada turno. Se o modelo pede o nome no turno N e no
 * N+1 pergunta "prefere sedã ou SUV?", o sinal já é falso quando a resposta
 * "SUV" chega no N+2 — que é exatamente o caso do lead "Suv", e por isso ele
 * continua coberto aqui embaixo.
 *
 * Skip se DATABASE_URL ausente.
 */

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { limparCenario, runScenario } from "./testing/scenario";

/** O nome vive na COLUNA `conversations.contact_name`, não no metadata — é de
 *  lá que a mesa e o agente o leem. */
async function nomeNoBanco(conversationId: string): Promise<string | null> {
	const row = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { contactName: true },
	});
	return row?.contactName ?? null;
}

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const PERGUNTA_REAL =
	"Perfeito! R$ 80 mil é um bom orçamento para um carro legal. Qual é o seu primeiro nome, pra eu poder te chamar?";

describeIfDb("o nome que o modelo pediu", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("é gravado, e o card não pede de novo", async () => {
		const r = await runScenario({
			contactName: null,
			metaInicial: { currentCategory: "auto", qualifyAnswers: { creditMax: 80_000 } },
			turns: [
				{ user: "Quero comprar um carro.", beats: [{ text: PERGUNTA_REAL }] },
				{ user: "Marina", beats: [{ text: "Prazer, Marina!" }] },
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeNoBanco(r.conversationId)).toBe("Marina");
		// E o card não aparece embaixo do "Prazer, Marina!".
		expect(r.turns[1].trilha).not.toContain("gate:name");
	});

	it("vale mesmo quando o card é SUPRIMIDO — o cliente perguntou algo antes", async () => {
		// `decideShowGate` suprime o card quando o turno é uma PERGUNTA do cliente
		// (`asking_question`). Nesse caminho o modelo responde a dúvida e emenda o
		// pedido de nome no texto, mas nenhum card sai — então `nameCardExibido`
		// nunca fica verdadeiro, e a âncora do card sozinha perde a resposta.
		const r = await runScenario({
			contactName: null,
			metaInicial: { currentCategory: "auto", qualifyAnswers: { creditMax: 80_000 } },
			turns: [
				{
					user: "Consórcio tem juros?",
					intent: "asking_question",
					beats: [{ text: `Não tem juros, só taxa de administração. ${PERGUNTA_REAL}` }],
				},
				{ user: "Marina", beats: [{ text: "Prazer, Marina!" }] },
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeNoBanco(r.conversationId)).toBe("Marina");
	});

	it("o lead 'Suv' continua impossível — o modelo perguntou OUTRA coisa", async () => {
		// A regressão que a âncora original existia para impedir. O modelo pergunta
		// a carroceria; a resposta "SUV" não pode virar o nome do lead.
		const r = await runScenario({
			contactName: null,
			metaInicial: { currentCategory: "auto", qualifyAnswers: { creditMax: 80_000 } },
			turns: [
				{ user: "Quero comprar um carro.", beats: [{ text: "Boa escolha. Prefere sedã ou SUV?" }] },
				{ user: "SUV", beats: [{ text: "SUV é ótima escolha." }] },
			],
		});
		criadas.push(r.conversationId);

		expect(await nomeNoBanco(r.conversationId)).not.toBe("Suv");
	});

	it("o GATE sozinho não serve como autorização — medido, não suposto", async () => {
		// Registro de uma alternativa que foi proposta e DESCARTADA com prova.
		//
		// A sugestão era trocar o predicado sobre o texto ("o modelo pediu o
		// nome?") pelo fato do servidor ("eu MANDEI o modelo pedir o nome?", isto
		// é, `buildGateContextText` injetou `GATE_INTENT.name` naquele turno). O
		// argumento é bom: fato de servidor é mais firme que texto.
		//
		// Só que ele não distingue os dois casos. Sondei `gateAtivo` dentro do
		// `converse` no cenário do lead "Suv" e ele vale `"name"` nos DOIS turnos:
		//
		//   [dbg-gate] {"gateAtivo":"name","gate":"name","answered":"name"}
		//   [dbg-gate] {"gateAtivo":"name","gate":"name","answered":"name"}
		//
		// O servidor mandou pedir o nome; o modelo perguntou a carroceria. Autorizar
		// pelo pedido do servidor capturaria "SUV" — seria o defeito original de
		// volta, com uma âncora de aparência mais sólida.
		//
		// O que separa os dois casos é se o modelo OBEDECEU, e a única evidência
		// de obediência é o texto que ele emitiu. Daí o predicado ser sobre o
		// texto — e daí ele precisar ser estreito (ver `detect-name-turn.test.ts`).
		//
		// Este caso existe para que a troca não seja refeita por parecer melhor.
		const r = await runScenario({
			contactName: null,
			metaInicial: { currentCategory: "auto", qualifyAnswers: { creditMax: 80_000 } },
			turns: [
				{ user: "Quero comprar um carro.", beats: [{ text: "Boa escolha. Prefere sedã ou SUV?" }] },
				{ user: "SUV", beats: [{ text: "SUV é ótima escolha." }] },
			],
		});
		criadas.push(r.conversationId);

		// O gate era `name` nos dois turnos (sondado), e mesmo assim nada foi gravado.
		expect(await nomeNoBanco(r.conversationId)).toBeNull();
	});

	it("a autorização não vaza para o turno seguinte", async () => {
		// O modelo pede o nome no turno 1; no turno 2 pergunta a carroceria. A
		// resposta do turno 3 responde à SEGUNDA pergunta, e não pode ser lida como
		// nome só porque houve um pedido de nome dois turnos atrás.
		const r = await runScenario({
			contactName: null,
			metaInicial: { currentCategory: "auto", qualifyAnswers: { creditMax: 80_000 } },
			turns: [
				{ user: "Quero comprar um carro.", beats: [{ text: PERGUNTA_REAL }] },
				{ user: "Depois eu digo", beats: [{ text: "Sem problema. Prefere sedã ou SUV?" }] },
				{ user: "Sedã", beats: [{ text: "Anotado." }] },
			],
		});
		criadas.push(r.conversationId);

		const nome = await nomeNoBanco(r.conversationId);
		expect(nome).not.toBe("Seda");
		expect(nome).not.toBe("Sedã");
	});
});
