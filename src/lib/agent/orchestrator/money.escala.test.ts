// "R$ 93 mil" não são noventa e três reais.
//
// A regra de `R$` capturava o número e ignorava a escala que vinha logo depois,
// então "crédito de quase R$ 93 mil" produzia DOIS valores: 93.000 (correto,
// pela regra de "N mil") e 93 (espúrio). No gate isso apareceu como acusação
// falsa contra o agente — `golden-objecao-financiamento-pos-reveal`, turno 7:
// "valor SEM LASTRO na fala — R$ 93". O agente tinha dito a verdade: a carta é
// de R$ 92.902 e ele arredondou para "quase R$ 93 mil".
//
// Um FAIL falso é caro duas vezes: manda consertar o que está certo e ensina a
// desconfiar do gate.
import { describe, expect, it } from "vitest";
import { extractMoneyMentions } from "./money";

describe("valores com escala escrita", () => {
	it("'R$ 93 mil' é noventa e três mil, e só isso", () => {
		expect(extractMoneyMentions("crédito de quase R$ 93 mil")).toEqual([93_000]);
	});

	it("'93 mil' sem cifrão também", () => {
		expect(extractMoneyMentions("crédito de quase 93 mil")).toEqual([93_000]);
	});

	it("'R$ 2.258' continua sendo o valor exato", () => {
		expect(extractMoneyMentions("parcela de R$ 2.258")).toContain(2_258);
	});

	it("'R$ 1,2 milhão' escala para 1.200.000", () => {
		expect(extractMoneyMentions("uma carta de R$ 1,2 milhão")).toContain(1_200_000);
	});

	it("os dois na mesma frase não se contaminam", () => {
		const v = extractMoneyMentions("carta de R$ 93 mil com parcela de R$ 2.258");
		expect(v).toContain(93_000);
		expect(v).toContain(2_258);
		expect(v).not.toContain(93);
	});
});
