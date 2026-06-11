// FIX-23 — Camada 1 (estrutural): TRAVA o shape enxuto dos tool-results de
// descoberta/simulação. O output do execute entra no histórico da conversa e é
// re-enviado a CADA turno (multi-turn) — payload bruto da Bevi (68 campos,
// ~1948 tok/3 ofertas) acumulado = context rot + latência (SLA <3s).
//
// O offer-mapper já reduz pra ~199 tok (90% cortado). Este teste GARANTE que a
// dieta não regrida: se alguém reintroduzir campos crus da Bevi (bank, quotaId,
// bidPercentage, …) no output pro MODELO, o CI quebra. Complementa medindo que o
// payload do CARD (pós-coerção) continua RICO — diet não pode esfomear o card.
//
// Medição baseline (fixture real AUTOS, 3 ofertas, 2026-06-11):
//   RAW Bevi 3× ............ ~1948 tok   (se vazasse cru)
//   search_groups .......... ~199 tok    (mapper já corta 90%)
//   simulate_quota ......... ~128 tok    (100% consumido pela coerção do card)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { coerceSimulationPayload } from "@/lib/agent/orchestrator/simulation-payload";
import { fixtureDiscoveryAdapter } from "../../../../tests/helpers/fixture-discovery-adapter";
import { buildConsorcioTools } from "./ai-sdk";

beforeAll(() => __setDiscoveryAdapterFactoryForTests(() => fixtureDiscoveryAdapter()));
afterAll(() => __setDiscoveryAdapterFactoryForTests(null));

const tools = buildConsorcioTools({ conversationId: "fix-23-token-diet" });
// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx não é exportado
const ctx = { toolCallId: "t", messages: [] } as any;

// Campos crus da Bevi (offer-mapper.BeviOffer) que NUNCA podem vazar pro modelo —
// amostra representativa dos 68 campos do payload bruto.
const RAW_BEVI_KEYS = [
	"bank",
	"quotaId",
	"finalValue",
	"importedInstallmentValue",
	"bidPercentage",
	"bidDifferencePercentage",
	"commission",
	"lookupCeiling",
	"averageBid",
	"monthlyAwardedQuotas",
	"probContemplacaoMeses",
	"productType",
	"adjustmentType",
];

function assertNoRawBeviLeak(obj: Record<string, unknown>, label: string) {
	for (const k of RAW_BEVI_KEYS) {
		expect(
			obj,
			`${label} vazou campo cru da Bevi '${k}' pro contexto do modelo`,
		).not.toHaveProperty(k);
	}
}

describe("FIX-23 — dieta dos tool-results de descoberta (shape enxuto pro modelo)", () => {
	it("search_groups: output pro modelo só tem o resumo decisório (sem totalParticipants nem campos crus)", async () => {
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const out = (await exec({ category: "auto", creditMax: 60_000 }, ctx)) as {
			groups: Array<Record<string, unknown>>;
			total: number;
		};
		expect(out.groups.length).toBeGreaterThan(0);
		const g = out.groups[0];
		// Allow-list exato — resumo decisório: administradora, crédito, parcela,
		// prazo, taxa, ids leves (+ liquidez). NADA além disso.
		expect(Object.keys(g).sort()).toEqual(
			[
				"adminFeePercent",
				"administradora",
				"availableSlots",
				"category",
				"contemplationRate",
				"creditValue",
				"id",
				"monthlyPayment",
				"termMonths",
			].sort(),
		);
		// totalParticipants é constante 0 no Trilho B (a oferta não traz) — campo
		// morto que o modelo nunca usa e nenhum card schema referencia.
		expect(g, "totalParticipants é peso morto — não vai pro contexto").not.toHaveProperty(
			"totalParticipants",
		);
		assertNoRawBeviLeak(g, "search_groups[0]");
	});

	it("recommend_groups: cada recomendação só tem resumo decisório + score (sem totalParticipants nem campos crus)", async () => {
		const exec = tools.recommend_groups.execute;
		if (!exec) throw new Error("recommend_groups.execute undefined");
		const out = (await exec(
			{
				category: "auto",
				creditMin: 20_000,
				creditMax: 60_000,
				budget: 1_200,
				desiredTermMonths: 70,
			},
			ctx,
		)) as { recommendations: Array<Record<string, unknown>> };
		expect(out.recommendations.length).toBeGreaterThan(0);
		const r = out.recommendations[0];
		expect(r, "recomendação não pode carregar totalParticipants morto").not.toHaveProperty(
			"totalParticipants",
		);
		assertNoRawBeviLeak(r, "recommend_groups[0]");
		// Campos essenciais do card de recomendação preservados.
		for (const k of [
			"id",
			"administradora",
			"creditValue",
			"monthlyPayment",
			"score",
			"scoreBreakdown",
		]) {
			expect(r, `recomendação perdeu campo essencial '${k}'`).toHaveProperty(k);
		}
	});

	it("simulate_quota: output enxuto e sem campos crus (mas mantém o breakdown que o card coage)", async () => {
		const search = tools.search_groups.execute;
		const sim = tools.simulate_quota.execute;
		if (!search || !sim) throw new Error("tools undefined");
		const groups = (await search({ category: "auto", creditMax: 60_000 }, ctx)) as {
			groups: Array<{ id: string; creditValue: number }>;
		};
		const g = groups.groups[0];
		const out = (await sim({ groupId: g.id, creditValue: g.creditValue }, ctx)) as Record<
			string,
			unknown
		>;
		assertNoRawBeviLeak(out, "simulate_quota");
		// Allow-list do resumo de simulação (QuotaSimulation). O modelo recebe o
		// breakdown porque é a MESMA fonte que o runner coage no card (acoplamento
		// a runner.ts — fora do escopo deste bloco; cortar aqui quebraria o card).
		expect(Object.keys(out).sort()).toEqual(
			[
				"adminFee",
				"category",
				"creditValue",
				"effectiveRate",
				"embeddedBid",
				"expectedAdjustment",
				"groupId",
				"insurance",
				"lanceScenario",
				"monthlyPayment",
				"reserveFund",
				"termMonths",
				"totalCost",
			].sort(),
		);
	});

	it("payload do CARD continua RICO após coerção — diet não esfomeia o simulation_result", async () => {
		const search = tools.search_groups.execute;
		const sim = tools.simulate_quota.execute;
		if (!search || !sim) throw new Error("tools undefined");
		const groups = (await search({ category: "auto", creditMax: 60_000 }, ctx)) as {
			groups: Array<{ id: string; creditValue: number; administradora: string }>;
		};
		const g = groups.groups[0];
		const quota = await sim({ groupId: g.id, creditValue: g.creditValue }, ctx);
		// Card como o modelo o chamaria (só administradora/actions na mão; números
		// vêm da coerção). O breakdown rico TEM que sobreviver.
		const cardInput = {
			administradora: g.administradora,
			actions: [{ label: "Contratar", intent: "x" }],
		};
		const card = coerceSimulationPayload(cardInput, quota);
		for (const k of [
			"creditValue",
			"monthlyPayment",
			"adminFee",
			"reserveFund",
			"insurance",
			"totalCost",
			"effectiveRate",
			"lanceScenario",
			"embeddedBid",
			"expectedAdjustment",
		]) {
			expect(card, `card de simulação perdeu o campo rico '${k}'`).toHaveProperty(k);
		}
		// Conteúdo não-numérico que só o modelo controla é preservado.
		expect(card.administradora).toBe(g.administradora);
		expect(card.actions).toBeDefined();
	});
});
