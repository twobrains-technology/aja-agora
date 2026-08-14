// Quem pede parcela é buscado por PARCELA — não por um crédito derivado dela.
//
// Produção, `fa0533a0-…` (13/08/2026, WhatsApp). O cliente tinha uma moto de
// R$ 20 mil na tela (TRADIÇÃO, R$ 22.077 de carta, R$ 484,16/mês) e disse que
// só cabiam R$ 200 por mês. O que o servidor fez (`converse.ts:948-956`):
//
//     alvo = creditValue × (parcelaDesejada / monthlyPayment)
//          = 22.077 × (200 / 484,16) = 9.120
//
// e mandou isso para a busca como `creditMax`. R$ 9.120 está abaixo do crédito
// mínimo que a Bevi aceita — a busca voltou vazia, o funil derivou de novo
// (6.424), voltou vazia de novo, quatro vezes. A venda morreu ali.
//
// O caminho certo já existe e é inalcançável por construção: a Bevi busca por
// `INSTALLMENT_VALUE` (`bevi-self-contract-adapter.ts`), e `discovery.ts` só
// usava `parcelaAlvo` quando `creditMax` era `undefined` — que nunca acontece
// depois da derivação acima, porque ela acabou de definir o `creditMax`.
//
// O invariante é de dado, não de conversa: o alvo que vai para a administradora
// tem UM tipo. Se o cliente falou em parcela, o alvo é a parcela. Como o agente
// explica isso ("com R$ 200 por mês a carta fica em torno de X") segue sendo do
// modelo — derivar para NARRAR é legítimo, derivar para BUSCAR não é.
import { afterAll, describe, expect, it } from "vitest";
import { aplicarFaixaDeCredito } from "@/lib/agent/qualify-answers";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** A oferta que o cliente tinha na tela — números reais da conversa. */
const OFERTA_TRADICAO = {
	id: "6a7b59c725935b16a73175bd",
	administradora: "TRADIÇÃO",
	category: "moto",
	creditValue: 22_077.3,
	monthlyPayment: 484.16,
	termMonths: 61,
	availableSlots: 8,
	avgBidValue: 10_725.15,
	rank: 0,
};

/** Espiona os argumentos da busca — é o que prova qual pergunta foi à Bevi. */
function buscaEspia() {
	const chamadas: Array<Record<string, unknown>> = [];
	const busca = async (args: Record<string, unknown>) => {
		chamadas.push(args);
		return { recommendations: [OFERTA_TRADICAO] };
	};
	return { busca, chamadas };
}

function metaComOfertaNaTela() {
	return {
		desireAsked: true,
		desireAnswered: true,
		identityCollected: true,
		revealCompleted: true,
		searchDispatched: true,
		currentCategory: "moto" as const,
		qualifyAnswers: { creditMax: 20_000, creditMin: 18_000, prazoMeses: 60 },
		recommendedOffer: {
			groupId: OFERTA_TRADICAO.id,
			category: "moto" as const,
			administradora: "TRADIÇÃO",
			creditValue: OFERTA_TRADICAO.creditValue,
			monthlyPayment: OFERTA_TRADICAO.monthlyPayment,
			termMonths: OFERTA_TRADICAO.termMonths,
			avgBidValue: OFERTA_TRADICAO.avgBidValue,
			availableSlots: OFERTA_TRADICAO.availableSlots,
		},
	};
}

describeIfDb("parcela declarada manda na busca", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("R$ 200/mês vira alvo POR PARCELA, não crédito de R$ 9.120", async () => {
		const { busca, chamadas } = buscaEspia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: metaComOfertaNaTela(),
			turns: [
				{
					user: "essa parcela é alta, só consigo 200 por mês",
					intent: "providing_info",
					beats: [
						{
							text: "Deixa eu ajustar pra uma parcela de R$ 200.",
							toolCalls: [{ name: "ajustar_por_parcela", args: { parcelaDesejada: 200 } }],
						},
						{ text: "Já te trago o que cabe aí." },
					],
				},
				{
					user: "sim quero ver",
					intent: "ready_to_proceed",
					beats: [{ text: "Essas são as opções." }],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.qualifyAnswers?.parcelaAlvo).toBe(200);

		// O estado não pode guardar o crédito derivado da parcela como alvo: é ele
		// que a busca leria, e é ele que está abaixo do piso da administradora.
		const DERIVADO = Math.round(
			OFERTA_TRADICAO.creditValue * (200 / OFERTA_TRADICAO.monthlyPayment),
		);
		expect(r.meta.qualifyAnswers?.creditMax).not.toBe(DERIVADO);

		// E a pergunta que chegou à Bevi tem que ser pela parcela.
		const buscasPorParcela = chamadas.filter((c) => c.parcelaAlvo === 200);
		expect(
			buscasPorParcela.length,
			`nenhuma busca por parcela; chamadas: ${JSON.stringify(chamadas)}`,
		).toBeGreaterThan(0);
		for (const chamada of buscasPorParcela) {
			expect(chamada.creditMax).toBeUndefined();
			expect(chamada.creditMin).toBeUndefined();
		}
	});

	it("valor do bem dito depois volta a mandar na busca", async () => {
		// O caminho inverso precisa continuar funcionando: quem pediu parcela e
		// depois diz "na verdade quero uma de 30 mil" volta a ser buscado por valor.
		const { busca, chamadas } = buscaEspia();
		const r = await runScenario({
			busca: busca as never,
			metaInicial: {
				...metaComOfertaNaTela(),
				// Uma conversa que JÁ buscou pelos dois alvos — é o snapshot dessas
				// buscas que distingue "faixa nova" de "afirmativo curto na mesma
				// faixa" e evita re-buscar em looping.
				discoveredCreditTarget: 20_000,
				discoveredParcelaTarget: 200,
				qualifyAnswers: {
					creditMax: 20_000,
					creditMin: 18_000,
					parcelaAlvo: 200,
					alvoDeBusca: "parcela" as const,
				},
			},
			turns: [
				{
					user: "na verdade quero uma moto de 30 mil",
					intent: "providing_info",
					// Pelo MESMO caminho do merge real (`analyzeAndMerge`), que passa
					// pelo reducer — é ele que devolve o alvo para "valor" quando o
					// cliente diz o preço do bem.
					extrai: (meta) => {
						meta.qualifyAnswers = aplicarFaixaDeCredito(
							meta.qualifyAnswers ?? {},
							{ creditMax: 30_000 },
							"moto",
						);
					},
					beats: [{ text: "Fechado, vou buscar nessa faixa." }],
				},
			],
		});
		criadas.push(r.conversationId);

		const porValor = chamadas.filter((c) => c.creditMax === 30_000);
		expect(
			porValor.length,
			`busca não voltou a ser por valor; chamadas: ${JSON.stringify(chamadas)}`,
		).toBeGreaterThan(0);
	});
});
