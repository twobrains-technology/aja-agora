// Camada 1 — FIX-C3 (auditoria Kairo 2026-06-11): o payload do
// present_simulation_result é digitado CAMPO A CAMPO pelo modelo — na jornada
// BB real ele mostrou "Valor que você recebe R$ 262.309,80" (a carta CHEIA)
// com lance embutido de 49,28%, contradizendo a semântica Bevi
// (receivedCredit = carta − embutido) e a educação que o próprio agente deu.
// Mesma classe do FIX-6: número de dinheiro NUNCA fica na mão do modelo.
// O servidor coage o payload contra o retorno REAL do simulate_quota do turno.

import { describe, expect, it } from "vitest";
import { coerceSimulationPayload } from "./simulation-payload";

// Retorno REAL do simulate_quota (shape de beviOfferToQuotaSimulation)
const QUOTA_SIM = {
	groupId: "quota-bb-1",
	category: "auto",
	creditValue: 262_309.8,
	monthlyPayment: 9_828.92,
	adminFee: 44_592.67,
	reserveFund: 5_246.2,
	insurance: 0,
	totalCost: 334_183.28,
	termMonths: 34,
	effectiveRate: 27.4,
	lanceScenario: { lancePercent: 49.28, expectedTermMonths: 6 },
	embeddedBid: {
		percent: 49.28,
		embeddedBidValue: 129_266.27,
		receivedCredit: 133_043.53,
		necessaryBidToContemplate: 129_266.27,
	},
	expectedAdjustment: { index: "IPCA", annualPercent: 4.5 },
};

describe("C3 — coerceSimulationPayload: números do card vêm do simulate_quota REAL", () => {
	it("corrige o bug da jornada: receivedCredit alucinado como carta cheia → valor real", () => {
		// Payload como o modelo emitiu no bug real (campos trocados)
		const hallucinated = {
			administradora: "BANCO DO BRASIL",
			category: "auto",
			creditValue: 262_309.8,
			monthlyPayment: 9_828.92,
			adminFee: 44_592.67,
			reserveFund: 5_246.2,
			insurance: 0,
			totalCost: 334_183.28,
			termMonths: 34,
			effectiveRate: 27.4,
			lanceScenario: { lancePercent: 49.28, expectedTermMonths: 6 },
			embeddedBid: {
				percent: 49.28,
				embeddedBidValue: 129_266.27,
				receivedCredit: 262_309.8, // ← ALUCINAÇÃO (carta cheia)
				necessaryBidToContemplate: 129_266.27,
			},
		};
		const out = coerceSimulationPayload(hallucinated, QUOTA_SIM);
		const embedded = out.embeddedBid as Record<string, unknown>;
		expect(embedded.receivedCredit).toBeCloseTo(133_043.53, 2);
	});

	it("coage TODOS os campos numéricos (modelo só mantém administradora/category/actions)", () => {
		const out = coerceSimulationPayload(
			{
				administradora: "BANCO DO BRASIL",
				category: "auto",
				creditValue: 999,
				monthlyPayment: 1,
				adminFee: 2,
				reserveFund: 3,
				insurance: 4,
				totalCost: 5,
				termMonths: 6,
				effectiveRate: 7,
				actions: [{ label: "Ajustar valor", intent: "adjust_value" }],
			},
			QUOTA_SIM,
		);
		expect(out.creditValue).toBe(262_309.8);
		expect(out.monthlyPayment).toBe(9_828.92);
		expect(out.termMonths).toBe(34);
		expect(out.totalCost).toBe(334_183.28);
		expect(out.lanceScenario).toEqual({ lancePercent: 49.28, expectedTermMonths: 6 });
		expect(out.embeddedBid).toEqual(QUOTA_SIM.embeddedBid);
		// não-numéricos do modelo preservados
		expect(out.administradora).toBe("BANCO DO BRASIL");
		expect(out.actions).toEqual([{ label: "Ajustar valor", intent: "adjust_value" }]);
	});

	it("sem retorno de simulate_quota no turno → payload intacto (não inventa)", () => {
		const input = { creditValue: 100, monthlyPayment: 1 };
		expect(coerceSimulationPayload(input, null)).toBe(input);
		expect(coerceSimulationPayload(input, undefined)).toBe(input);
	});

	it("retorno sem números válidos (ex: DISCOVERY_NO_CONTEXT) → payload intacto", () => {
		const input = { creditValue: 100, monthlyPayment: 1 };
		expect(coerceSimulationPayload(input, "Sem contexto de descoberta" as never)).toBe(input);
		expect(coerceSimulationPayload(input, { creditValue: 0 } as never)).toBe(input);
	});
});

describe("C3 — wiring no runner (acoplamento estrutural)", () => {
	it("runner captura o retorno do simulate_quota e coage o simulation_result", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/lib/agent/orchestrator/runner.ts", "utf-8");
		expect(src).toMatch(/simulate_quota/);
		expect(src).toMatch(/coerceSimulationPayload/);
	});
});
