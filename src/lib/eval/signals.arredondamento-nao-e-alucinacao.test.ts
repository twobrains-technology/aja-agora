/**
 * §5.2 do PRD (19/08/2026) — A MARCA DE ALUCINAÇÃO PUNIU O ACERTO.
 *
 * A conversa da Rute saiu com `hallucination: true` e assertividade 0,35. Os
 * números do turno 18 — "R$ 499.634" e "R$ 3.031" — são o arredondamento
 * correto, em português, de 499633.76 e 3030.67, ambos gravados no artefato da
 * simulação.
 *
 * `walkForNumbers` guardava apenas o valor BRUTO, e `matchesKnownNumber`
 * compara inteiros contra ele com tolerância de ±1 — que não alcança 499.634 a
 * partir de 499.633,76 pelo caminho que ela tentava (o arredondado do artefato
 * nunca entrava no conjunto).
 *
 * Resultado: a única disciplina que o agente cumpriu à risca — todo número saiu
 * de ferramenta — virou a bandeira vermelha da conversa. Detector que pune o
 * acerto é pior que detector nenhum: ele ensina a ignorar o painel.
 */

import { describe, expect, it } from "vitest";
import { computeSignals } from "./signals";

const artefatoDaRute = {
	messageId: "m1",
	type: "simulation_result",
	payload: {
		groupId: "bb-217",
		administradora: "BANCO DO BRASIL",
		creditValue: 499_633.76,
		monthlyPayment: 3_030.67,
		termMonths: 217,
	},
};

function sinaisCom(fala: string) {
	return computeSignals({
		metadata: null,
		channel: "web",
		messages: [
			{ id: "m0", role: "user", content: "quero um imóvel", createdAt: new Date(0) },
			{ id: "m1", role: "assistant", content: fala, createdAt: new Date(0) },
		],
		artifacts: [artefatoDaRute],
		lead: null,
		propostas: 0,
		contratoFechado: false,
	});
}

describe("arredondar em português não é inventar número", () => {
	it("R$ 499.634 casa com 499.633,76 do artefato", () => {
		const s = sinaisCom(
			"A que se destaca é do Banco do Brasil: carta de R$ 499.634, parcela de R$ 3.031 em 217 meses.",
		);
		expect(s.numbersInTextFlagged).toEqual([]);
	});

	it('"R$ 500 mil" é o mesmo 500.000 que está no card — não é número novo', () => {
		// Medido contra a conversa REAL (19/08/2026): depois de consertar o
		// arredondamento, sobrava exatamente um flag — "R$ 500" extraído de
		// "R$ 500 mil". O detector lia o algarismo e jogava fora a ESCALA, então
		// meio milhão virava quinhentos reais e nada casava. É o agente falando
		// como gente sendo punido de novo, pela porta ao lado.
		const s = computeSignals({
			metadata: null,
			channel: "web",
			messages: [
				{ id: "m0", role: "user", content: "500 mil", createdAt: new Date(0) },
				{
					id: "m1",
					role: "assistant",
					content: "Sem problema! R$ 500 mil é ainda melhor, dá mais opções de imóvel.",
					createdAt: new Date(0),
				},
			],
			artifacts: [
				{
					messageId: "m1",
					type: "comparison_table",
					payload: { groups: [{ id: "anc", administradora: "ÂNCORA", creditValue: 500_000 }] },
				},
			],
			lead: null,
			propostas: 0,
		});
		expect(s.numbersInTextFlagged).toEqual([]);
	});

	it("milhão também tem escala", () => {
		const s = computeSignals({
			metadata: null,
			channel: "web",
			messages: [
				{
					id: "m1",
					role: "assistant",
					content: "A carta é de R$ 1,5 milhão.",
					createdAt: new Date(0),
				},
			],
			artifacts: [
				{ messageId: "m1", type: "simulation_result", payload: { creditValue: 1_500_000 } },
			],
			lead: null,
			propostas: 0,
		});
		expect(s.numbersInTextFlagged).toEqual([]);
	});

	it("ecoar o valor que o CLIENTE informou não é inventar dado", () => {
		// Último resíduo medido na conversa real: "Uma casa de R$ 400 mil é um bom
		// investimento" — o valor que ela mesma tinha acabado de dizer, antes de
		// corrigir para 500 mil. Não existe artefato com 400.000 (a busca só rodou
		// depois, na faixa nova), e o detector marcava alucinação.
		//
		// Repetir o que o cliente falou é o oposto de inventar: é escutar. O que
		// este sinal existe para pegar é número que NASCEU no modelo.
		const s = computeSignals({
			metadata: null,
			channel: "web",
			messages: [
				{ id: "m0", role: "user", content: "Valor do bem: R$ 400.000", createdAt: new Date(0) },
				{
					id: "m1",
					role: "assistant",
					content: "Perfeito, Rute! Uma casa de R$ 400 mil é um bom investimento.",
					createdAt: new Date(0),
				},
			],
			artifacts: [],
			lead: null,
			propostas: 0,
		});
		expect(s.numbersInTextFlagged).toEqual([]);
	});

	it("número que NÃO existe em artefato nenhum continua sendo flagrado", () => {
		const s = sinaisCom("A carta é de R$ 780.000 com parcela de R$ 1.200.");
		expect(s.numbersInTextFlagged.length).toBeGreaterThan(0);
	});
});

describe("o desfecho real entra nos sinais", () => {
	it("propostas e contrato fechado viajam para a dimensão de conversão", () => {
		const s = computeSignals({
			metadata: null,
			channel: "web",
			messages: [],
			artifacts: [],
			lead: null,
			propostas: 2,
			contratoFechado: true,
		});
		expect(s.propostas).toBe(2);
		expect(s.contratoFechado).toBe(true);
	});
});
