import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	findChosenOffer,
	findOfferByAdministradora,
	isCreditValueMentioned,
	listShownOffers,
	resolveOfferByMention,
} from "./choose-offer";

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf-8");

// FIX-195 — resolução server-side da cota escolhida (choose_offer), a partir dos
// artifacts REAIS do reveal. Nada de re-resolver via LLM/re-busca.

describe("FIX-195 — findChosenOffer resolve a cota escolhida pelos artifacts do reveal", () => {
	it("acha a cota no comparison_table (seletor) por groupId — ancora administradora + prazo", () => {
		const rows = [
			{
				type: "comparison_table",
				payload: {
					groups: [
						{
							id: "q-canopus",
							groupId: "q-canopus",
							administradora: "CANOPUS",
							creditValue: 220000,
							termMonths: 116,
							monthlyPayment: 1414.39,
						},
						{
							id: "q-bb",
							groupId: "q-bb",
							administradora: "BANCO DO BRASIL",
							creditValue: 300000,
							termMonths: 71,
							monthlyPayment: 5404.2,
						},
					],
				},
			},
		];
		const chosen = findChosenOffer(rows, "q-bb");
		expect(chosen?.administradora).toBe("BANCO DO BRASIL");
		expect(chosen?.termMonths).toBe(71);
		expect(chosen?.creditValue).toBe(300000);
		expect(chosen?.groupId).toBe("q-bb");
	});

	it("acha a cota no recommendation_card (hero) por id", () => {
		const rows = [
			{
				type: "recommendation_card",
				payload: {
					id: "q-hero",
					administradora: "ITAU",
					termMonths: 91,
					creditValue: 300000,
					monthlyPayment: 4192.41,
				},
			},
		];
		const chosen = findChosenOffer(rows, "q-hero");
		expect(chosen?.administradora).toBe("ITAU");
		expect(chosen?.termMonths).toBe(91);
	});

	it("acha a cota no simulation_result por groupId", () => {
		const rows = [
			{
				type: "simulation_result",
				payload: {
					groupId: "q-sim",
					administradora: "ANCORA",
					termMonths: 117,
					creditValue: 131000,
					monthlyPayment: 3578.1,
				},
			},
		];
		const chosen = findChosenOffer(rows, "q-sim");
		expect(chosen?.administradora).toBe("ANCORA");
	});

	it("groupId nunca exibido → null (não inventa grupo — Lei 3)", () => {
		const rows = [
			{ type: "comparison_table", payload: { groups: [{ id: "q-bb", administradora: "BB" }] } },
		];
		expect(findChosenOffer(rows, "q-fantasma")).toBeNull();
		expect(findChosenOffer([], "q-bb")).toBeNull();
	});
});

describe("FIX-195 — o handler de choose_offer NÃO re-busca (anti-regressão estrutural)", () => {
	const route = readSource("src/app/api/chat/route.ts");
	const block =
		route.match(/body\.action\?\.kind === "choose_offer"[\s\S]*?\n\t{7}return;/)?.[0] ??
		route.match(/body\.action\?\.kind === "choose_offer"[\s\S]{0,2000}/)?.[0] ??
		"";

	it("o branch choose_offer existe no route", () => {
		expect(block.length, "branch choose_offer não isolado").toBeGreaterThan(0);
	});

	it("resolve a cota server-side e dirige o contrato — sem re-busca nem lead", () => {
		expect(block).toContain("resolveChosenOffer");
		expect(block).toContain("buildChooseOfferDirective");
		// marca decisionDispatched (libera present_contract_form na fase closing).
		expect(block).toContain("decisionDispatched");
		// NÃO dispara descoberta nem funil de lead pra consultor humano.
		expect(block).not.toContain("pipeSearchSummaryTurn");
		expect(block).not.toContain("buildSearchSummaryDirective");
	});

	it("buildChooseOfferDirective dirige present_contract_form, proíbe re-busca e meta-narrativa", () => {
		const directives = readSource("src/lib/agent/orchestrator/directives.ts");
		const dirBlock =
			directives.match(/export function buildChooseOfferDirective[\s\S]*?\n\}/)?.[0] ?? "";
		expect(dirBlock.length, "buildChooseOfferDirective não isolado").toBeGreaterThan(0);
		expect(dirBlock).toContain("present_contract_form");
		expect(dirBlock).toContain("search_groups");
		expect(dirBlock).not.toContain("present_lead_form");
	});
});

// FIX-251/FIX-252 (P0/P1, veredito Fable FINAL §N-A + "pro teto" #3, 2026-07-10):
// fixture do Fluxo B — reveal recomenda RODOBENS 90k, what-if simula ITAÚ
// 161.258, e há um 3º/4º grupo pra reproduzir "a de 92 mil" resolvendo pro
// grupo ERRADO de 100k (achado do FIX-249 "PARCIAL").
const FLUXO_B_ROWS = [
	{
		type: "comparison_table",
		payload: {
			groups: [
				{
					id: "g-rodobens",
					groupId: "g-rodobens",
					administradora: "RODOBENS",
					creditValue: 90000,
					termMonths: 180,
					monthlyPayment: 1218.92,
				},
				{
					id: "g-itau",
					groupId: "g-itau",
					administradora: "ITAU",
					creditValue: 161258,
					termMonths: 200,
					monthlyPayment: 2984.38,
				},
				{
					id: "g-ancora",
					groupId: "g-ancora",
					administradora: "ANCORA",
					creditValue: 92902,
					termMonths: 120,
					monthlyPayment: 1580.5,
				},
				{
					id: "g-canopus",
					groupId: "g-canopus",
					administradora: "CANOPUS",
					creditValue: 100000,
					termMonths: 120,
					monthlyPayment: 1690.0,
				},
			],
		},
	},
];

describe("FIX-251 — findOfferByAdministradora resolve a administradora anunciada no fechamento", () => {
	it("resolve o groupId da RODOBENS exibida (o fechamento re-ancora nela, não no what-if stale)", () => {
		const chosen = findOfferByAdministradora(FLUXO_B_ROWS, "RODOBENS");
		expect(chosen?.groupId).toBe("g-rodobens");
		expect(chosen?.creditValue).toBe(90000);
		expect(chosen?.monthlyPayment).toBe(1218.92);
	});

	it("acento/caixa não importam (ITAÚ === Itau === itaú)", () => {
		expect(findOfferByAdministradora(FLUXO_B_ROWS, "itaú")?.groupId).toBe("g-itau");
		expect(findOfferByAdministradora(FLUXO_B_ROWS, "Itau")?.groupId).toBe("g-itau");
	});

	it("administradora nunca exibida → null (não inventa — Lei 3)", () => {
		expect(findOfferByAdministradora(FLUXO_B_ROWS, "EMBRACON")).toBeNull();
	});

	it("2 grupos exibidos da MESMA administradora → ambíguo, null (não chuta)", () => {
		const rows = [
			{
				type: "comparison_table",
				payload: {
					groups: [
						{ id: "g-1", administradora: "RODOBENS", creditValue: 90000 },
						{ id: "g-2", administradora: "RODOBENS", creditValue: 120000 },
					],
				},
			},
		];
		expect(findOfferByAdministradora(rows, "RODOBENS")).toBeNull();
	});
});

describe("FIX-252 — resolveOfferByMention resolve nome/valor mencionado em texto livre", () => {
	const offers = listShownOffers(FLUXO_B_ROWS);

	it('"quero a ITAÚ" com ITAÚ na comparison_table → resolve o groupId da ITAÚ exibida', () => {
		const resolved = resolveOfferByMention(offers, "quero a ITAÚ");
		expect(resolved?.groupId).toBe("g-itau");
	});

	it('"a de 92 mil" → grupo 92.902 (ANCORA), NÃO o de 100k (CANOPUS)', () => {
		const resolved = resolveOfferByMention(offers, "quero a de 92 mil");
		expect(resolved?.groupId).toBe("g-ancora");
		expect(resolved?.creditValue).toBe(92902);
	});

	it('"deixa a RODOBENS que você recomendou" → resolve RODOBENS, não o what-if ITAÚ', () => {
		const resolved = resolveOfferByMention(offers, "Deixa a RODOBENS que você recomendou");
		expect(resolved?.groupId).toBe("g-rodobens");
	});

	it("valor com R$ formatado (R$ 92.902,00) resolve o mesmo grupo", () => {
		const resolved = resolveOfferByMention(offers, "fecha com a de R$ 92.902,00");
		expect(resolved?.groupId).toBe("g-ancora");
	});

	it("texto sem nome nem valor reconhecível → null (não inventa)", () => {
		expect(resolveOfferByMention(offers, "beleza, pode seguir")).toBeNull();
	});

	it("nome e valor apontando pra grupos DIFERENTES → ambíguo, null", () => {
		expect(resolveOfferByMention(offers, "quero a ITAÚ de 92 mil")).toBeNull();
	});

	it("lista vazia de ofertas → null", () => {
		expect(resolveOfferByMention([], "quero a ITAÚ")).toBeNull();
	});
});

describe("FIX-251/FIX-252 — listShownOffers extrai todas as cotas do comparison_table sem duplicar", () => {
	it("4 grupos exibidos, 4 ofertas distintas", () => {
		const offers = listShownOffers(FLUXO_B_ROWS);
		expect(offers).toHaveLength(4);
		expect(offers.map((o) => o.groupId).sort()).toEqual(
			["g-ancora", "g-canopus", "g-itau", "g-rodobens"].sort(),
		);
	});
});

// FIX-264 (P1, veredito Fable r5: FIX-252/258 "PARCIAL" — resolveOfferByMention
// elegia UM valueMatch ("best" global) e desistia por "conflito nome×valor"
// quando 2+ grupos exibidos empatavam no mesmo crédito — mesmo com o NOME
// único apontando certo pro grupo exibido. LEI: menção nome/valor que casa um
// grupo EXIBIDO resolve DETERMINÍSTICO (nunca desiste/nega).
const FLUXO_R6_ROWS = [
	{
		type: "comparison_table",
		payload: {
			groups: [
				{
					id: "g-rodobens",
					groupId: "g-rodobens",
					administradora: "RODOBENS",
					creditValue: 90000,
					termMonths: 180,
					monthlyPayment: 1218.92,
				},
				// mesmo crédito da RODOBENS (empate de valor) — o bug real do r5:
				// "best" global (1º empate na ordem do array) elegia esta em vez da
				// nomeada, e o nome×valor "discordava" → null.
				{
					id: "g-sicredi",
					groupId: "g-sicredi",
					administradora: "SICREDI",
					creditValue: 90000,
					termMonths: 150,
					monthlyPayment: 1350.0,
				},
				{
					id: "g-canopus",
					groupId: "g-canopus",
					administradora: "CANOPUS",
					creditValue: 110000,
					termMonths: 120,
					monthlyPayment: 1690.0,
				},
			],
		},
	},
];

describe("FIX-264 — resolveOfferByMention v2: valueMatch como CONJUNTO + menção negada", () => {
	const offers = listShownOffers(FLUXO_R6_ROWS);

	it('"RODOBENS de 90 mil" com RODOBENS 90k exibida (empatando em valor com a SICREDI) → resolve RODOBENS, não desiste', () => {
		const resolved = resolveOfferByMention(offers, "RODOBENS de 90 mil");
		expect(resolved?.groupId).toBe("g-rodobens");
	});

	it('nome único + valor batendo no PRÓPRIO grupo nomeado, mesmo com outro grupo empatando no valor → resolve pelo nome (conjunto, não "best" único)', () => {
		const resolved = resolveOfferByMention(offers, "quero fechar com a SICREDI de 90 mil");
		expect(resolved?.groupId).toBe("g-sicredi");
	});

	it('"Deixa a Rodobens pra lá. Me fala da de 110 mil" → menção negada da RODOBENS ignorada, resolve pelo valor (CANOPUS 110k)', () => {
		const resolved = resolveOfferByMention(offers, "Deixa a Rodobens pra lá. Me fala da de 110 mil");
		expect(resolved?.groupId).toBe("g-canopus");
	});

	it('"Deixa a Rodobens pra lá" sozinho (só negação, sem outra menção) → null (não sobra nada pra resolver)', () => {
		expect(resolveOfferByMention(offers, "Deixa a Rodobens pra lá")).toBeNull();
	});

	it('negação não é confundida com uso afirmativo de "deixa" ("Deixa a RODOBENS que você recomendou" segue resolvendo — regressão FIX-252)', () => {
		const resolved = resolveOfferByMention(
			listShownOffers(FLUXO_B_ROWS),
			"Deixa a RODOBENS que você recomendou",
		);
		expect(resolved?.groupId).toBe("g-rodobens");
	});

	it("nome × valor genuinamente CONTRADITÓRIOS (valor do OUTRO grupo, sem empate) continua ambíguo — não inventa", () => {
		expect(resolveOfferByMention(offers, "quero a CANOPUS de 90 mil")).toBeNull();
	});
});

// FIX-265 (menor #2, veredito Fable r5, N6): distingue re-simulação PEDIDA
// (usuário citou o valor-alvo) de what-if EXPLORATÓRIO da LLM (nenhum valor
// citado) — usado pelo runner pra decidir se uma nova simulação vira a âncora
// do fechamento/dial ou fica só informativa.
describe("FIX-265 — isCreditValueMentioned: o texto do usuário respalda o valor da simulação?", () => {
	it('"quero simular pra 130 mil" respalda 130000 (±10%)', () => {
		expect(isCreditValueMentioned("quero simular pra 130 mil", 130000)).toBe(true);
	});

	it('"e se eu aumentasse um pouco?" NÃO respalda 161258 (nenhum valor citado — what-if exploratório)', () => {
		expect(isCreditValueMentioned("e se eu aumentasse um pouco?", 161258)).toBe(false);
	});

	it('valor citado longe (>10%) do simulado não respalda', () => {
		expect(isCreditValueMentioned("quero ver a de 100 mil", 161258)).toBe(false);
	});

	it("texto vazio ou creditValue inválido → false, nunca quebra", () => {
		expect(isCreditValueMentioned("", 100000)).toBe(false);
		expect(isCreditValueMentioned("quero 100 mil", 0)).toBe(false);
		expect(isCreditValueMentioned("quero 100 mil", Number.NaN)).toBe(false);
	});
});
