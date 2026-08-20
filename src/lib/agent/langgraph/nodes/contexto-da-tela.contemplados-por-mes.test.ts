/**
 * D4 (PRD 19/08/2026, conversa da Rute) — A PERGUNTA MAIS CARA DA CONVERSA.
 *
 *   [21] cliente: "Qual o que tem probabilidade de contemplação mais rápido?"
 *   [22] agente:  "Os cards mostram a taxa média de contemplação por
 *                  assembleia de cada administradora. Qual delas você está
 *                  vendo como preferida?"
 *
 * O servidor TINHA a resposta: Banco do Brasil, 15 contemplados por mês, contra
 * 4 do Itaú — e com parcela R$ 1.488 mais barata. O campo (`availableSlots`,
 * `monthlyAwardedQuotas` na origem) é capturado em `choose-offer.ts` e nunca
 * entrava na janela do modelo: o bloco das opções na tela serializava só
 * administradora, carta, parcela e prazo.
 *
 * Sem o dado, o agente devolveu a decisão para a cliente. Ela escolheu o Itaú —
 * objetivamente a pior opção no critério que ela mesma tinha declarado — e o
 * agente assistiu calado.
 *
 * Um segundo defeito no mesmo bloco: o corte `.slice(0, 8)` escondia a 11ª
 * linha, e o agente disse "o Itaú tem duas opções na tela" quando havia três.
 * Ele falou a verdade sobre o contexto dele, não sobre a tela.
 *
 * Isto NÃO é trava de fala: é o fato de servidor entrando no contexto, que é
 * exatamente a fronteira que o CLAUDE.md deste projeto desenha.
 */

import { describe, expect, it } from "vitest";
import { blocoDeOpcoesNaTela } from "./contexto-da-tela";

const AS_ONZE_DA_RUTE = [
	{
		groupId: "bb-1",
		administradora: "BANCO DO BRASIL",
		creditValue: 499_634,
		monthlyPayment: 3_031,
		termMonths: 217,
		availableSlots: 15,
	},
	{
		groupId: "anc-1",
		administradora: "ÂNCORA",
		creditValue: 500_000,
		monthlyPayment: 3_474,
		termMonths: 195,
		availableSlots: 6,
	},
	{
		groupId: "ita-1",
		administradora: "ITAÚ",
		creditValue: 524_580,
		monthlyPayment: 4_519,
		termMonths: 147,
		availableSlots: 4,
	},
	{
		groupId: "can-1",
		administradora: "CANOPUS",
		creditValue: 500_000,
		monthlyPayment: 3_917,
		termMonths: 182,
		availableSlots: 4,
	},
	{
		groupId: "rod-1",
		administradora: "RODOBENS",
		creditValue: 500_000,
		monthlyPayment: 3_538,
		termMonths: 216,
		availableSlots: 2,
	},
	{
		groupId: "ita-2",
		administradora: "ITAÚ",
		creditValue: 507_960,
		monthlyPayment: 4_154,
		termMonths: 158,
		availableSlots: 1,
	},
	{
		groupId: "x-7",
		administradora: "EMBRACON",
		creditValue: 500_000,
		monthlyPayment: 3_600,
		termMonths: 200,
		availableSlots: 3,
	},
	{
		groupId: "x-8",
		administradora: "PORTO",
		creditValue: 500_000,
		monthlyPayment: 3_700,
		termMonths: 190,
		availableSlots: 2,
	},
	{
		groupId: "x-9",
		administradora: "SANTANDER",
		creditValue: 500_000,
		monthlyPayment: 3_800,
		termMonths: 185,
		availableSlots: 2,
	},
	{
		groupId: "x-10",
		administradora: "BRADESCO",
		creditValue: 500_000,
		monthlyPayment: 3_900,
		termMonths: 180,
		availableSlots: 1,
	},
	{
		groupId: "ita-3",
		administradora: "ITAÚ",
		creditValue: 500_182,
		monthlyPayment: 4_543,
		termMonths: 160,
		availableSlots: 1,
	},
];

describe("D4 — o critério de compra número um do consórcio entra no contexto", () => {
	it("serializa contemplados por mês de cada cota", () => {
		const bloco = blocoDeOpcoesNaTela(AS_ONZE_DA_RUTE) ?? "";
		expect(bloco).toMatch(/15 contemplados por m[êe]s/i);
		expect(bloco).toMatch(/4 contemplados por m[êe]s/i);
	});

	it("a 11ª cota não fica de fora — o agente não pode contar errado o que está na tela", () => {
		const bloco = blocoDeOpcoesNaTela(AS_ONZE_DA_RUTE) ?? "";
		for (const oferta of AS_ONZE_DA_RUTE) {
			expect(bloco, `cota ${oferta.groupId} sumiu do contexto`).toContain(oferta.groupId);
		}
	});

	it("autoriza comparar contemplação por contagem real, e só por ela", () => {
		const bloco = blocoDeOpcoesNaTela(AS_ONZE_DA_RUTE) ?? "";
		// Convite explícito a usar o dado — sem isto o modelo continua mudo sobre o
		// assunto que mais decide venda de consórcio.
		expect(bloco).toMatch(/contemplados por m[êe]s/i);
		expect(bloco.toLowerCase()).toContain("taxa de contemplação".toLowerCase());
	});

	it("cota sem o dado não ganha número inventado — e o modelo é avisado do vazio", () => {
		const bloco =
			blocoDeOpcoesNaTela([
				{
					groupId: "a",
					administradora: "ITAÚ",
					creditValue: 100,
					monthlyPayment: 10,
					termMonths: 60,
				},
				{
					groupId: "b",
					administradora: "PORTO",
					creditValue: 100,
					monthlyPayment: 11,
					termMonths: 60,
				},
			]) ?? "";
		// Nenhuma LINHA de cota carrega contagem (o "0/mês" fabricado é o defeito
		// que o FIX-191 já pagou uma vez).
		const linhas = bloco.split("\n").filter((l) => l.startsWith("- ["));
		expect(linhas).toHaveLength(2);
		for (const linha of linhas) expect(linha).not.toMatch(/contemplados/i);
		// E o vazio é dito, para o modelo não preencher o silêncio com otimismo.
		expect(bloco).toMatch(/NENHUMA destas cotas trouxe o número de contemplados/i);
	});

	it("lista muito longa não some em silêncio — o corte é DITO", () => {
		// O `.slice(0, 8)` mudo é o que fez o agente dizer "o Itaú tem duas opções
		// na tela" havendo três. Uma conversa com várias buscas pode acumular
		// dezenas de cotas exibidas, e a janela tem limite — então corta-se, sim,
		// mas nunca calado: o modelo precisa saber que não está vendo tudo.
		const muitas = Array.from({ length: 40 }, (_, i) => ({
			groupId: `g-${i}`,
			administradora: "ITAÚ",
			creditValue: 100_000 + i,
			monthlyPayment: 1_000 + i,
			termMonths: 60 + i,
			availableSlots: 2,
		}));
		const bloco = blocoDeOpcoesNaTela(muitas) ?? "";
		const linhas = bloco.split("\n").filter((l) => l.startsWith("- ["));
		expect(linhas.length).toBeLessThan(40);
		expect(bloco).toMatch(/mais \d+ (?:cota|opç)/i);
	});

	it("uma cota só não vira lista de comparação", () => {
		expect(blocoDeOpcoesNaTela([AS_ONZE_DA_RUTE[0]])).toBeNull();
	});
});
