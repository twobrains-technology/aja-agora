// DOIS CASOS REAIS MANDAM NESTE TESTE.
//
// 1. Print 13 (27/10 22:35): *"Ela tem prazo mais curto que a de 94 meses da ÂNCORA"* sobre a
//    carta de 96 meses. 96 > 94, então a fala estava errada. Ordem do líder: "comparação de
//    prazo/parcela tem de bater com os números das cartas na mesa".
// 2. Conversa de teste (28/10, depois do `9f5ccecf`): *"a da CANOPUS com parcela de R$ 1.176,39 …
//    com maior prazo que a da ÂNCORA de 114 meses"*. A CANOPUS dessa parcela tem 96 meses, a
//    ÂNCORA tem 114 — "maior" é falso. A primeira versão tomava a primeira carta da tela como
//    sujeito e deixou passar; o sujeito é a carta que a PRÓPRIA FALA cita.
//
// As cartas abaixo são as quatro que a ferramenta devolveu naquela conversa (lidas do banco).
//
// Desde o remendo P11 (05/11): a REESCRITA saiu do código (P11 — conversa é do prompt). A
// verificação FICA: fala que contradiz a mesa (direção trocada, prazo inventado, sujeito
// inidentificável) sai INALTERADA e emite o sinal `fala_contradiz_mesa` via `publicarScores`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicarScores } from "@/lib/observability/sinais/publicar";
import {
	corrigirComparacaoDeParcela,
	corrigirComparacaoDePrazo,
	corrigirComparacoes,
	semPrazoInventado,
} from "./comparacao-de-prazo";

vi.mock("@/lib/observability/sinais/publicar", () => ({ publicarScores: vi.fn() }));

const MESA = {
	cartasDaMesa: [
		{ administradora: "ÂNCORA", parcela: 1099.62, prazoMeses: 114 },
		{ administradora: "ÂNCORA", parcela: 1454.51, prazoMeses: 94 },
		{ administradora: "CANOPUS", parcela: 1176.39, prazoMeses: 96 },
		{ administradora: "CANOPUS", parcela: 1181.33, prazoMeses: 116 },
	],
};

const sinal = () =>
	(publicarScores as ReturnType<typeof vi.fn>).mock.calls.filter(
		([scores, onde]) =>
			onde === "remendos-fala" &&
			(scores as { name: string; value: number; dataType: string }[]).some(
				(s) => s.name === "fala_contradiz_mesa" && s.dataType === "NUMERIC",
			),
	);

const ultimoValor = () => {
	const chamadas = sinal();
	const ultimas = (chamadas.at(-1)?.[0] ?? []) as { name: string; value: number }[];
	return ultimas.find((s) => s.name === "fala_contradiz_mesa")?.value;
};

beforeEach(() => {
	(publicarScores as ReturnType<typeof vi.fn>).mockClear();
});

describe("comparação de prazo com o número da mesa", () => {
	it("o caso medido hoje: CANOPUS de 96 não tem MAIOR prazo que a ÂNCORA de 114 — sinal, fala inteira", () => {
		const dito =
			"A minha recomendação para você é a da CANOPUS com parcela de R$ 1.176,39: é um meio-termo bom, com maior prazo que a da ÂNCORA de 114 meses e uma parcela bem acessível.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(1);
	});

	it("a frase do print 13: 96 é MAIS LONGO que 94 — contradiz, sinal, fala inteira", () => {
		const dito =
			"A da CANOPUS com parcela de R$ 1.176,39 é a que eu recomendo. Ela tem prazo mais curto que a de 94 meses da ÂNCORA.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(1);
	});

	it("a direção certa passa intacta e sem sinal", () => {
		for (const dito of [
			"A da CANOPUS com parcela de R$ 1.176,39 tem prazo mais curto que a de 114 meses.",
			"A de 116 tem prazo mais longo que a de 94 meses.",
			"A de R$ 1.454,51 tem prazo menor que a de R$ 1.099,62.",
		]) {
			(publicarScores as ReturnType<typeof vi.fn>).mockClear();
			expect(corrigirComparacaoDePrazo(dito, MESA), dito).toBe(dito);
			expect(sinal(), dito).toHaveLength(0);
		}
	});

	it("duas cartas citadas só pela parcela também são conferidas", () => {
		const errado = "A de R$ 1.454,51 tem prazo maior que a de R$ 1.099,62.";
		expect(corrigirComparacaoDePrazo(errado, MESA)).toBe(errado);
		expect(sinal()).toHaveLength(1);
	});

	it("prazo que não é de carta nenhuma da mesa: invenção — sinal, fala inteira", () => {
		const dito = "A da CANOPUS com parcela de R$ 1.176,39 tem prazo mais curto que a de 84 meses.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(1);
	});

	it("sem saber de quem se fala: não se afirma direção — sinal, fala inteira", () => {
		// "Ela" sem nenhuma carta citada antes: não há sujeito para conferir.
		const dito = "Ela tem prazo mais curto que a de 94 meses.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
	});

	it("frase sem comparativo de prazo não é tocada nem sinalizada", () => {
		const dito = "A carta é de R$ 90 mil, parcela de R$ 1.176,39 em 96 meses.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});

	it("'menor prazo' segue a mesma régua", () => {
		const dito = "A da CANOPUS com parcela de R$ 1.176,39 tem menor prazo que a de 94 meses.";
		expect(corrigirComparacaoDePrazo(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
	});
});

describe("o turno aplica a régua — o balão que vai à tela", () => {
	it("montarTrechoDeSaida emite o sinal e deixa a fala INALTERADA (a reescrita saiu na onda 2 do call site)", async () => {
		const { montarTrechoDeSaida } = await import("./turno-livre");
		const dito =
			"É a da CANOPUS com parcela de R$ 1.176,39: um meio-termo bom, com maior prazo que a da ÂNCORA de 114 meses.";
		const saida = montarTrechoDeSaida({
			texto: dito,
			cardsDoTurno: [],
			temCartaNaTela: true,
			...MESA,
		});
		expect(saida.texto).toContain("maior prazo que a da ÂNCORA de 114 meses");
		expect(sinal().length).toBeGreaterThanOrEqual(1);
	});
});

describe("comparação de PARCELA com o número da mesa", () => {
	it("o caso medido: a ÂNCORA de 94 meses NÃO tem parcela menor que a outra da ÂNCORA — sinal, fala inteira", () => {
		// Fala real da conversa de teste de 28/10 (a segunda frase herda a carta da primeira).
		const dito =
			"A de menor prazo é a da ÂNCORA, com 94 meses. Ela é a minha recomendação para você também, pois tem o menor prazo e parcela menor que a outra da ÂNCORA.";
		expect(corrigirComparacaoDeParcela(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(1);
	});

	it("parcela maior dita sobre a carta de parcela maior passa intacta e sem sinal", () => {
		const dito = "A da ÂNCORA com 94 meses tem parcela maior que a outra da ÂNCORA.";
		expect(corrigirComparacaoDeParcela(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});

	it("direção verificável e trocada: sinal, fala inteira", () => {
		const dito = "A de R$ 1.099,62 tem parcela maior que a de R$ 1.454,51.";
		expect(corrigirComparacaoDeParcela(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
	});

	it("referência que não está na mesa: não dá para saber — sinal, fala inteira", () => {
		const dito = "A de R$ 1.176,39 tem parcela menor que a da Rodobens.";
		expect(corrigirComparacaoDeParcela(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
	});

	it("frase sem comparativo de parcela não é tocada nem sinalizada", () => {
		const dito = "A parcela é de R$ 1.176,39 em 96 meses.";
		expect(corrigirComparacaoDeParcela(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});

	it("a fala medida inteira, pelas duas réguas e pelo balão do turno", async () => {
		const { montarTrechoDeSaida } = await import("./turno-livre");
		const medida =
			"A de menor prazo é a da ÂNCORA, id 6abfaec94c0ff2a8453a73a0, com 94 meses. Ela é a minha recomendação para você também, pois tem o menor prazo e parcela menor que a outra da ÂNCORA.";
		const _saida = montarTrechoDeSaida({
			texto: medida,
			cardsDoTurno: [],
			temCartaNaTela: true,
			...MESA,
		}).texto;
		expect(sinal().length).toBeGreaterThanOrEqual(1);
	});
});

describe("prazo inventado: não existe carta com esse número na mesa", () => {
	it("a fala medida: 'a menor parcela é da ÂNCORA, mas o prazo é de 100 meses' — sinal, fala inteira", () => {
		const dito = "Então, olha: a menor parcela é da ÂNCORA, mas o prazo é de 100 meses.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(1);
	});

	it("prazo de carta da mesa passa intacto e sem sinal", () => {
		const dito = "A menor parcela é da ÂNCORA, mas o prazo é de 114 meses.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});

	it("prazo inventado num meio da fala: sinal por cada número problemático, fala inteira", () => {
		const dito = "Olha só. O prazo é de 100 meses. Quer ver o lance?";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(ultimoValor()).toBe(1);
	});

	it("sem carta na mesa não há o que conferir: a fala fica, sem sinal", () => {
		const dito = "O prazo é de 100 meses.";
		expect(semPrazoInventado(dito, { cartasDaMesa: [] })).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});

	it("prazo que NÃO é atributo da oferta ('em 12 meses') não é sinalizado", () => {
		const dito = "Você pode ser contemplado em 12 meses se der lance alto.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});
});

describe("'tem N meses' dito da carta: o número é o da carta que a frase identifica", () => {
	it("a fala medida: a ÂNCORA de R$ 1.099,62 tem 114, não 100 — contradiz, sinal, fala inteira", () => {
		const dito = "A da ÂNCORA tem 100 meses e a parcela é de R$ 1.099,62.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(1);
	});

	it("sem como identificar a carta, prazo que não existe na mesa é invenção — sinal", () => {
		const dito = "A da ÂNCORA tem 100 meses de prazo.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
	});

	it("sem como identificar a carta, prazo que EXISTE na mesa passa — verdade possível, sem sinal", () => {
		const dito = "A da ÂNCORA tem 114 meses de prazo.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});

	it("administradora com UMA carta só na mesa: 100 contradiz o dela — sinal", () => {
		const umaSo = {
			cartasDaMesa: [{ administradora: "ÂNCORA", parcela: 1099.62, prazoMeses: 114 }],
		};
		const dito = "A da ÂNCORA tem 100 meses de prazo.";
		expect(semPrazoInventado(dito, umaSo)).toBe(dito);
		expect(sinal()).toHaveLength(1);
	});

	it("prazo certo e conversa de contemplação passam intactos, sem sinal", () => {
		for (const dito of [
			"A da CANOPUS tem 96 meses e a parcela é de R$ 1.176,39.",
			"Com lance alto você pode ser contemplado com 12 meses de grupo andando.",
		]) {
			(publicarScores as ReturnType<typeof vi.fn>).mockClear();
			expect(semPrazoInventado(dito, MESA), dito).toBe(dito);
			expect(sinal(), dito).toHaveLength(0);
		}
	});
});

describe("o prazo dito tem de ser o da carta que a frase identifica, mesmo existindo em outra", () => {
	it("a fala medida: a ÂNCORA tem 96? Não — 114 é o dela (96 é da CANOPUS) — sinal, fala inteira", () => {
		const dito =
			"A outra opção da ÂNCORA tem 96 meses, igual à CANOPUS, mas a parcela é um pouco menor, de R$ 1.099,62.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(1);
	});

	it("prazo igual ao da carta identificada passa intacto e sem sinal", () => {
		const dito = "A da CANOPUS tem 96 meses, com parcela de R$ 1.176,39.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});
});

describe("'é de N meses' e a diferença calculada em cima de número inventado", () => {
	it("a fala medida: 'A diferença é de 4 meses. A ÂNCORA é de 100 meses e a CANOPUS é de 96 meses.'", () => {
		const dito = "A diferença é de 4 meses. A ÂNCORA é de 100 meses e a CANOPUS é de 96 meses.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		// a diferença impossível + o 100 inventado: 2 problemas num único sinal
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(2);
	});

	it("diferença que existe entre duas cartas da mesa passa (114 − 96 = 18), sem sinal", () => {
		const dito = "A diferença é de 18 meses entre a ÂNCORA e a CANOPUS.";
		expect(semPrazoInventado(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});
});

describe("corrigirComparacoes: uma fala, uma verificação, um sinal agregado", () => {
	it("fala contradizendo a mesa em prazo E parcela: fala inteira, sinal com o total", () => {
		const dito =
			"A da CANOPUS tem prazo mais curto que a de 114 meses e parcela maior que a de R$ 1.176,39.";
		expect(corrigirComparacoes(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(1);
		expect(ultimoValor()).toBe(2);
	});

	it("fala correta: nenhum sinal", () => {
		const dito = "A da CANOPUS com parcela de R$ 1.176,39 tem prazo mais longo que a de 94 meses.";
		expect(corrigirComparacoes(dito, MESA)).toBe(dito);
		expect(sinal()).toHaveLength(0);
	});

	afterEach(() => {
		(publicarScores as ReturnType<typeof vi.fn>).mockClear();
	});
});
