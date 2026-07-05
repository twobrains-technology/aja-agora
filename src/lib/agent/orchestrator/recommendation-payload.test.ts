import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	coerceComparisonPayload,
	coerceRecommendationPayload,
	coerceRevealCota,
	indexRevealGroups,
	type RevealGroupIndex,
} from "./recommendation-payload";

const readSource = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf-8");

// Grupo real como sai de recommend_groups (toModelGroupSummary + score). O
// availableSlots aqui é o monthlyAwardedQuotas coagido (FIX-192).
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
		score: 0.7237,
		scoreBreakdown: { monthlyFit: 0.2, contemplation: 0.5, adminFee: 0.1, termMatch: 0.5 },
		...over,
	};
}

describe("FIX-191 — coerção server-side do recommendation_card (hero)", () => {
	it("§7.2 — LLM emite contempladosMes:36 (e números fabricados) → card ignora e usa o REAL coagido", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup()] });

		// A LLM digitou um payload fabricado (o bug real: 36/mês, score inflado, parcela errada).
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
		expect(out.score).toBe(0.7237);
		// CONTRATO com bloco-b: groupId/quotaId/ofertaId presentes e reais.
		expect(out.groupId).toBe("6a3e6ceb419653c0a99932af");
		expect(out.quotaId).toBe("6a3e6ceb419653c0a99932af");
		expect(out.ofertaId).toBe("49c2b15f-6f4a-42bc-b01e-f680cf7d553e");
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
	it("recommend_groups sobrescreve a entrada do search_groups (traz score)", () => {
		const index: RevealGroupIndex = new Map();
		indexRevealGroups(index, "search_groups", { groups: [realGroup({ score: undefined })] });
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup({ score: 0.9 })] });
		expect(index.get(realGroup().id)?.score).toBe(0.9);
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
		indexRevealGroups(index, "recommend_groups", { recommendations: [realGroup({ avgBidValue: 4_200 })] });
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
			{ groups: [{ id: bb.id, avgBidValue: 1 }, { id: canopus.id, avgBidValue: 1 }] },
			index,
		);
		const groups = out.groups as Array<Record<string, unknown>>;
		expect(groups[0].avgBidValue).toBe(4_200);
		expect(groups[1].avgBidValue).toBe(1_800);
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
		const out = coerceComparisonPayload({ groups: [{ id: bb.id }, { id: canopus.id }] }, index, logos);
		const groups = out.groups as Array<Record<string, unknown>>;
		expect(groups[0].logoUrl).toBeUndefined();
		expect(groups[1].logoUrl).toBe("https://cdn/canopus.png");
	});
});
