import { describe, expect, it } from "vitest";
import {
	pedeONome,
	pedidosDeNomeNoHistorico,
	podePedirONome,
	semPerguntaDeNome,
} from "./pergunta-de-nome";

describe("o nome se pede na abertura e no máximo mais uma vez (líder, 28/10 04:35)", () => {
	// A conversa medida dos prints final-02b/03b: três pedidos de nome em 6+ turnos, sem nome.
	const conversa = [
		{ role: "assistant", content: "Que bom! Antes de tudo, como você se chama?" },
		{ role: "user", content: "quero um carro de uns 90 mil" },
		{
			role: "assistant",
			content:
				"A ÂNCORA de 114 meses tem a parcela menor, mas você fica pagando mais tempo. E como você se chama?",
		},
		{ role: "user", content: "gostei da primeira, quero fechar" },
		{
			role: "assistant",
			content: "Ótima escolha! Pra gerar a proposta me manda seu CPF e celular.",
		},
		{ role: "user", content: "meu cpf é 1 e meu celular é 2" },
	];

	it("conta os pedidos de nome pelo histórico (por fala, não por frase)", () => {
		expect(pedidosDeNomeNoHistorico(conversa)).toBe(2);
		expect(
			pedidosDeNomeNoHistorico([
				{ role: "assistant", content: "Como você se chama? Qual o seu nome?" },
				{ role: "user", content: "oi" },
			]),
		).toBe(1);
	});

	it("depois de abertura + uma repetição, não pode mais pedir; nome conhecido, nunca", () => {
		expect(podePedirONome({ nomeConhecido: false, jaPedidos: 0 })).toBe(true);
		expect(podePedirONome({ nomeConhecido: false, jaPedidos: 1 })).toBe(true);
		expect(podePedirONome({ nomeConhecido: false, jaPedidos: 2 })).toBe(false);
		expect(podePedirONome({ nomeConhecido: true, jaPedidos: 0 })).toBe(false);
	});

	it("o terceiro pedido do print sai do texto; o resto da fala fica", () => {
		const terceiro =
			"Tive um problema ao falar com a administradora e a proposta ainda não saiu.\n\nJá tenho seu CPF e celular guardados.\n\nE como você se chama?";
		expect(semPerguntaDeNome(terceiro)).toBe(
			"Tive um problema ao falar com a administradora e a proposta ainda não saiu.\n\nJá tenho seu CPF e celular guardados.",
		);
		const comLeadIn =
			"Eles ficam guardados com segurança e são usados só nessa proposta. Também não esqueço de perguntar: como você se chama?";
		expect(semPerguntaDeNome(comLeadIn)).toBe(
			"Eles ficam guardados com segurança e são usados só nessa proposta.",
		);
	});

	it("a frase que só justifica o pedido sai junto; fala que só pedia o nome vira vazia", () => {
		expect(
			semPerguntaDeNome(
				"Quer que eu tente de novo? Ah, e como você se chama? Assim eu já te chamo pelo nome.",
			),
		).toBe("Quer que eu tente de novo?");
		expect(semPerguntaDeNome("E como você se chama?")).toBe("");
	});

	it("o que não é pedido de nome passa intacto", () => {
		for (const fala of [
			"Pra gerar a proposta no seu nome, me manda seu CPF e seu celular.",
			"Qual parcela cabe no seu bolso?",
			"Prazer, Kairo! Vamos às cartas.",
		]) {
			expect(pedeONome(fala), fala).toBe(false);
			expect(semPerguntaDeNome(fala), fala).toBe(fala);
		}
	});
});
