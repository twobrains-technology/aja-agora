import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDecisionPromptDirective } from "./directives";

// ============================================================================
// Camada 1 (estrutural) — wiring do avanço pro card de decisão (passo 4→5)
// ----------------------------------------------------------------------------
// BUG-REVEAL-LOOP (Kairo, 2026-06-02): pós-reveal o agent re-disparava o reveal
// em loop e nunca chamava present_decision_prompt → passo 5. Estes asserts
// travam o wiring do fix contra a fonte de produção (directive + index + runner).
// ============================================================================

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("buildDecisionPromptDirective — passo 4 close", () => {
	it("instrui o agent a chamar present_decision_prompt (não present_lead_form)", () => {
		const d = buildDecisionPromptDirective({ administradora: "Porto Seguro" });
		expect(d).toContain("present_decision_prompt");
		expect(d).not.toContain("present_lead_form");
	});

	it("carrega a administradora do plano recomendado pro contexto do card", () => {
		const d = buildDecisionPromptDirective({ administradora: "Bradesco" });
		expect(d).toContain("Bradesco");
	});

	it("proíbe EXPLICITAMENTE re-apresentar o reveal (anti-loop)", () => {
		const d = buildDecisionPromptDirective({ administradora: "Porto Seguro" });
		// O directive nomeia as tools do reveal só pra PROIBIR re-chamá-las.
		expect(d).toMatch(/PROIBIDO/);
		expect(d).toMatch(/search_groups/);
		expect(d).toMatch(/present_comparison_table|present_recommendation_card|present_simulation_result/);
		// E menciona o anti-loop explicitamente.
		expect(d.toLowerCase()).toMatch(/loop|ja viu|já viu/);
	});
});

describe("index.ts — branch que dirige o gate 'decision'", () => {
	const src = readSource("src/lib/agent/orchestrator/index.ts");

	it("trata nextGateToFire === 'decision'", () => {
		expect(src).toMatch(/nextGateToFire === "decision"/);
	});

	it("usa decisionDispatched como guard de idempotência (mirror do searchDispatched)", () => {
		expect(src).toContain("decisionDispatched");
	});

	it("dirige o directive de decisão (buildDecisionPromptDirective)", () => {
		expect(src).toContain("buildDecisionPromptDirective");
	});
});

describe("runner.ts — guard anti-re-reveal + flag revealCompleted", () => {
	const src = readSource("src/lib/agent/orchestrator/runner.ts");

	it("marca revealCompleted quando a simulação/recomendação é apresentada", () => {
		expect(src).toContain("revealCompleted");
	});

	it("tem guard que suprime cards de descoberta re-emitidos pós-reveal", () => {
		// O guard referencia os tipos de artifact do reveal (comparison/recommendation).
		expect(src).toMatch(/comparison_table/);
		expect(src).toMatch(/searchDispatched/);
		// E menciona o bug que está prevenindo, pra rastreabilidade.
		expect(src).toMatch(/REVEAL-LOOP|re-?reveal|re-?apresent/i);
	});

	it("hardening (QA): marca decisionDispatched no free-run do modelo + suprime decision_prompt duplicado", () => {
		// Achado do QA crítico: na web o modelo emite present_decision_prompt por conta
		// (free-run), então decisionDispatched precisa ser setado AQUI também, e o card
		// de decisão duplicado num turno de usuário tem que ser suprimido.
		expect(src).toMatch(/isDecisionDup/);
		expect(src).toMatch(/decision_prompt/);
		expect(src).toMatch(/decisionDispatched/);
	});
});
