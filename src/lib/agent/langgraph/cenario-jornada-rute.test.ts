/**
 * A CONVERSA DA RUTE, DE PONTA A PONTA — o cenário que o PRD de 19/08/2026 pede
 * como prova.
 *
 * Produção, 19/08/2026, 17h22: uma cliente real disse que queria comprar uma
 * casa, corrigiu o valor por conta própria, entregou CPF e WhatsApp, viu onze
 * ofertas reais, declarou em voz alta o critério de compra dela, escolheu a
 * administradora, escolheu a cota, recebeu a simulação — e foi embora sem
 * proposta seis minutos e trinta e sete segundos depois. Ela fez tudo o que se
 * pede de um lead; o agente é que não fechou.
 *
 * O turno que este arquivo reencena é o 26:
 *
 *   [24] agente: "O Itaú tem duas opções na tela… Qual delas você prefere?"
 *                 [A de menor parcela] [A de prazo mais curto]
 *   [26] Rute:   "A de prazo mais curto"
 *
 * `escolhaPodeSerAncorada` exigia um sim/não literal e recusou. A escolha nunca
 * foi gravada, `fechamentoSinalizado` ficou falso, o funil parou três portões
 * atrás da conversa e o contrato virou inalcançável.
 *
 * Aqui o grafo roda DE VERDADE (analyzer e modelo roteirizados, Postgres real,
 * busca injetada) e o que se assere é a TRAJETÓRIA e o ESTADO — nunca a prosa.
 */

import { afterAll, describe, expect, it } from "vitest";
import type { BuscaGrupos } from "./nodes/discovery";
import { limparCenario, runScenario } from "./testing/scenario";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** As cotas da Rute, com os números reais da conversa (PRD §3, D4). Duas do
 * Itaú — o caso que a resolução por marca sozinha NÃO desempata. */
const BUSCA_DA_RUTE: BuscaGrupos = async () => ({
	recommendations: [
		{
			id: "bb-217",
			administradora: "BANCO DO BRASIL",
			creditValue: 499_634,
			monthlyPayment: 3_030.67,
			termMonths: 217,
			availableSlots: 15,
			avgBidValue: 180_000,
			rank: 0,
		},
		{
			id: "itau-147",
			administradora: "ITAÚ",
			creditValue: 524_580,
			monthlyPayment: 4_519.0,
			termMonths: 147,
			availableSlots: 4,
			avgBidValue: 190_000,
			rank: 1,
		},
		{
			id: "itau-158",
			administradora: "ITAÚ",
			creditValue: 507_960,
			monthlyPayment: 4_154.0,
			termMonths: 158,
			availableSlots: 1,
			avgBidValue: 185_000,
			rank: 2,
		},
	],
});

/** O turno da busca fala DUAS vezes: o reveal anuncia, os cards entram e a
 * âncora conduz — dois beats de modelo, um por chamada de `.stream()`. A fila de
 * beats do cenário é única, então contar errado aqui desalinha todos os turnos
 * seguintes (o segundo balão comeria a fala do turno de baixo). */
const REVEAL = {
	user: "manda as opções",
	beats: [{ text: "Achei estas aqui." }, { text: "Alguma te chamou atenção?" }],
};

const ANTES_DA_BUSCA = {
	desireAsked: true,
	identityCollected: true,
	currentCategory: "imovel" as const,
	experiencePrev: "first" as const,
	experienceDispatched: true,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	qualifyAnswers: {
		creditMax: 500_000,
		prazoMeses: 120,
		hasLance: "no" as const,
		lanceEmbutido: false,
	},
};

/** O turno 24: o agente pergunta qual das duas e oferece os dois atalhos. Os
 * rótulos são do MODELO; quem resolve cada um contra as cotas reais e anexa o
 * `groupId` é o servidor. */
const PERGUNTA_DE_ESCOLHA = {
	user: "Itaú",
	intent: "providing_info" as const,
	// Texto e tool no MESMO beat: o `converse` só volta ao modelo quando a tool
	// pede fala (`pedeFalaDepoisDasTools`), e card de apresentação não pede.
	beats: [
		{
			text: "O Itaú tem duas opções na tela. Qual delas você prefere?",
			toolCalls: [
				{
					name: "present_quick_reply",
					args: {
						// O MODELO declara de quais cotas ele está falando (ele acabou de
						// citar "as duas do Itaú"); o SERVIDOR confere que os ids existem e
						// que o rótulo de cada botão bate com a cota declarada.
						options: [
							{ label: "A de menor parcela", groupId: "itau-158" },
							{ label: "A de prazo mais curto", groupId: "itau-147" },
						],
					},
				},
			],
		},
	],
};

describeIfDb("A conversa da Rute — responder à pergunta do agente FECHA a porta certa", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		for (const id of criadas) await limparCenario(id);
	});

	it("o atalho de escolha nasce com a cota real anexada pelo servidor", async () => {
		const r = await runScenario({
			busca: BUSCA_DA_RUTE,
			metaInicial: ANTES_DA_BUSCA,
			contactName: "Rute",
			turns: [REVEAL, PERGUNTA_DE_ESCOLHA],
		});
		criadas.push(r.conversationId);

		const quickReply = r.turns[1].events.find(
			(e) => e.type === "artifact" && e.artifactType === "quick_reply",
		);
		const opcoes = (
			quickReply as unknown as {
				payload: { options: Array<{ label: string; groupId?: string }> };
			}
		).payload.options;
		expect(opcoes.find((o) => o.label === "A de prazo mais curto")?.groupId).toBe("itau-147");
		expect(opcoes.find((o) => o.label === "A de menor parcela")?.groupId).toBe("itau-158");
		// E o estado guarda o que foi ofertado — é o fato que autoriza ancorar a
		// resposta dela no turno seguinte.
		expect(r.meta.escolhaOfertada?.groupIds).toEqual(["itau-158", "itau-147"]);
	});

	it('"A de prazo mais curto" ancora a cota e destrava o fechamento', async () => {
		const r = await runScenario({
			busca: BUSCA_DA_RUTE,
			metaInicial: ANTES_DA_BUSCA,
			contactName: "Rute",
			turns: [
				REVEAL,
				PERGUNTA_DE_ESCOLHA,
				{
					user: "A de prazo mais curto",
					intent: "providing_info",
					beats: [
						{
							text: "Perfeito, é essa então.",
							toolCalls: [{ name: "escolher_cota", args: { groupId: "itau-147" } }],
						},
						// `escolher_cota` devolve DADO (não é card), então o `converse`
						// volta ao modelo: este é o beat pós-tool.
						{ text: "Vou seguir com ela." },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		// A escolha existe, e é a que ela descreveu — 147 meses, o prazo mais curto.
		expect(r.meta.escolha?.groupId).toBe("itau-147");
		expect(r.meta.escolha?.termMonths).toBe(147);
		// E o contrato passa a ter uma cota: era isto que faltava para o funil
		// alcançar `decision`/`contract`.
		expect(r.meta.contractOffer?.groupId).toBe("itau-147");
		// A oferta de escolha foi CONSUMIDA — não fica pendurada para ancorar uma
		// fala solta três turnos depois.
		expect(r.meta.escolhaOfertada).toBeUndefined();
	});

	it("a mesma fala SEM a pergunta de escolha não ancora nada (FIX-406 intacto)", async () => {
		const r = await runScenario({
			busca: BUSCA_DA_RUTE,
			metaInicial: ANTES_DA_BUSCA,
			contactName: "Rute",
			turns: [
				REVEAL,
				{
					user: "A de prazo mais curto",
					intent: "providing_info",
					beats: [
						{ text: "Certo." },
						{ text: "", toolCalls: [{ name: "escolher_cota", args: { groupId: "itau-147" } }] },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.escolha).toBeUndefined();
		expect(r.meta.contractOffer).toBeUndefined();
	});

	it("perguntar sobre a cota, mesmo com a escolha ofertada, não compromete o contrato", async () => {
		const r = await runScenario({
			busca: BUSCA_DA_RUTE,
			metaInicial: ANTES_DA_BUSCA,
			contactName: "Rute",
			turns: [
				REVEAL,
				PERGUNTA_DE_ESCOLHA,
				{
					user: "quanto fica a parcela da de prazo mais curto?",
					intent: "asking_question",
					beats: [
						{ text: "É R$ 4.519,00." },
						{ text: "", toolCalls: [{ name: "escolher_cota", args: { groupId: "itau-147" } }] },
					],
				},
			],
		});
		criadas.push(r.conversationId);

		expect(r.meta.escolha).toBeUndefined();
		expect(r.meta.contractOffer).toBeUndefined();
	});
});
