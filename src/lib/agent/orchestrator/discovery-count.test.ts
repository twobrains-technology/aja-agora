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

	// REV-A (modelo errado): o teste antigo passava um ARRAY cru
	// (`[{id}]`), mas `executeSearchGroups` NUNCA devolve array — devolve
	// `{ groups, total }` (ai-sdk.ts:302). O branch `Array.isArray(output)`
	// era código MORTO: com o shape real, retornava sempre null → o
	// single-option guard (FIX-7) nunca disparava no caminho search_groups
	// e o recommendation_card duplicava o grupo. Teste agora usa o shape
	// REAL de produção.
	it("search_groups: conta groups no shape real {groups,total}", () => {
		expect(extractDiscoveryCount("search_groups", { groups: [{ id: "a" }], total: 1 })).toBe(1);
		expect(
			extractDiscoveryCount("search_groups", {
				groups: [{ id: "a" }, { id: "b" }],
				total: 2,
			}),
		).toBe(2);
	});

	it("outras tools / shapes desconhecidos → null (não interfere)", () => {
		expect(extractDiscoveryCount("simulate_quota", { groupId: "x" })).toBeNull();
		expect(extractDiscoveryCount("search_groups", { weird: true })).toBeNull();
		// DISCOVERY_NO_CONTEXT (sem adapter) tem shape {error} → não conta.
		expect(extractDiscoveryCount("search_groups", { error: "no ctx" })).toBeNull();
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
