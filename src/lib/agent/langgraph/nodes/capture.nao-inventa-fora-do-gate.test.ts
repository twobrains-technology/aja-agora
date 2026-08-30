/**
 * Fora do gate `name`, o servidor NÃO batiza ninguém.
 *
 * Este arquivo trava uma REVERSÃO, e o motivo dela é a lição mais cara desta
 * entrega. A vitrine tirou o gate `name` do caminho de quem já traz o valor, e
 * com isso a apresentação espontânea ("me chamo Ana e quero um carro de 80 mil")
 * passou a não ter quem a lesse. A primeira tentativa foi capturar aqui, por
 * FORMA da apresentação. A sonda contra o código, com frases do domínio:
 *
 *   "meu nome é sujo no serasa, tem problema?"             → "Sujo"
 *   "não sou o único que decide, vou falar com minha esposa"  → "Único"
 *   "sou o comprador, mas quem vai usar é minha esposa"       → "Comprador"
 *   "pode me chamar de louco, mas prefiro financiamento"      → "Louco"
 *
 * Nenhuma guarda fecha isso — é lista de palavras contra a língua, o
 * anti-padrão que o `CLAUDE.md` descreve nome por nome. E o dano é permanente:
 * `persist` grava com `isNull(contactName)`, então o primeiro erro trava a
 * coluna, o agente passa a saudar "Perfeito, Sujo!" e a mesa recebe o lead
 * assim.
 *
 * Dentro do gate a mesma heurística é segura, e continua valendo: ali a pergunta
 * ACABOU de ser feita e a resposta é curta. Fora dele, quem lê a frase inteira e
 * distingue "me chamo Ana" de "meu nome está sujo no Serasa" é o MODELO, com
 * `save_contact_name` — e o servidor ancora o que ele tentar gravar.
 */
import { describe, expect, it } from "vitest";
import { captureAnswerNode } from "@/lib/agent/langgraph/nodes/capture";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

function foraDoGate(userText: string, extra: Partial<AgentGraphStateType> = {}) {
	return {
		isUserTurn: true,
		userText,
		gate: "search",
		contactName: null,
		// O card do nome já apareceu em algum momento — é o que isola o caso deste
		// arquivo (estar FORA do gate) do caso do
		// `cenario-nome-nao-e-a-resposta-do-modelo.test.ts` (estar no gate sem o
		// card ter saído). Sem o fixture, os dois se confundiriam e este arquivo
		// passaria pelo motivo errado.
		funnel: { nameCardExibido: true },
		...extra,
	} as unknown as AgentGraphStateType;
}

describe("captureAnswerNode — fora do gate `name` não se grava nome", () => {
	it("as frases do domínio que a captura por forma batizava", () => {
		for (const frase of [
			"meu nome é sujo no serasa, tem problema?",
			"não sou o único que decide, vou falar com minha esposa",
			"sou o comprador, mas quem vai usar é minha esposa",
			"sou o interessado na simulação",
			"pode me chamar de louco, mas prefiro financiamento",
			"aqui é o meu limite: 2 mil por mês",
			"não sou o titular da conta",
			"sou a favor de esperar um pouco",
		]) {
			expect(captureAnswerNode(foraDoGate(frase)), frase).toEqual({});
		}
	});

	it("nem mesmo a apresentação de verdade — quem grava essa é a tool do modelo", () => {
		// Não é descuido: é a divisão. Perder aqui é o preço de não inventar acima,
		// e o nome não se perde — a regra da tool está no SYSTEM_PROMPT.
		expect(captureAnswerNode(foraDoGate("Oi, me chamo Ana e quero um carro"))).toEqual({});
	});

	it("o gate `name` continua capturando — a reversão não mexeu nele", () => {
		expect(captureAnswerNode(foraDoGate("Mirella", { gate: "name" }))).toEqual({
			contactName: "Mirella",
		});
		expect(captureAnswerNode(foraDoGate("uma casa", { gate: "name" }))).toEqual({});
	});

	it("e NEM no gate `name` captura antes de o card ter aparecido (30/08/2026)", () => {
		// A trava nova. Com o gate `name` vivendo depois do valor do bem, ele pode
		// estar ativo enquanto o MODELO pergunta outra coisa — e aí a resposta é
		// para ele, não para o funil.
		const semCard = {
			isUserTurn: true,
			userText: "Mirella",
			gate: "name",
			contactName: null,
			funnel: {},
		} as unknown as AgentGraphStateType;
		expect(captureAnswerNode(semCard)).toEqual({});
	});
});
