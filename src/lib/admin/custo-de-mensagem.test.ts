// Custo de MENSAGEM — a contagem é fato do servidor, o preço é cadastro.
//
// Bruna, 22/09: *"o custo de IA e das mensagens de remarketing"*. A segunda
// metade é esta. Ela tem duas partes que NÃO se misturam:
//
//   (a) CONTAGEM — quantas mensagens de template saíram no período, por
//       template. Fato do servidor, verificável, não depende de cadastro.
//   (b) PREÇO    — quanto custa cada uma. Cadastro (`custos_config`), porque a
//       tabela da Meta muda por categoria e país.
//
// A lei: **sem preço cadastrado a tela mostra a CONTAGEM e diz "sem preço
// cadastrado" — nunca "R$ 0,00".** Zero seria afirmar que a mensagem foi de
// graça, e o que existe é a falta do preço.

import { describe, expect, it } from "vitest";
import { montarCustoDeMensagem } from "./custo-de-mensagem";

describe("montarCustoDeMensagem", () => {
	it("com preço cadastrado, o custo é preço × quantidade", () => {
		const resultado = montarCustoDeMensagem({
			contagens: [
				{ template: "remarketing_retomada", quantidade: 3 },
				{ template: "remarketing_oferta", quantidade: 2 },
			],
			precoUnitarioCents: 12,
		});

		expect(resultado.quantidade).toBe(5);
		expect(resultado.custo).toEqual({
			tipo: "valor",
			centavos: 60,
			precoUnitarioCents: 12,
		});
	});

	it("sem preço, a contagem continua e o custo NÃO é zero: é 'sem_preco'", () => {
		const resultado = montarCustoDeMensagem({
			contagens: [{ template: "remarketing_retomada", quantidade: 5 }],
			precoUnitarioCents: null,
		});

		expect(resultado.quantidade).toBe(5);
		expect(resultado.porTemplate).toEqual([{ template: "remarketing_retomada", quantidade: 5 }]);
		expect(resultado.custo).toMatchObject({ tipo: "motivo", motivo: "sem_preco" });
		expect(JSON.stringify(resultado.custo)).not.toContain("0");
	});

	it("período sem nenhuma mensagem é quantidade zero e custo zero real (não ausência de preço)", () => {
		const resultado = montarCustoDeMensagem({ contagens: [], precoUnitarioCents: 12 });

		expect(resultado.quantidade).toBe(0);
		expect(resultado.custo).toEqual({ tipo: "valor", centavos: 0, precoUnitarioCents: 12 });
	});

	it("ordena por template, para a tela não mudar de ordem entre leituras", () => {
		const resultado = montarCustoDeMensagem({
			contagens: [
				{ template: "zebra", quantidade: 1 },
				{ template: "alfa", quantidade: 2 },
			],
			precoUnitarioCents: 10,
		});
		expect(resultado.porTemplate.map((c) => c.template)).toEqual(["alfa", "zebra"]);
	});
});
