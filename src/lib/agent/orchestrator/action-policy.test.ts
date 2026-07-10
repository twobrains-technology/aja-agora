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
import {
	ACTION_PRECONDITIONS,
	administradoraNaoExibidaDirective,
	evaluateActionPrecondition,
	naoExibidoDirective,
} from "./action-policy";

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

	it("a tabela cobre as tools de risco (FIX-179 + as 3 de proposta do FIX-187)", () => {
		// FIX-187 acrescentou present_recommendation_card + present_simulation_result
		// (antes ausentes) à tabela — as 3 tools de proposta exigem descoberta fresca.
		expect(Object.keys(ACTION_PRECONDITIONS).sort()).toEqual(
			[
				"get_group_details",
				"present_decision_prompt",
				"present_recommendation_card",
				"present_simulation_result",
				"simulate_quota",
			].sort(),
		);
	});
});

// FIX-187 (Kairo 2026-07-01) — o gate de proposta exige descoberta BEM-SUCEDIDA
// NO TURNO. O print: a busca do turno falhou (FIX-186) e MESMO ASSIM saiu um card
// "Esse plano faz sentido?" com números (Valor R$ 131.042, Parcela R$ 2.365...)
// ancorado em dado que não carregou. As 3 tools de proposta reprovam quando
// discoveryFailedThisTurn. Regra INVIOLÁVEL do CLAUDE.md #2 (Bevi fonte única).
describe("FIX-187 — proposta exige descoberta bem-sucedida no turno", () => {
	const DISCOVERY_FAILED = /descoberta.*falhou|nao proponha|não proponha|nao carregou|não carregou/i;

	it("present_recommendation_card BLOQUEIA quando a descoberta do turno falhou", () => {
		const v = evaluateActionPrecondition("present_recommendation_card", {
			shown: emptyShownGroups(),
			args: { administradora: "BANCO DO BRASIL", creditValue: 131042 },
			discoveryFailedThisTurn: true,
		});
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.directive).toMatch(DISCOVERY_FAILED);
	});

	it("present_simulation_result BLOQUEIA quando a descoberta do turno falhou", () => {
		const v = evaluateActionPrecondition("present_simulation_result", {
			shown: emptyShownGroups(),
			args: { groupId: "x", monthlyPayment: 2365 },
			discoveryFailedThisTurn: true,
		});
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.directive).toMatch(DISCOVERY_FAILED);
	});

	it("present_decision_prompt BLOQUEIA quando a descoberta do turno falhou (mesmo com administradora exibida)", () => {
		const v = evaluateActionPrecondition("present_decision_prompt", {
			shown: shownWith([], ["BANCO DO BRASIL"]),
			args: { administradora: "BANCO DO BRASIL" },
			discoveryFailedThisTurn: true,
		});
		expect(v.allow).toBe(false);
		if (!v.allow) expect(v.directive).toMatch(DISCOVERY_FAILED);
	});

	it("as 3 tools PERMITEM quando a descoberta do turno NÃO falhou (fluxo normal não regride)", () => {
		expect(
			evaluateActionPrecondition("present_recommendation_card", {
				shown: emptyShownGroups(),
				args: { administradora: "ITAÚ" },
				discoveryFailedThisTurn: false,
			}).allow,
		).toBe(true);
		expect(
			evaluateActionPrecondition("present_simulation_result", {
				shown: emptyShownGroups(),
				args: { groupId: "x" },
				discoveryFailedThisTurn: false,
			}).allow,
		).toBe(true);
		// present_decision_prompt: sem falha e com administradora exibida → permite.
		expect(
			evaluateActionPrecondition("present_decision_prompt", {
				shown: shownWith([], ["ITAÚ"]),
				args: { administradora: "ITAÚ" },
				discoveryFailedThisTurn: false,
			}).allow,
		).toBe(true);
	});

	it("discoveryFailedThisTurn omitido (contexto legado) = não bloqueia por descoberta (só shown-groups)", () => {
		// FIX-179/180 não regride: sem o sinal, a precondição de shown segue valendo.
		expect(
			evaluateActionPrecondition("present_recommendation_card", {
				shown: emptyShownGroups(),
				args: { administradora: "ITAÚ" },
			}).allow,
		).toBe(true);
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

// FIX-249 (rodada 3, Fable r2, N2 P0): achado ao vivo — usuário nomeou "ITAÚ"
// (visível na comparison_table) e o LLM negou a existência, inventou
// groupIds (bloqueados aqui, corretamente) e prometeu "te retorno" — beco-
// sem-saída (a web não tem canal proativo). As diretivas de recovery agora
// proíbem EXPLICITAMENTE os dois comportamentos.
describe("FIX-249 — diretivas de recovery proíbem negar existência e prometer retorno proativo", () => {
	it("naoExibidoDirective proíbe negar a entidade e prometer retorno/contato futuro", () => {
		const d = naoExibidoDirective("grupo-fabricado-123");
		expect(d).toMatch(/PROIBIDO.*negar/i);
		expect(d.toLowerCase()).toMatch(/te retorno/);
		expect(d.toLowerCase()).toMatch(/resolva agora/);
	});

	it("administradoraNaoExibidaDirective proíbe negar a existência e prometer retorno/contato futuro", () => {
		const d = administradoraNaoExibidaDirective("ITAÚ");
		expect(d).toMatch(/PROIBIDO.*negar/i);
		expect(d.toLowerCase()).toMatch(/te retorno/);
		expect(d.toLowerCase()).toMatch(/agora/);
	});
});
