/**
 * Camada 1 — FIX-6 (teste manual Kairo 2026-06-05): o payload do
 * contemplation_dial vinha 100% do MODELO, que passou o valor do slider da
 * qualificação (R$ 20k → "crédito que você recebe R$ 17.600 / parcela
 * R$ 419") em vez da oferta REAL que o usuário acabou de confirmar
 * (CANOPUS R$ 35.000 / R$ 475,93 / 96m). Números contraditórios lado a
 * lado quebram a confiança.
 *
 * Fix: coerceDialPayload — o servidor SOBRESCREVE os campos críticos
 * (administradora, category, creditValue, termMonths, monthlyPayment) com o
 * snapshot da oferta ativa (meta.recommendedOffer, capturado no reveal) e
 * preserva os campos de interação do modelo (initialTargetMonth etc.).
 */

import { describe, expect, it } from "vitest";
import { coerceDialPayload, computeMoneyAnchor, type RecommendedOfferSnapshot } from "./dial-payload";

const CANOPUS: RecommendedOfferSnapshot = {
	administradora: "CANOPUS",
	category: "moto",
	creditValue: 35_000,
	termMonths: 96,
	monthlyPayment: 475.93,
};

describe("FIX-6 — coerceDialPayload força os números da oferta ativa", () => {
	it("sobrescreve os campos críticos vindos errados do modelo (cenário exato do bug)", () => {
		// O modelo passou o crédito do SLIDER (20k), não o da oferta (35k).
		const modelInput = {
			administradora: "CANOPUS",
			category: "moto",
			creditValue: 20_000,
			termMonths: 51,
			monthlyPayment: 500,
			initialTargetMonth: 6,
		};
		const out = coerceDialPayload(modelInput, CANOPUS);
		expect(out.creditValue).toBe(35_000);
		expect(out.termMonths).toBe(96);
		expect(out.monthlyPayment).toBe(475.93);
		expect(out.administradora).toBe("CANOPUS");
		expect(out.category).toBe("moto");
	});

	it("preserva os campos de interação do modelo (mês-alvo, lance histórico, teto embutido)", () => {
		const out = coerceDialPayload(
			{
				category: "auto",
				creditValue: 1,
				termMonths: 1,
				monthlyPayment: 1,
				initialTargetMonth: 12,
				historicalWinningBidPct: 35,
				maxEmbutidoPct: 25,
			},
			CANOPUS,
		);
		expect(out.initialTargetMonth).toBe(12);
		expect(out.historicalWinningBidPct).toBe(35);
		expect(out.maxEmbutidoPct).toBe(25);
	});

	it("clampa initialTargetMonth ao prazo real do grupo (96m) quando o modelo exagera", () => {
		const out = coerceDialPayload(
			{
				category: "moto",
				creditValue: 1,
				termMonths: 200,
				monthlyPayment: 1,
				initialTargetMonth: 150,
			},
			CANOPUS,
		);
		expect(out.initialTargetMonth).toBeLessThanOrEqual(96);
		expect(out.initialTargetMonth).toBeGreaterThanOrEqual(1);
	});

	it("sem snapshot (oferta ainda não revelada): payload do modelo passa intacto", () => {
		const input = {
			category: "auto" as const,
			creditValue: 50_000,
			termMonths: 80,
			monthlyPayment: 600,
			initialTargetMonth: 6,
		};
		expect(coerceDialPayload(input, undefined)).toEqual(input);
	});
});

describe("FIX-6 — acoplamento: runner captura o snapshot e coage o payload", () => {
	it("runner persiste recommendedOffer no reveal e usa coerceDialPayload", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/lib/agent/orchestrator/runner.ts", "utf-8");
		expect(src).toMatch(/recommendedOffer/);
		expect(src).toMatch(/coerceDialPayload/);
	});

	it("ConversationMetadata tem o slot recommendedOffer", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/lib/agent/personas.ts", "utf-8");
		expect(src).toMatch(/recommendedOffer\?:/);
	});
});

// FIX-241 (rodada 2, Fable r1, D1 do veredito) — âncora de dinheiro: quando o
// usuário declarou monthlySavings, a agulha responde "quando o seu DINHEIRO
// alcança", não "quando você quer" (spec 03). O mês-alvo inicial do dial passa
// a vir de anchorMonth() — 1º mês em que o BOLSO cobre o lance — em vez do
// prazo desejado (que era o bug: Madalena "junto 4 mil/mês" → dial em mês 6,
// o prazo dela, nunca ~15 do cálculo do bolso).
describe("FIX-241 — computeMoneyAnchor + coerceDialPayload ancoram no BOLSO, não no desejo", () => {
	it("sem monthlySavings → null (nada a ancorar, comportamento intacto)", () => {
		expect(computeMoneyAnchor(CANOPUS, { prazoMeses: 12 })).toBeNull();
		expect(computeMoneyAnchor(CANOPUS, undefined)).toBeNull();
	});

	it("sem oferta → null", () => {
		expect(computeMoneyAnchor(null, { monthlySavings: 4000 })).toBeNull();
	});

	it("com monthlySavings > 0 → calcula o mês âncora via anchorMonth() (mesmo motor)", async () => {
		const { anchorMonth } = await import("@/lib/consorcio/contemplation-dial");
		const expected = anchorMonth(
			{ creditValue: CANOPUS.creditValue, termMonths: CANOPUS.termMonths },
			{ initial: 0, monthlySavings: 4000 },
		);
		const anchor = computeMoneyAnchor(CANOPUS, { monthlySavings: 4000 });
		expect(anchor?.anchoredMonth).toBe(expected);
		expect(anchor?.monthlySavings).toBe(4000);
	});

	it("lanceValue (reserva pontual já disponível) entra como `initial` no anchorMonth", async () => {
		const { anchorMonth } = await import("@/lib/consorcio/contemplation-dial");
		const expected = anchorMonth(
			{ creditValue: CANOPUS.creditValue, termMonths: CANOPUS.termMonths },
			{ initial: 5000, monthlySavings: 1000 },
		);
		const anchor = computeMoneyAnchor(CANOPUS, { monthlySavings: 1000, lanceValue: 5000 });
		expect(anchor?.anchoredMonth).toBe(expected);
	});

	it("fgtsValue entra como fonte extra (abate o bolso, spec 03 — vertical imóvel)", async () => {
		const { anchorMonth } = await import("@/lib/consorcio/contemplation-dial");
		const semFgts = anchorMonth(
			{ creditValue: CANOPUS.creditValue, termMonths: CANOPUS.termMonths },
			{ initial: 0, monthlySavings: 500 },
		);
		const comFgts = computeMoneyAnchor(CANOPUS, { monthlySavings: 500, fgtsValue: 15_000 });
		// FGTS abate o bolso necessário → contempla mais cedo (mês menor ou igual).
		expect(comFgts?.anchoredMonth).toBeLessThanOrEqual(semFgts ?? Number.POSITIVE_INFINITY);
	});

	it("coerceDialPayload: com monthlySavings, initialTargetMonth vem do ANCORADO, não do prazo desejado nem do palpite do modelo", async () => {
		const { anchorMonth } = await import("@/lib/consorcio/contemplation-dial");
		const anchored = anchorMonth(
			{ creditValue: CANOPUS.creditValue, termMonths: CANOPUS.termMonths },
			{ initial: 0, monthlySavings: 4000 },
		) as number;
		// Cenário exato do bug: prazo desejado = 6, modelo também manda 6 —
		// mas o dinheiro (4 mil/mês) alcança num mês diferente de 6.
		expect(anchored).not.toBe(6);
		const out = coerceDialPayload(
			{
				category: "moto",
				creditValue: 1,
				termMonths: 1,
				monthlyPayment: 1,
				initialTargetMonth: 6,
			},
			CANOPUS,
			{ prazoMeses: 6, monthlySavings: 4000 },
		);
		expect(out.initialTargetMonth).toBe(anchored);
	});

	it("coerceDialPayload: sem monthlySavings, mantém a prioridade antiga (modelo → prazo declarado → 6)", () => {
		const out = coerceDialPayload(
			{
				category: "moto",
				creditValue: 1,
				termMonths: 1,
				monthlyPayment: 1,
				initialTargetMonth: 6,
			},
			CANOPUS,
			{ prazoMeses: 6 },
		);
		expect(out.initialTargetMonth).toBe(6);
	});
});
