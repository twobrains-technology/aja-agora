import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreGroup, type ScoringInput } from "../recommendation";
import {
	coerceComparisonPayload,
	coerceRecommendationPayload,
	indexRevealGroups,
	type RevealGroupIndex,
} from "./recommendation-payload";

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf-8");

const SCORING_INPUT: ScoringInput = { budget: 5500, desiredTermMonths: 72, creditMax: 300000 };

// Grupo real como sai de recommend_groups (toModelGroupSummary + rank/
// scoreLabel, FIX-334 — score cru NÃO sai mais pro modelo). O availableSlots
// aqui é o monthlyAwardedQuotas coagido (FIX-192).
function realGroup(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: "6a3e6ceb419653c0a99932af",
		administradora: "BANCO DO BRASIL",
		category: "auto",
		creditValue: 300000,
		monthlyPayment: 5404.2,
		adminFeePercent: 24.9,
		termMonths: 71,
		availableSlots: 0,
		contemplationRate: 0,
		ofertaId: "49c2b15f-6f4a-42bc-b01e-f680cf7d553e",
		rank: 0,
		...over,
	};
}

describe("FIX-191 — coerção server-side do recommendation_card (hero)", () => {
	it("§7.2 — LLM emite contempladosMes:36 (e números fabricados) → card ignora e usa o REAL coagido", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });

		// A LLM digitou um payload fabricado (o bug real: 36/mês, score inflado, parcela errada).
		// FIX-334: score/scoreBreakdown nem chegam mais no input da LLM (schema
		// ficou opcional) — mas mesmo se algum caminho legado ainda os enviasse,
		// seguem 100% ignorados (a coerção RECALCULA a partir do grupo real).
		const llmInput = {
			id: "6a3e6ceb419653c0a99932af",
			administradora: "BANCO DO BRASIL",
			category: "auto",
			creditValue: 999999,
			monthlyPayment: 1234.56,
			adminFeePercent: 99,
			termMonths: 12,
			contemplationRate: 8,
			contempladosMes: 36,
			score: 0.99,
			scoreBreakdown: { monthlyFit: 1, contemplation: 1, adminFee: 1, termMatch: 1 },
		};

		const out = coerceRecommendationPayload(llmInput, index);

		// O "36" morre — availableSlots real é 0 → NENHUMA contagem de contemplação.
		expect(out.contempladosMes).toBeUndefined();
		expect(out.availableSlots).toBe(0);
		// Números reais coagidos (não os fabricados da LLM).
		expect(out.creditValue).toBe(300000);
		expect(out.monthlyPayment).toBe(5404.2);
		expect(out.termMonths).toBe(71);
		// FIX-334: sem `scoringInput`, o score sai OMITIDO (nunca o 0.99 fabricado
		// pela LLM) — degradação graciosa do caminho legado.
		expect(out.score).toBeUndefined();
		expect(out.scoreBreakdown).toBeUndefined();
		// CONTRATO com bloco-b: groupId/quotaId/ofertaId presentes e reais.
		expect(out.groupId).toBe("6a3e6ceb419653c0a99932af");
		expect(out.quotaId).toBe("6a3e6ceb419653c0a99932af");
		expect(out.ofertaId).toBe("49c2b15f-6f4a-42bc-b01e-f680cf7d553e");
	});

	// FIX-334: com `scoringInput`, o hero recalcula score/scoreBreakdown a partir
	// do GRUPO REAL (nunca do que a LLM ecoou — ela nem recebe mais o número).
	it("§FIX-334 — com scoringInput, score/scoreBreakdown são RECALCULADOS do grupo real (nunca ecoados da LLM)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });

		const out = coerceRecommendationPayload(
			{ id: realGroup().id, score: 0.99, scoreBreakdown: { monthlyFit: 1, contemplation: 1, adminFee: 1, termMatch: 1 } },
			index,
			undefined,
			undefined,
			undefined,
			SCORING_INPUT,
		);

		const expected = scoreGroup(
			{
				id: realGroup().id as string,
				administradora: "BANCO DO BRASIL",
				category: "auto",
				creditValue: 300000,
				monthlyPayment: 5404.2,
				adminFeePercent: 24.9,
				termMonths: 71,
				totalParticipants: 0,
				availableSlots: 0,
				contemplationRate: 0,
			},
			SCORING_INPUT,
		);
		expect(out.score).toBe(expected.score);
		expect(out.scoreBreakdown).toEqual(expected.factors);
		// Nunca o 0.99 fabricado pela LLM.
		expect(out.score).not.toBe(0.99);
	});

	it("§7.1 — availableSlots ausente/0 → nenhuma linha de contemplação (contempladosMes omitido)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", {
			recommendations: [realGroup({ availableSlots: 0 })],
		});
		const out = coerceRecommendationPayload({ id: realGroup().id, contempladosMes: 12 }, index);
		expect(out.contempladosMes).toBeUndefined();
		expect(out.availableSlots).toBe(0);
	});

	it("§7.3 — contemplação real quando existe: availableSlots:2 → contempladosMes coagido = 2", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", {
			recommendations: [realGroup({ availableSlots: 2 })],
		});
		const out = coerceRecommendationPayload({ id: realGroup().id, contempladosMes: 36 }, index);
		expect(out.contempladosMes).toBe(2);
		expect(out.availableSlots).toBe(2);
	});

	it("sem grupo ancorado (id não bate) → ainda remove o contempladosMes fabricado", () => {
		const index: RevealGroupIndex = new Map();
		const out = coerceRecommendationPayload(
			{ id: "id-fantasma", contempladosMes: 36, administradora: "X" },
			index,
		);
		expect(out.contempladosMes).toBeUndefined();
		// mantém groupId/quotaId derivados do id (contrato), sem inventar números.
		expect(out.groupId).toBe("id-fantasma");
		expect(out.creditValue).toBeUndefined();
	});
});

// FIX-261 (rodada 5, veredito Fable r4, menores): o hero do reveal podia vir
// bem acima do valor PEDIDO (denominação real da Bevi) sem NENHUM aviso — só
// o real_offer do fechamento (FIX-197/240) tinha o aviso de ajuste. O
// componente (recommendation-card.tsx) já sabia renderizar via rawCreditValue
// (hasCreditAdjustment) — só faltava o servidor propagar o valor pedido.
describe("FIX-261 — rawCreditValue no recommendation_card (aviso de ajuste desde o reveal)", () => {
	it("valor pedido difere da carta real do grupo → out.rawCreditValue = valor pedido", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });
		const out = coerceRecommendationPayload({ id: realGroup().id }, index, undefined, 120_000);
		expect(out.rawCreditValue).toBe(120_000);
		expect(out.creditValue).toBe(300_000);
	});

	it("valor pedido igual à carta real → SEM rawCreditValue (não inventa aviso)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });
		const out = coerceRecommendationPayload({ id: realGroup().id }, index, undefined, 300_000);
		expect("rawCreditValue" in out).toBe(false);
	});

	it("sem valor pedido (caminho legado) → SEM rawCreditValue, não quebra", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });
		const out = coerceRecommendationPayload({ id: realGroup().id }, index);
		expect("rawCreditValue" in out).toBe(false);
	});
});

describe("FIX-191 — coerção do seletor (comparison_table) + tipoOferta invisível", () => {
	it("coage cada cota do comparativo por id (números reais + groupId)", () => {
		const bb = realGroup();
		const canopus = realGroup({
			id: "6a3e6cec419653c0a99936d0",
			administradora: "CANOPUS",
			creditValue: 220000,
			monthlyPayment: 1414.39,
			termMonths: 116,
			ofertaId: "73b53a27-bf1d-4e9e-85b1-fd1d411e3b47",
		});
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [bb, canopus] });

		const llmComparison = {
			highlightBestIndex: 0,
			groups: [
				{
					id: bb.id,
					administradora: "BANCO DO BRASIL",
					creditValue: 1,
					monthlyPayment: 1,
					termMonths: 1,
					contempladosMes: 36,
				},
				{
					id: canopus.id,
					administradora: "CANOPUS",
					creditValue: 2,
					monthlyPayment: 2,
					termMonths: 2,
				},
			],
		};
		const out = coerceComparisonPayload(llmComparison, index);
		const groups = out.groups as Array<Record<string, unknown>>;
		expect(groups[0].creditValue).toBe(300000);
		expect(groups[0].monthlyPayment).toBe(5404.2);
		expect(groups[0].groupId).toBe(bb.id);
		expect(groups[0].contempladosMes).toBeUndefined();
		expect(groups[1].creditValue).toBe(220000);
		expect(groups[1].groupId).toBe(canopus.id);
	});

	it("§7.5 — tipoOferta NUNCA entra no payload de UI (mesmo se o grupo real o carregar)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", {
			// grupo real com tipoOferta/grupo (não deveriam vir do toModelGroupSummary,
			// mas a coerção também não deve propagá-los se vierem).
			recommendations: [{ ...realGroup(), tipoOferta: "FREE_BID", grupo: "1797" }],
		});
		const hero = coerceRecommendationPayload({ id: realGroup().id }, index);
		expect(hero.tipoOferta).toBeUndefined();
		expect(hero.grupo).toBeUndefined();

		const comp = coerceComparisonPayload(
			{ groups: [{ id: realGroup().id, tipoOferta: "FREE_BID", grupo: "1797" }] },
			index,
		);
		const g0 = (comp.groups as Array<Record<string, unknown>>)[0];
		expect(g0.tipoOferta).toBeUndefined();
		expect(g0.grupo).toBeUndefined();
	});
});

describe("FIX-191 — indexRevealGroups: recommend sobrescreve search; ignora shape de erro", () => {
	it("recommend_groups sobrescreve a entrada do search_groups (traz rank)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "search_groups", { groups: [realGroup({ rank: undefined })] });
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup({ rank: 0 })] });
		expect(index.get(realGroup().id)?.rank).toBe(0);
	});

	it("tool sem contexto ({error}) → no-op (não quebra)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { error: "sem conversationId" });
		indexRevealGroups(index, "search_groups", null);
		expect(index.size).toBe(0);
	});
});

describe("FIX-191 — anti-regressão estrutural (fonte de produção)", () => {
	it("o runner coage recommendation_card E comparison_table (não empurra payload=input cru)", () => {
		const runner = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(runner).toContain("coerceRecommendationPayload");
		expect(runner).toContain("coerceComparisonPayload");
		expect(runner).toContain("indexRevealGroups");
	});

	it("o schema do present_recommendation_card NÃO expõe contempladosMes como input da LLM", () => {
		const tools = readSource("src/lib/agent/tools/ai-sdk.ts");
		const recBlock =
			tools.match(/export const recommendationSchema = z\.object\(\{[\s\S]*?\n\}\);/)?.[0] ?? "";
		expect(recBlock.length, "recommendationSchema não isolado").toBeGreaterThan(0);
		// O CAMPO (name: z...) não existe mais — o comentário pode citar o nome.
		expect(recBlock).not.toMatch(/contempladosMes\s*:/);
	});

	it("a diretiva do reveal NÃO manda a LLM 'copiar' contempladosMes/availableSlots (vira código)", () => {
		const directives = readSource("src/lib/agent/orchestrator/directives.ts");
		expect(directives).not.toMatch(/contempladosMes \(copie de availableSlots/);
	});
});

// FIX-223 (Ata 2026-07-04) — lance médio (avgBidValue) coagido server-side a
// partir do grupo REAL, igual aos demais números do hero/seletor. A LLM nunca
// fabrica o valor mesmo se tentar (Lei 3/4).
describe("FIX-223 — avgBidValue coagido server-side (lance médio)", () => {
	it("coerceRecommendationPayload propaga avgBidValue do grupo real, ignora o que a LLM mandou", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", {
			recommendations: [realGroup({ avgBidValue: 4_200 })],
		});
		const out = coerceRecommendationPayload({ id: realGroup().id, avgBidValue: 999_999 }, index);
		expect(out.avgBidValue).toBe(4_200);
	});

	it("sem avgBidValue no grupo real → omitido (nunca fabrica)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });
		const out = coerceRecommendationPayload({ id: realGroup().id, avgBidValue: 999_999 }, index);
		expect(out.avgBidValue).toBeUndefined();
	});

	it("coerceComparisonPayload propaga avgBidValue por cota, cada uma com o seu valor real", () => {
		const bb = realGroup({ avgBidValue: 4_200 });
		const canopus = realGroup({ id: "6a3e6cec419653c0a99936d0", avgBidValue: 1_800 });
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [bb, canopus] });
		const out = coerceComparisonPayload(
			{
				groups: [
					{ id: bb.id, avgBidValue: 1 },
					{ id: canopus.id, avgBidValue: 1 },
				],
			},
			index,
		);
		const groups = out.groups as Array<Record<string, unknown>>;
		expect(groups[0].avgBidValue).toBe(4_200);
		expect(groups[1].avgBidValue).toBe(1_800);
	});
});

// FIX-287 (veredito r9pos2 §3 P1-2): comparison_table/simulation_result do
// MESMO groupId, no MESMO turno, mostravam creditValue divergente (120k vs
// 160k) sem aviso — a tabela era coagida só a partir do valor-ALVO da busca
// (search/recommend), nunca sabia que aquele grupo específico já tinha sido
// simulado com um nominal REAL diferente. `knownCreditValueByGroupId` (minerado
// dos simulation_result já persistidos + do simulate_quota do turno corrente,
// ver known-credit-values.ts/runner.ts) fecha essa lacuna.
describe("FIX-287 — creditValue REAL já simulado sobrescreve o valor-alvo da busca", () => {
	it("dossiê: 4 grupos com creditValue:120000, BB já simulado com nominal real 160000 → comparison_table reflete 160000 pro BB + rawCreditValue:120000; os outros 3 permanecem intocados", () => {
		const bb = realGroup({
			id: "6a3e6ceb419653c0a99932d7",
			administradora: "BANCO DO BRASIL",
			creditValue: 120000,
		});
		const canopus = realGroup({ id: "canopus-id", administradora: "CANOPUS", creditValue: 120000 });
		const ancora = realGroup({ id: "ancora-id", administradora: "ÂNCORA", creditValue: 120000 });
		const rodobens = realGroup({
			id: "rodobens-id",
			administradora: "RODOBENS",
			creditValue: 120000,
		});
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", {
			recommendations: [bb, canopus, ancora, rodobens],
		});

		const knownCreditValueByGroupId = new Map([
			[bb.id, { creditValue: 160000, monthlyPayment: 2137.5 }],
		]);

		const llmComparison = {
			groups: [bb, canopus, ancora, rodobens].map((g) => ({
				id: g.id,
				administradora: g.administradora,
				creditValue: 120000,
				monthlyPayment: 1,
				termMonths: 1,
			})),
		};

		const out = coerceComparisonPayload(llmComparison, index, undefined, knownCreditValueByGroupId);
		const groups = out.groups as Array<Record<string, unknown>>;

		expect(groups[0].creditValue).toBe(160000);
		expect(groups[0].rawCreditValue).toBe(120000);
		// FIX-292: monthlyPayment vem do MESMO registro conhecido, nunca da
		// estimativa antiga (que correspondia ao creditValue errado).
		expect(groups[0].monthlyPayment).toBe(2137.5);

		for (const g of groups.slice(1)) {
			expect(g.creditValue).toBe(120000);
			expect("rawCreditValue" in g).toBe(false);
		}
	});

	it("grupo já simulado mas SEM divergência (nominal real == valor-alvo) → creditValue intocado, sem rawCreditValue", () => {
		const bb = realGroup({ id: "bb-sem-divergencia", creditValue: 120000 });
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [bb] });
		const known = new Map([[bb.id, { creditValue: 120000, monthlyPayment: 1 }]]);
		const out = coerceComparisonPayload(
			{ groups: [{ id: bb.id, creditValue: 120000, monthlyPayment: 1, termMonths: 1 }] },
			index,
			undefined,
			known,
		);
		const g0 = (out.groups as Array<Record<string, unknown>>)[0];
		expect(g0.creditValue).toBe(120000);
		expect("rawCreditValue" in g0).toBe(false);
	});

	it("grupo nunca simulado (sem entrada no mapa) → creditValue do valor-alvo, sem rawCreditValue (não inventa)", () => {
		const bb = realGroup({ id: "bb-nunca-simulado", creditValue: 120000 });
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [bb] });
		const out = coerceComparisonPayload(
			{ groups: [{ id: bb.id, creditValue: 120000, monthlyPayment: 1, termMonths: 1 }] },
			index,
			undefined,
			new Map(),
		);
		const g0 = (out.groups as Array<Record<string, unknown>>)[0];
		expect(g0.creditValue).toBe(120000);
		expect("rawCreditValue" in g0).toBe(false);
	});

	it("coerceRecommendationPayload (hero) também aplica a correção do groupId conhecido", () => {
		const bb = realGroup({ id: "hero-bb", creditValue: 120000 });
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [bb] });
		const known = new Map([[bb.id, { creditValue: 160000, monthlyPayment: 2137.5 }]]);
		const out = coerceRecommendationPayload({ id: bb.id }, index, undefined, undefined, known);
		expect(out.creditValue).toBe(160000);
		expect(out.rawCreditValue).toBe(120000);
		expect(out.monthlyPayment).toBe(2137.5);
	});
});

// FIX-222 (Ata 2026-07-04) — logo da administradora coagido server-side a
// partir do índice de logos (DB, injetado como Map puro — nunca a LLM fabrica
// uma URL). Ausente do cadastro → card cai no fallback (sem quebrar).
describe("FIX-222 — logoUrl coagido server-side (logo da administradora)", () => {
	it("coerceRecommendationPayload casa logoUrl por administradora (tolerante a acento/caixa)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });
		const logos = new Map([["BANCO DO BRASIL", "https://cdn/bb.png"]]);
		const out = coerceRecommendationPayload(
			{ id: realGroup().id, logoUrl: "https://fabricado.com/x.png" },
			index,
			logos,
		);
		expect(out.logoUrl).toBe("https://cdn/bb.png");
	});

	it("sem match no índice de logos → logoUrl ausente (fallback do card, nunca fabrica)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });
		const out = coerceRecommendationPayload(
			{ id: realGroup().id, logoUrl: "https://fabricado.com/x.png" },
			index,
			new Map(),
		);
		expect(out.logoUrl).toBeUndefined();
	});

	it("coerceComparisonPayload casa logoUrl por cota", () => {
		const bb = realGroup();
		const canopus = realGroup({ id: "6a3e6cec419653c0a99936d0", administradora: "CANOPUS" });
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [bb, canopus] });
		const logos = new Map([["CANOPUS", "https://cdn/canopus.png"]]);
		const out = coerceComparisonPayload(
			{ groups: [{ id: bb.id }, { id: canopus.id }] },
			index,
			logos,
		);
		const groups = out.groups as Array<Record<string, unknown>>;
		expect(groups[0].logoUrl).toBeUndefined();
		expect(groups[1].logoUrl).toBe("https://cdn/canopus.png");
	});
});
