// Produção, 2026-08 (conv do Erik, literal do banco):
//
//   agente: "Que ótimo! Imóvel é um investimento de longo prazo que realmente
//            transforma a vida. Já tem uma ideia do que está procurando?"
//   card:   [input pedindo o NOME]
//   Erik:   "Pode me chamar de Erik"
//   agente: "Ótimo, Erik! Imóvel é um investimento que realmente transforma a
//            vida. Já tem um imóvel específico em vista, ou ainda está
//            procurando?"
//
// A cadeia inteira do defeito num turno só: o texto pergunta o IMÓVEL, o card
// pede o NOME, o cliente responde ao card (é o que tem campo pra digitar), a
// pergunta do texto morre sem resposta — e o agente a repete no turno seguinte,
// parecendo um robô. Foi o padrão mais frequente da base.
//
// A raiz é `modelAsked` ser verdadeiro pra QUALQUER pergunta, não pra a pergunta
// DO GATE. Ele foi desenhado pra decidir se o card reinjeta a pergunta canônica
// (evitar pergunta em dobro), e nesse papel funciona. Mas quando a pergunta do
// modelo é sobre OUTRA coisa, calar o card não basta: um campo mudo pedindo
// nome, embaixo de uma pergunta sobre imóvel, é a mesma competição de antes.
//
// Regra (decisão do Kairo — "card só quando a fala pedir"): quem manda é a fala.

import { describe, expect, it } from "vitest";
import { deveEmitirCardDeNome } from "@/lib/agent/langgraph/nodes/emit-card";
import { perguntouONome } from "@/lib/agent/orchestrator/detect-name-turn";

/** Espelha o que o `converse` monta: a decisão é booleana, mas o teste ancora
 * nos textos LITERAIS de produção — é o texto que precisa continuar sendo
 * classificado certo quando alguém mexer no detector. */
const comFala = (modelAsked: boolean, textoDoTurno: string, jaAdiouUmaVez = false) =>
	deveEmitirCardDeNome({
		modelAsked,
		modelAskedForName: perguntouONome(textoDoTurno),
		jaAdiouUmaVez,
	});

describe("deveEmitirCardDeNome", () => {
	it("modelo mudo — o card aparece e leva a pergunta canônica (a rede não pode cair)", () => {
		expect(comFala(false, "")).toBe(true);
	});

	it("modelo falou mas não perguntou nada — o card ainda é quem pergunta", () => {
		expect(comFala(false, "Que ótimo, consórcio é uma boa!")).toBe(true);
	});

	it("modelo perguntou o NOME — o card complementa a fala dele", () => {
		for (const t of [
			"Antes de eu te encontrar a melhor opção, como posso te chamar?",
			"E aí, qual é o seu nome?",
			"Como você se chama?",
			"Como prefere ser chamado?",
		]) {
			expect(comFala(true, t), t).toBe(true);
		}
	});

	it("modelo perguntou OUTRA coisa — o card de nome não entra na frente da fala dele", () => {
		const falaDoErik =
			"Que ótimo! Imóvel é um investimento de longo prazo que realmente transforma a vida. Já tem uma ideia do que está procurando?";
		expect(comFala(true, falaDoErik)).toBe(false);
	});

	it("outras perguntas legítimas que não são o nome também seguram o card", () => {
		for (const t of [
			"Qual modelo de carro você tem em mente?",
			"Você já fez consórcio antes?",
			"Quanto você pretende investir?",
		]) {
			expect(comFala(true, t), t).toBe(false);
		}
	});

	// O limite que reconcilia com o FIX-379: ceder a vez é UMA vez. Se o modelo
	// insistir em perguntar outra coisa no turno seguinte, o card entra e o funil
	// retoma a ordem — o pior caso é um turno a mais, nunca a venda em círculo.
	it("na SEGUNDA vez o card sai mesmo com o modelo perguntando outra coisa", () => {
		const falaDoErik =
			"Que ótimo! Imóvel é um investimento de longo prazo que realmente transforma a vida. Já tem uma ideia do que está procurando?";
		expect(comFala(true, falaDoErik, false)).toBe(false);
		expect(comFala(true, falaDoErik, true)).toBe(true);
	});
});
