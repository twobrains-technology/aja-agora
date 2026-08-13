// A faixa de busca só se reposiciona depois que o cliente VIU uma oferta.
//
// Produção 2026-08-13, sessão `ff8f2080-b356-4992-8dd5-51f57f10965b`: o cliente
// disse "quero um carro, consigo pagar R$ 1.800/mês" e depois "238k". No turno
// da BUSCA, o `discovery` descobriu a primeira oferta (ITAÚ, carta de R$ 241.258
// a R$ 6.204,66/mês) e, no MESMO turno, o modelo chamou `ajustar_por_parcela`
// com os R$ 1.800 — antes de qualquer card ter ido pra tela.
//
// Aconteceram duas coisas incompatíveis:
//
//   - a TOOL leu a oferta do BANCO (`reloadMeta`), onde o `persist` deste turno
//     ainda não tinha gravado nada, e devolveu ao modelo "[Sem oferta ancorada
//     nesta conversa]" — ou seja, avisou que NÃO ajustou;
//   - o `converse` leu a MESMA oferta do ESTADO DO GRAFO, onde o `discovery`
//     acabara de escrevê-la, e reposicionou a faixa assim mesmo: o funil
//     terminou o turno com `creditMax: 69.990` no lugar dos R$ 238 mil.
//
// Quem quer um Song Premium de R$ 238 mil ficou com a busca apontada pra cartas
// de R$ 63–70 mil, e o modelo — que ouviu "não deu" — nem sabia. É a divergência
// clássica de duas fontes de verdade sobre o mesmo fato.
//
// O invariante que fecha isso é de PRODUTO, não de implementação: `ajustar_por_
// parcela` responde à objeção "essa parcela não cabe pra mim", e essa objeção só
// existe depois que a pessoa VIU a parcela. Enquanto o card da recomendação está
// apenas PENDENTE (`pendingRecommendationCard`, emitido só no fim deste turno),
// ninguém viu preço nenhum — reposicionar ali é decidir pelo cliente antes de
// mostrar a ele a primeira opção.
import { afterAll, describe, expect, it } from "vitest";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** A oferta que a busca devolve — os números REAIS da sessão `ff8f2080`. */
const OFERTA_ITAU = {
	id: "6a7b59c325935b16a73168b5",
	administradora: "ITAÚ",
	category: "auto",
	creditValue: 241_258,
	monthlyPayment: 6_204.66,
	termMonths: 47,
	availableSlots: 8,
	avgBidValue: 187_939.98,
	rank: 0,
};

const buscaComItau = async () => ({ recommendations: [OFERTA_ITAU] });

/** O modelo pedindo o ajuste pelos R$ 1.800 que o cliente declarou lá atrás. */
const BEATS_AJUSTE = [
	{
		text: "Deixa eu ver o que encaixa aí.",
		toolCalls: [{ name: "ajustar_por_parcela", args: { parcelaDesejada: 1_800 } }],
	},
	{ text: "Já te mostro." },
];

describeIfDb("faixa de busca só se reposiciona com oferta na tela", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("não reposiciona no turno da descoberta — o cliente ainda não viu preço", async () => {
		const r = await runScenario({
			busca: buscaComItau as never,
			metaInicial: {
				desireAsked: true,
				desireAnswered: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				// Como na sessão real: o valor do bem está definido e a busca ainda
				// não rodou, então o `discovery` entra NESTE turno.
				qualifyAnswers: { creditMin: 214_200, creditMax: 238_000 },
			},
			turns: [{ user: "Enviei meus dados pra buscar as ofertas", beats: BEATS_AJUSTE }],
		});
		criadas.push(r.conversationId);

		// O que o cliente pediu continua de pé: ele quer o carro de R$ 238 mil.
		expect(r.meta.qualifyAnswers?.creditMax).toBe(238_000);
		expect(r.meta.qualifyAnswers?.creditMin).toBe(214_200);
		// E a busca NÃO pode ter sido reapontada pra faixa que os R$ 1.800 pagam
		// (241.258 × 1800/6204,66 ≈ 69.990) — foi exatamente isso que aconteceu.
		expect(r.meta.qualifyAnswers?.creditMax).not.toBe(69_990);
	});

	it("reposiciona quando ele já viu a oferta e diz que a parcela não cabe", async () => {
		// A outra metade: sem ela, "consertar" o caso de cima mataria o motivo pelo
		// qual a tool existe — a cliente que disse que só cabiam R$ 1.800/mês, teve
		// a faixa gravada certinho e recebeu as cartas que cabiam no bolso dela.
		const r = await runScenario({
			busca: buscaComItau as never,
			metaInicial: {
				desireAsked: true,
				desireAnswered: true,
				identityCollected: true,
				currentCategory: "auto" as const,
				// Busca já feita e reveal concluído: a carta de R$ 241.258 a
				// R$ 6.204,66 JÁ está na tela dele.
				searchDispatched: true,
				revealCompleted: true,
				recommendedOffer: {
					administradora: "ITAÚ",
					category: "auto",
					creditValue: 241_258,
					monthlyPayment: 6_204.66,
					termMonths: 47,
					groupId: OFERTA_ITAU.id,
				},
				qualifyAnswers: { creditMin: 214_200, creditMax: 238_000 },
			},
			turns: [{ user: "essa parcela não cabe pra mim, só consigo 1800", beats: BEATS_AJUSTE }],
		});
		criadas.push(r.conversationId);

		expect(r.meta.qualifyAnswers?.parcelaAlvo).toBe(1_800);
		expect(r.meta.qualifyAnswers?.creditMax).toBe(69_990);
	});
});
