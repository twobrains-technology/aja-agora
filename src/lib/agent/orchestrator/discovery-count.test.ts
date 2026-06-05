/**
 * Camada 1 — FIX-7 (teste manual Kairo 2026-06-05): com a descoberta
 * retornando UMA opção, o reveal mostrava o card de Recomendação E o card de
 * Simulação do MESMO grupo (CANOPUS 2×) — "fica o carrossel só que só tem um
 * e aí embaixo repete ele de novo".
 *
 * Fix: o runner captura o tamanho da descoberta nos tool-results
 * (search_groups/recommend_groups) e, com opção ÚNICA, suprime o
 * recommendation_card — o detalhamento (simulation_result) é o card único.
 */

import { describe, expect, it } from "vitest";
import { extractDiscoveryCount } from "./discovery-count";

describe("FIX-7 — extractDiscoveryCount", () => {
	it("recommend_groups: conta recommendations", () => {
		expect(
			extractDiscoveryCount("recommend_groups", {
				recommendations: [{ id: "a" }],
				total: 1,
				insufficientOptions: true,
			}),
		).toBe(1);
		expect(
			extractDiscoveryCount("recommend_groups", {
				recommendations: [{ id: "a" }, { id: "b" }, { id: "c" }],
				total: 3,
			}),
		).toBe(3);
	});

	it("search_groups: conta o array de grupos", () => {
		expect(extractDiscoveryCount("search_groups", [{ id: "a" }])).toBe(1);
		expect(extractDiscoveryCount("search_groups", [{ id: "a" }, { id: "b" }])).toBe(2);
	});

	it("outras tools / shapes desconhecidos → null (não interfere)", () => {
		expect(extractDiscoveryCount("simulate_quota", { groupId: "x" })).toBeNull();
		expect(extractDiscoveryCount("search_groups", { weird: true })).toBeNull();
		expect(extractDiscoveryCount("recommend_groups", null)).toBeNull();
	});
});

describe("FIX-7 — acoplamento: runner suprime recommendation_card em opção única", () => {
	it("runner usa extractDiscoveryCount e o guard de opção única", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/lib/agent/orchestrator/runner.ts", "utf-8");
		expect(src).toMatch(/extractDiscoveryCount/);
		expect(src).toMatch(/single-option|opção única|opcao unica/i);
	});
});
