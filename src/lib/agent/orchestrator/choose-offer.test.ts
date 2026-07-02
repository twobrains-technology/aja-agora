import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findChosenOffer } from "./choose-offer";

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
