/**
 * FIX-180 (Mirella, 2026-07-01) — allowlist estado→ação→precondição.
 *
 * A tabela declarativa `ação → precondição` generaliza o FIX-179 (que era
 * ad-hoc dentro do execute de cada tool) para PRINCÍPIO: uma tool de risco só
 * age sobre DADO ancorado (grupo/administradora já exibido em tela). É a
 * dimensão DADO da allowlist; a dimensão ESTADO (qual tool em qual fase) segue
 * no tool-policy.ts. Fundamento: Leis 2 e 3 de
 * ~/.claude/reference/arquitetura-agentes-ia.md.
 *
 * Camada 1 (structural): a tabela nega ação sobre grupo não-exibido; ai-sdk.ts
 * usa evaluateActionPrecondition (migração do FIX-179 inline); builder.ts liga
 * o belt nativo prepareStep.activeTools derivado da fase.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyShownGroups, type ShownGroups } from "@/lib/agent/tools/shown-groups";
import { ACTION_PRECONDITIONS, evaluateActionPrecondition } from "./action-policy";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

const NAO_EXIBIDO = /nao foi exibid|não foi exibid|apresente.*antes|reapresent|nao foi apresentad|não foi apresentad/i;

function shownWith(ids: string[], administradoras: string[]): ShownGroups {
	const s = emptyShownGroups();
	for (const id of ids) s.ids.add(id);
	for (const a of administradoras) s.administradoras.add(a);
	return s;
}

describe("FIX-180 — evaluateActionPrecondition (precondição de DADO por ação)", () => {
	it("simulate_quota BLOQUEIA groupId nunca exibido (raiz do bug Mirella)", () => {
		const v = evaluateActionPrecondition("simulate_quota", {
			shown: emptyShownGroups(),
			args: { groupId: "6a0ca9c73e68cce9b61d30fd", creditValue: 106000 },
		});
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.directive).toMatch(NAO_EXIBIDO);
	});

	it("simulate_quota PERMITE groupId já exibido", () => {
		const v = evaluateActionPrecondition("simulate_quota", {
			shown: shownWith(["6a0ca9c73e68cce9b61d30fd"], []),
			args: { groupId: "6a0ca9c73e68cce9b61d30fd", creditValue: 106000 },
		});
		expect(v.allow).toBe(true);
	});

	it("get_group_details BLOQUEIA groupId nunca exibido e PERMITE exibido", () => {
		expect(
			evaluateActionPrecondition("get_group_details", { shown: emptyShownGroups(), args: { groupId: "x" } }).allow,
		).toBe(false);
		expect(
			evaluateActionPrecondition("get_group_details", { shown: shownWith(["x"], []), args: { groupId: "x" } }).allow,
		).toBe(true);
	});

	it("present_decision_prompt BLOQUEIA administradora nunca exibida (o 'Embracon' do nada)", () => {
		const v = evaluateActionPrecondition("present_decision_prompt", {
			shown: shownWith([], ["Itaú"]),
			args: { administradora: "Embracon" },
		});
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.directive).toMatch(NAO_EXIBIDO);
	});

	it("present_decision_prompt PERMITE administradora exibida", () => {
		expect(
			evaluateActionPrecondition("present_decision_prompt", {
				shown: shownWith([], ["Itaú"]),
				args: { administradora: "Itaú" },
			}).allow,
		).toBe(true);
	});

	it("present_decision_prompt SEM administradora não valida nada (decisão genérica é permitida)", () => {
		expect(
			evaluateActionPrecondition("present_decision_prompt", { shown: emptyShownGroups(), args: {} }).allow,
		).toBe(true);
	});

	it("tool FORA da tabela (search_groups, recommend_groups) não tem precondição de dado", () => {
		expect(evaluateActionPrecondition("search_groups", { shown: emptyShownGroups(), args: {} }).allow).toBe(true);
		expect(evaluateActionPrecondition("recommend_groups", { shown: emptyShownGroups(), args: {} }).allow).toBe(true);
	});

	it("a tabela cobre exatamente as 3 tools de risco do FIX-179 (não regride, não expande às cegas)", () => {
		expect(Object.keys(ACTION_PRECONDITIONS).sort()).toEqual(
			["get_group_details", "present_decision_prompt", "simulate_quota"].sort(),
		);
	});
});

describe("FIX-180 — Camada 1 structural: migração do FIX-179 inline pra tabela + belt nativo", () => {
	it("ai-sdk.ts usa evaluateActionPrecondition (não mais os ifs inline de shown.ids/administradoras)", () => {
		const src = readSource("src/lib/agent/tools/ai-sdk.ts");
		expect(src, "ai-sdk deve delegar a precondição de dado pra action-policy").toMatch(/evaluateActionPrecondition/);
		// os 3 executes de risco passam pela tabela.
		const occurrences = src.match(/evaluateActionPrecondition/g) ?? [];
		expect(occurrences.length).toBeGreaterThanOrEqual(3);
	});

	it("builder.ts liga o belt nativo prepareStep.activeTools derivado da fase (allowedTools) quando meta presente", () => {
		const src = readSource("src/lib/agent/agents/builder.ts");
		expect(src, "builder precisa expor activeTools no prepareStep (primitivo nativo do AI SDK 6 pro eixo estado→ação)").toMatch(/activeTools/);
		expect(src, "o belt re-afirma a allowlist da fase (allowedTools) por step").toMatch(/prepareStep/);
	});

	it("FIX-179 NÃO regride: shown-groups continua sendo a fonte do 'exibido'", () => {
		const src = readSource("src/lib/agent/tools/ai-sdk.ts");
		expect(src).toMatch(/getShownGroups|loadShownGroups|markShown/);
	});
});
