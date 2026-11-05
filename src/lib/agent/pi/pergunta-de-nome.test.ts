import { describe, expect, it, vi } from "vitest";
import { publicarScores } from "@/lib/observability/sinais/publicar";
import {
	LIMITE_DE_PEDIDOS_DE_NOME,
	pedeONome,
	pedidosDeNomeNoHistorico,
	podePedirONome,
	semPerguntaDeNome,
} from "./pergunta-de-nome";

vi.mock("@/lib/observability/sinais/publicar", () => ({ publicarScores: vi.fn() }));

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
		expect(LIMITE_DE_PEDIDOS_DE_NOME).toBe(2);
		expect(podePedirONome({ nomeConhecido: false, jaPedidos: 0 })).toBe(true);
		expect(podePedirONome({ nomeConhecido: false, jaPedidos: 1 })).toBe(true);
		expect(podePedirONome({ nomeConhecido: false, jaPedidos: 2 })).toBe(false);
		expect(podePedirONome({ nomeConhecido: true, jaPedidos: 0 })).toBe(false);
	});

	it("fala que pede o nome passa inteira e emite o sinal (P11: sem corte)", () => {
		vi.mocked(publicarScores).mockClear();
		const terceiro =
			"Tive um problema ao falar com a administradora e a proposta ainda não saiu.\n\nJá tenho seu CPF e celular guardados.\n\nE como você se chama?";
		expect(semPerguntaDeNome(terceiro)).toBe(terceiro);
		const comLeadIn =
			"Eles ficam guardados com segurança e são usados só nessa proposta. Também não esqueço de perguntar: como você se chama?";
		expect(semPerguntaDeNome(comLeadIn)).toBe(comLeadIn);
		expect(publicarScores).toHaveBeenCalledWith(
			[{ name: "fala_pede_nome", value: 1, dataType: "BOOLEAN" }],
			"remendos-fala",
		);
	});

	it("fala que só pedia o nome passa intacta (o corte é do prompt agora)", () => {
		vi.mocked(publicarScores).mockClear();
		const soNome = "E como você se chama?";
		expect(semPerguntaDeNome(soNome)).toBe(soNome);
		expect(publicarScores).toHaveBeenCalledTimes(1);
	});

	it("o que não é pedido de nome passa intacto e não emite sinal", () => {
		vi.mocked(publicarScores).mockClear();
		for (const fala of [
			"Pra gerar a proposta no seu nome, me manda seu CPF e seu celular.",
			"Qual parcela cabe no seu bolso?",
			"Prazer, Kairo! Vamos às cartas.",
		]) {
			expect(pedeONome(fala), fala).toBe(false);
			expect(semPerguntaDeNome(fala), fala).toBe(fala);
		}
		expect(publicarScores).not.toHaveBeenCalled();
	});
});
