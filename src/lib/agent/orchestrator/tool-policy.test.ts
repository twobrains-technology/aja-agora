// Camada 1 — FIX-19: tool-policy por fase da jornada.
// Plano: docs/correcoes/done/fix-19-tool-policy-por-fase.md
//
// Família de bugs com a mesma anatomia (FIX-11, FIX-12, BUG-REVEAL-LOOP, PF-07):
// o modelo enxergava TODAS as ~15 tools em qualquer fase da jornada e a defesa
// era 100% a jusante (guard suprime o card depois da chamada). A policy inverte:
// tool fora de fase NEM ENTRA no request da Anthropic.
//
// Matriz LITERAL fase × tool — mudou a policy, muda este teste conscientemente.
// Sem DB (PersonaRow literal, padrão CINTO+SUSPENSÓRIO do builder).

import { describe, expect, it } from "vitest";
import { buildAgent } from "@/lib/agent/agents/builder";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { PersonaRow } from "@/lib/agent/system-prompt";
import { allowedTools, phaseFromMeta } from "./tool-policy";

// ============================================================================
// Metas canônicas por fase (mesmos estados dos bugs reais)
// ============================================================================

/** Fim do passo 2 (gate identify) — estado exato do FIX-12. */
const QUALIFY_META: ConversationMetadata = {
	currentPersona: "moto",
	currentCategory: "moto",
	experiencePrev: "first",
	qualifyConsented: true,
	qualifyAnswers: {
		creditMin: 35_000,
		creditMax: 40_000,
		monthlyBudget: 800,
		prazoMeses: 8,
		hasLance: "no",
		lanceEmbutido: false,
	},
};

/** Pós-reveal (passo 4) — estado do BUG-REVEAL-LOOP. */
const REVEAL_META: ConversationMetadata = {
	...QUALIFY_META,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	simulatorOfferDispatched: true,
};

/** Decisão tomada (passo 5 liberado). */
const CLOSING_META: ConversationMetadata = {
	...REVEAL_META,
	decisionDispatched: true,
	recommendedAdministradora: "CANOPUS",
};

/** Contrato fechado — estado TERMINAL do FIX-11. */
const TERMINAL_META: ConversationMetadata = {
	...CLOSING_META,
	contractClosed: true,
};

// ============================================================================
// Matriz esperada — espelho declarado da tabela em tool-policy.ts
// ============================================================================

const BASE = [
	// check_proposal_status é LEITURA pura e primitivo do FIX-14 ("pergunta de
	// status tem que funcionar sempre") — a proposta vive em bevi_proposals,
	// que pode existir sem meta.contractClosed (eval FIX-14 pegou a regressão:
	// policy sem a tool em qualify fez o agent negar proposta REAL de memória).
	"check_proposal_status",
	"present_topic_picker",
	"save_contact_name",
	"save_contact_whatsapp",
	"suggest_handoff",
];

const QUALIFY_EXPECTED = [
	...BASE,
	// descoberta completa — o reveal (passo 3+4) acontece NESTA fase
	"capture_lead",
	"compare_with_financing",
	"compute_scenarios",
	"get_group_details",
	"get_rates",
	"present_comparison_table",
	"present_financing_comparison",
	"present_group_card",
	"present_lead_form",
	"present_recommendation_card",
	"present_scenarios",
	"present_simulation_result",
	"present_value_picker",
	"recommend_groups",
	"search_groups",
	"simulate_quota",
].sort();

const REVEAL_EXPECTED = [
	...BASE,
	// what-if e detalhe são legítimos; RE-descoberta não (BUG-REVEAL-LOOP)
	"capture_lead",
	"compare_with_financing",
	"compute_scenarios",
	"get_group_details",
	"get_rates",
	"present_contemplation_dial",
	"present_decision_prompt",
	"present_financing_comparison",
	"present_lead_form",
	"present_scenarios",
	"present_simulation_result",
	"present_value_picker",
	"present_whatsapp_optin",
	"simulate_quota",
].sort();

const CLOSING_EXPECTED = [
	...REVEAL_EXPECTED.filter((t) => t !== "present_decision_prompt"),
	"present_contract_form",
].sort();

const TERMINAL_EXPECTED = [...BASE].sort();

// ============================================================================
// Fase derivada do meta
// ============================================================================

describe("FIX-19 — phaseFromMeta: fonte de verdade da fase é o meta", () => {
	it("pré-reveal (fim do qualify) = qualify", () => {
		expect(phaseFromMeta(QUALIFY_META)).toBe("qualify");
	});

	it("conversa nova (meta vazio) = qualify", () => {
		expect(phaseFromMeta({})).toBe("qualify");
	});

	it("revealCompleted = reveal", () => {
		expect(phaseFromMeta(REVEAL_META)).toBe("reveal");
	});

	it("decisionDispatched = closing", () => {
		expect(phaseFromMeta(CLOSING_META)).toBe("closing");
	});

	it("contractClosed = terminal (precedência máxima)", () => {
		expect(phaseFromMeta(TERMINAL_META)).toBe("terminal");
		// terminal vence mesmo se flags anteriores estiverem ligadas
		expect(phaseFromMeta({ contractClosed: true })).toBe("terminal");
	});
});

// ============================================================================
// Matriz fase × tool — lista EXATA por fase
// ============================================================================

describe("FIX-19 — allowedTools: matriz fase × tool", () => {
	it("qualify: lista exata — SEM contract_form (FIX-12), SEM dial, SEM optin (BUG-OPTIN-ENGOLE-GATES), SEM decision_prompt", () => {
		expect([...allowedTools(QUALIFY_META)].sort()).toEqual(QUALIFY_EXPECTED);
	});

	it("check_proposal_status presente em TODAS as fases (FIX-14: status nunca de memória)", () => {
		for (const meta of [QUALIFY_META, REVEAL_META, CLOSING_META, TERMINAL_META]) {
			expect(allowedTools(meta)).toContain("check_proposal_status");
		}
	});

	it("reveal: lista exata — SEM re-descoberta (search/recommend/cards do reveal), SEM contract_form", () => {
		expect([...allowedTools(REVEAL_META)].sort()).toEqual(REVEAL_EXPECTED);
	});

	it("closing: lista exata — contract_form e check_proposal_status ENTRAM, decision_prompt SAI (dup)", () => {
		expect([...allowedTools(CLOSING_META)].sort()).toEqual(CLOSING_EXPECTED);
	});

	it("terminal: lista exata — BASE + check_proposal_status, NADA de descoberta (FIX-11)", () => {
		expect([...allowedTools(TERMINAL_META)].sort()).toEqual(TERMINAL_EXPECTED);
	});

	it("optin já mostrado: present_whatsapp_optin SAI do toolset (PF-07 a montante)", () => {
		const allowed = allowedTools({ ...REVEAL_META, whatsappOptinShown: true });
		expect(allowed).not.toContain("present_whatsapp_optin");
	});

	it("contract_form: AUSENTE em qualify e reveal, presente SÓ em closing", () => {
		expect(allowedTools(QUALIFY_META)).not.toContain("present_contract_form");
		expect(allowedTools(REVEAL_META)).not.toContain("present_contract_form");
		expect(allowedTools(CLOSING_META)).toContain("present_contract_form");
		expect(allowedTools(TERMINAL_META)).not.toContain("present_contract_form");
	});

	it("descoberta (search/recommend): AUSENTE em toda fase pós-reveal", () => {
		for (const meta of [REVEAL_META, CLOSING_META, TERMINAL_META]) {
			const allowed = allowedTools(meta);
			expect(allowed).not.toContain("search_groups");
			expect(allowed).not.toContain("recommend_groups");
			expect(allowed).not.toContain("present_recommendation_card");
			expect(allowed).not.toContain("present_comparison_table");
			expect(allowed).not.toContain("present_group_card");
		}
	});
});

// ============================================================================
// Wiring — builder aplica a policy ao montar o ToolLoopAgent
// ============================================================================

function makePersonaRow(over: Partial<PersonaRow> = {}): PersonaRow {
	return {
		id: "moto",
		displayName: "Bruno",
		role: "specialist",
		category: "moto",
		expertise: null,
		voiceTone: "consultivo",
		examples: [],
		temperature: 0.7,
		activeCampaigns: [],
		handoffTriggers: [],
		forbiddenTopics: [],
		// admin ativou a descoberta + cards (mesmo shape do seed das specialists)
		activeTools: [
			"search_groups",
			"simulate_quota",
			"get_rates",
			"get_group_details",
			"recommend_groups",
			"present_group_card",
			"present_comparison_table",
			"present_simulation_result",
			"present_recommendation_card",
		],
		isActive: true,
		version: 1,
		createdAt: new Date("2026-06-11T00:00:00Z"),
		updatedAt: new Date("2026-06-11T00:00:00Z"),
		...over,
	};
}

function exposedTools(agent: unknown): string[] {
	// biome-ignore lint/suspicious/noExplicitAny: introspecção das tools do agent
	return Object.keys(((agent as any).tools ?? {}) as Record<string, unknown>).sort();
}

describe("FIX-19 — builder filtra o toolset pela policy da fase", () => {
	it("qualify: contract_form/dial/optin/decision NEM ESTÃO no toolset (não apenas suprimidos)", () => {
		const agent = buildAgent(makePersonaRow(), "neutro", { meta: QUALIFY_META });
		const tools = exposedTools(agent);
		expect(tools).not.toContain("present_contract_form");
		expect(tools).not.toContain("present_contemplation_dial");
		expect(tools).not.toContain("present_whatsapp_optin");
		expect(tools).not.toContain("present_decision_prompt");
		// e a descoberta do passo 3 continua disponível + primitivos de leitura
		expect(tools).toContain("search_groups");
		expect(tools).toContain("present_value_picker");
		expect(tools).toContain("save_contact_name");
		expect(tools).toContain("check_proposal_status"); // FIX-14: status sempre
	});

	it("toolset do agent == interseção exata (activeTools ∪ primitivos) ∩ policy da fase", () => {
		const row = makePersonaRow();
		const agent = buildAgent(row, "neutro", { meta: QUALIFY_META });
		// universo que o builder montaria sem policy: activeTools + primitivos
		const legacyAgent = buildAgent(row, "neutro", {});
		const universe = exposedTools(legacyAgent);
		const allowed = new Set(allowedTools(QUALIFY_META));
		expect(exposedTools(agent)).toEqual(universe.filter((t) => allowed.has(t)).sort());
	});

	it("reveal: dial/decision/optin entram, re-descoberta e contract_form ficam fora", () => {
		const agent = buildAgent(makePersonaRow(), "neutro", { meta: REVEAL_META });
		const tools = exposedTools(agent);
		expect(tools).toContain("present_contemplation_dial");
		expect(tools).toContain("present_decision_prompt");
		expect(tools).toContain("present_whatsapp_optin");
		expect(tools).toContain("simulate_quota"); // what-if legítimo
		expect(tools).not.toContain("search_groups");
		expect(tools).not.toContain("recommend_groups");
		expect(tools).not.toContain("present_recommendation_card");
		expect(tools).not.toContain("present_contract_form");
	});

	it("closing: contract_form + check_proposal_status entram, decision_prompt sai", () => {
		const agent = buildAgent(makePersonaRow(), "neutro", { meta: CLOSING_META });
		const tools = exposedTools(agent);
		expect(tools).toContain("present_contract_form");
		expect(tools).toContain("check_proposal_status");
		expect(tools).not.toContain("present_decision_prompt");
	});

	it("terminal (FIX-11): toolset mínimo — status sim, re-descoberta NUNCA", () => {
		const agent = buildAgent(makePersonaRow(), "neutro", { meta: TERMINAL_META });
		const tools = exposedTools(agent);
		expect(tools).toContain("check_proposal_status");
		expect(tools).not.toContain("search_groups");
		expect(tools).not.toContain("recommend_groups");
		expect(tools).not.toContain("present_recommendation_card");
		expect(tools).not.toContain("present_simulation_result");
		expect(tools).not.toContain("present_contract_form");
		expect(tools).not.toContain("present_contemplation_dial");
	});

	it("compat: SEM meta (preview/admin/testes legados) o builder não filtra — superfície completa", () => {
		const agent = buildAgent(makePersonaRow(), "neutro", {});
		const tools = exposedTools(agent);
		expect(tools).toContain("present_contract_form");
		expect(tools).toContain("present_contemplation_dial");
		expect(tools).toContain("check_proposal_status");
	});

	it("concierge segue sem tools em qualquer fase", () => {
		const agent = buildAgent(makePersonaRow({ role: "concierge", category: null }), "neutro", {
			meta: QUALIFY_META,
		});
		expect(exposedTools(agent)).toEqual([]);
	});
});
