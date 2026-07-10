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
import { allowedTools, phaseFromMeta, revealValueTargetChanged } from "./tool-policy";

// ============================================================================
// Metas canônicas por fase (mesmos estados dos bugs reais)
// ============================================================================

/** Fim do passo 2, DEPOIS do gate identify — a identidade já foi coletada (D1 /
 * FIX-53: identify precede o credit, então um estado com creditMax preenchido
 * pressupõe identityCollected=true). É o estado em que a descoberta é liberada. */
const QUALIFY_META: ConversationMetadata = {
	currentPersona: "moto",
	currentCategory: "moto",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	qualifyAnswers: {
		creditMin: 35_000,
		creditMax: 40_000,
		monthlyBudget: 800,
		prazoMeses: 8,
		hasLance: "no",
		lanceEmbutido: false,
	},
};

/** FIX-114 (PROD 2026-06-30): passo 2 ANTES do gate identify — identidade NÃO
 * coletada. A descoberta (search_groups) NÃO pode entrar no toolset aqui: sem
 * CPF+celular a Bevi lança IdentityNotCollectedError e o agente cospe "dificuldade
 * técnica". Estado real do log de prod (conv bc5fa852). */
const QUALIFY_NO_IDENTITY_META: ConversationMetadata = {
	currentPersona: "moto",
	currentCategory: "moto",
	experiencePrev: "first",
	qualifyConsented: true,
	// identityCollected ausente — gate identify ainda pendente (precede o credit).
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
	"simulate_contemplation",
	"simulate_quota",
].sort();

const REVEAL_EXPECTED = [
	...BASE,
	// what-if e detalhe são legítimos; RE-descoberta não (BUG-REVEAL-LOOP).
	// FIX-34: present_lead_form FORA — pós-reveal o avanço é decision → contract_form
	// (jornada self-service), nunca captura de lead pra consultor humano.
	"capture_lead",
	"compare_with_financing",
	"compute_scenarios",
	"get_group_details",
	"get_rates",
	"present_contemplation_dial",
	// FIX-246 (rodada 3, Fable r2): embedded_bid/two_paths/scarcity SAÍRAM do
	// toolset — emissão agora é server-side determinística (server-cards.ts),
	// nunca mais tool-call do LLM. Ver describe FIX-246 abaixo.
	// FIX-253 (rodada 4, Fable FINAL): present_decision_prompt SAIU também —
	// mesma receita (buildDecisionPromptCard). Ver describe FIX-253 abaixo.
	"present_financing_comparison",
	"present_scenarios",
	"present_simulation_result",
	"present_value_picker",
	"present_whatsapp_optin",
	"simulate_contemplation",
	"simulate_quota",
].sort();

// FIX-253 (rodada 4, veredito Fable FINAL §3, causa-raiz do 0-scarcity no
// Fluxo A): present_decision_prompt NÃO volta em closing — o card do passo 4
// agora é emissão SERVER-SIDE determinística (buildDecisionPromptCard), o
// directive que fecha closing só narra (sem tool-call). Ver describe FIX-253
// abaixo.
const CLOSING_EXPECTED = [...REVEAL_EXPECTED, "present_contract_form"].sort();

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

	it("closing: lista exata — contract_form ENTRA; decision_prompt AUSENTE (emissão server-side, FIX-253)", () => {
		expect([...allowedTools(CLOSING_META)].sort()).toEqual(CLOSING_EXPECTED);
	});

	it("FIX-253 — present_decision_prompt AUSENTE mesmo no turno da directive do decision (decisionDispatched=true): o card é server-side, o directive só narra", () => {
		// orchestrator/index.ts persiste decisionDispatched=true ANTES do runTurn
		// da directive — mas o directive NÃO chama tool nenhuma (buildDecisionPromptCard
		// emite o card direto, sem depender do LLM). A tool fica FORA em toda fase.
		const metaDoTurnoDaDirective = { ...REVEAL_META, decisionDispatched: true };
		expect(allowedTools(metaDoTurnoDaDirective)).not.toContain("present_decision_prompt");
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

	it("FIX-34 — present_lead_form: SÓ em qualify; AUSENTE em reveal/closing/terminal", () => {
		// Pós-reveal o sinal de avanço é decision → contract_form (self-service).
		// present_lead_form só faz sentido na captura de lead pré-reveal (qualify).
		expect(allowedTools(QUALIFY_META)).toContain("present_lead_form");
		expect(allowedTools(REVEAL_META)).not.toContain("present_lead_form");
		expect(allowedTools(CLOSING_META)).not.toContain("present_lead_form");
		expect(allowedTools(TERMINAL_META)).not.toContain("present_lead_form");
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

	// FIX-246 (rodada 3, Fable r2 — causa-raiz do veredito 4/10): os 3 cards
	// dependiam do LLM obedecer um directive pra chamar present_X — 0 emissões
	// em 7 oportunidades ao vivo. Tirar a tool do toolset TORNA IMPOSSÍVEL o
	// LLM chamá-la (Lei 2 — allowlist positiva), não só "desencorajado por
	// prompt". A emissão vira 100% responsabilidade do handler (server-cards.ts).
	it("FIX-246 — present_embedded_bid/present_two_paths/present_scarcity NUNCA entram no toolset do LLM, em NENHUMA fase", () => {
		for (const meta of [QUALIFY_META, REVEAL_META, CLOSING_META, TERMINAL_META]) {
			const allowed = allowedTools(meta);
			expect(allowed).not.toContain("present_embedded_bid");
			expect(allowed).not.toContain("present_two_paths");
			expect(allowed).not.toContain("present_scarcity");
		}
	});

	// FIX-253 (rodada 4, veredito Fable FINAL §3 — causa-raiz do 0-scarcity no
	// Fluxo A): present_decision_prompt era a última tool "de card" que sobrava
	// no toolset — o LLM chamava DIRETO num turno de usuário comum, bypassando
	// o ramo do orchestrator que dispara o scarcity server-side ANTES do
	// decision_prompt. Mesma receita do FIX-246: tira a tool, mata a
	// possibilidade (Lei 2 — allowlist positiva).
	it("FIX-253 — present_decision_prompt NUNCA entra no toolset do LLM, em NENHUMA fase (nem com decisionDispatched=true)", () => {
		for (const meta of [
			QUALIFY_META,
			REVEAL_META,
			CLOSING_META,
			TERMINAL_META,
			{ ...REVEAL_META, decisionDispatched: true },
		]) {
			expect(allowedTools(meta)).not.toContain("present_decision_prompt");
		}
	});
});

// ============================================================================
// FIX-114 (PROD 2026-06-30, log /ecs/tb/prod conv bc5fa852) — search_groups
// disparou ANTES da identidade → IdentityNotCollectedError → o agente cuspiu
// "dificuldade técnica pontual pra acessar os grupos". Root cause de ORQUESTRAÇÃO:
// a descoberta estava no toolset da fase qualify SEM checar identityCollected, e o
// agente free-rodou search_groups antes do CPF. Fix: gatear a descoberta na
// identidade (a Bevi exige CPF+celular pra simular — D1).
// ============================================================================
describe("FIX-114 — descoberta só entra no toolset com identidade coletada", () => {
	it("qualify SEM identidade: search_groups e os cards de reveal FICAM FORA", () => {
		const allowed = allowedTools(QUALIFY_NO_IDENTITY_META);
		expect(allowed).not.toContain("search_groups");
		expect(allowed).not.toContain("recommend_groups");
		expect(allowed).not.toContain("present_group_card");
		expect(allowed).not.toContain("present_comparison_table");
		expect(allowed).not.toContain("present_recommendation_card");
	});

	it("qualify COM identidade: a descoberta é liberada (o gate identify já passou)", () => {
		const allowed = allowedTools(QUALIFY_META);
		expect(allowed).toContain("search_groups");
		expect(allowed).toContain("recommend_groups");
	});

	it("primitivos de conversa seguem disponíveis mesmo sem identidade (não trava o funil)", () => {
		const allowed = allowedTools(QUALIFY_NO_IDENTITY_META);
		// o funil continua: nome, experiência, consent, o próprio valor por texto.
		expect(allowed).toContain("save_contact_name");
		expect(allowed).toContain("present_value_picker");
		expect(allowed).toContain("suggest_handoff");
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

	it("FIX-114 — qualify SEM identidade: o agente NÃO recebe search_groups (não free-roda a busca)", () => {
		// A prova de que o bug de prod não volta: com o toolset filtrado a montante,
		// o modelo nem enxerga search_groups antes do CPF — impossível chamar cru.
		const agent = buildAgent(makePersonaRow(), "neutro", { meta: QUALIFY_NO_IDENTITY_META });
		const tools = exposedTools(agent);
		expect(tools).not.toContain("search_groups");
		expect(tools).not.toContain("recommend_groups");
		// os primitivos do funil seguem (nome/valor) — a coleta não trava.
		expect(tools).toContain("save_contact_name");
		expect(tools).toContain("present_value_picker");
	});

	it("reveal: dial/optin entram, decision (FIX-253, server-side) e re-descoberta/contract_form ficam fora", () => {
		const agent = buildAgent(makePersonaRow(), "neutro", { meta: REVEAL_META });
		const tools = exposedTools(agent);
		expect(tools).toContain("present_contemplation_dial");
		expect(tools).not.toContain("present_decision_prompt");
		expect(tools).toContain("present_whatsapp_optin");
		expect(tools).toContain("simulate_quota"); // what-if legítimo
		expect(tools).not.toContain("search_groups");
		expect(tools).not.toContain("recommend_groups");
		expect(tools).not.toContain("present_recommendation_card");
		expect(tools).not.toContain("present_contract_form");
		expect(tools).not.toContain("present_lead_form"); // FIX-34: avanço é decision→contract
	});

	it("closing: contract_form + check_proposal_status entram; decision_prompt AUSENTE (FIX-253, emissão server-side)", () => {
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

// ============================================================================
// FIX-68 — re-descoberta por TROCA DE FAIXA pós-reveal (sem reabrir o loop)
// ----------------------------------------------------------------------------
// Bug real (conversa a8b0a80d, "Maria", 2026-06-22): pós-reveal de 256k, o
// usuário pediu OUTRA faixa ("130.000") e o agent — sem search_groups na fase
// reveal (removido pelo BUG-REVEAL-LOOP) — fabricou o id `auto-130k-60m` e
// travou em loop de "instabilidade". O search precisa VOLTAR na fase reveal,
// porém SÓ quando o valor-alvo mudou (troca de faixa), nunca num afirmativo
// curto sobre a MESMA faixa (esse é o BUG-REVEAL-LOOP que não pode regredir).
//
// O sinal de "troca" vive no meta: qualifyAnswers.creditMax (valor-alvo atual,
// atualizado pelo analyzer pós-reveal) vs discoveredCreditTarget (snapshot da
// última descoberta, gravado pelo runner).
// ============================================================================

const REVEAL_DISCOVERY_TOOLS = [
	"search_groups",
	"recommend_groups",
	"present_recommendation_card",
	"present_comparison_table",
	"present_group_card",
];

/** Pós-reveal de 256k, usuário pediu 130k — valor-alvo DIVERGE da descoberta. */
const REVEAL_TROCA_FAIXA: ConversationMetadata = {
	...REVEAL_META,
	qualifyAnswers: { ...REVEAL_META.qualifyAnswers, creditMax: 130_000 },
	discoveredCreditTarget: 256_000,
};

/** Pós-reveal de 256k, afirmativo curto SEM troca — valor-alvo == descoberta. */
const REVEAL_MESMA_FAIXA: ConversationMetadata = {
	...REVEAL_META,
	qualifyAnswers: { ...REVEAL_META.qualifyAnswers, creditMax: 256_000 },
	discoveredCreditTarget: 256_000,
};

/** Descoberta antiga (antes do snapshot do FIX-68): baseline ausente. */
const REVEAL_SEM_BASELINE: ConversationMetadata = {
	...REVEAL_META,
	qualifyAnswers: { ...REVEAL_META.qualifyAnswers, creditMax: 130_000 },
	// discoveredCreditTarget undefined de propósito.
};

describe("FIX-68 — revealValueTargetChanged: distingue troca de faixa de re-reveal loop", () => {
	it("valor-alvo DIFERENTE do descoberto = troca de faixa (true)", () => {
		expect(revealValueTargetChanged(REVEAL_TROCA_FAIXA)).toBe(true);
	});

	it("MESMO valor-alvo = re-reveal/afirmativo, NÃO é troca (false — anti BUG-REVEAL-LOOP)", () => {
		expect(revealValueTargetChanged(REVEAL_MESMA_FAIXA)).toBe(false);
	});

	it("sem baseline (descoberta pré-fix) = fail-safe NÃO reabre (false)", () => {
		expect(revealValueTargetChanged(REVEAL_SEM_BASELINE)).toBe(false);
	});

	it("sem valor-alvo (creditMax ausente) = false", () => {
		expect(
			revealValueTargetChanged({ revealCompleted: true, discoveredCreditTarget: 256_000 }),
		).toBe(false);
	});
});

describe("FIX-68 — allowedTools(reveal): search VOLTA na troca de faixa, FICA fora no loop", () => {
	it("a fase continua sendo reveal (troca de valor NÃO muda a fase)", () => {
		expect(phaseFromMeta(REVEAL_TROCA_FAIXA)).toBe("reveal");
	});

	it("TROCA de faixa: search/recommend/cards de descoberta VOLTAM ao toolset", () => {
		const allowed = allowedTools(REVEAL_TROCA_FAIXA);
		for (const tool of REVEAL_DISCOVERY_TOOLS) {
			expect(allowed).toContain(tool);
		}
		// e o what-if continua disponível (não é regressão da fase reveal); decisão
		// (FIX-253) é server-side, nunca entra no toolset.
		expect(allowed).toContain("simulate_quota");
		expect(allowed).not.toContain("present_decision_prompt");
	});

	it("MESMA faixa (afirmativo): descoberta CONTINUA fora (BUG-REVEAL-LOOP não regride)", () => {
		const allowed = allowedTools(REVEAL_MESMA_FAIXA);
		for (const tool of REVEAL_DISCOVERY_TOOLS) {
			expect(allowed).not.toContain(tool);
		}
	});

	it("sem baseline: descoberta fora (fail-safe — só reabre com sinal positivo de troca)", () => {
		const allowed = allowedTools(REVEAL_SEM_BASELINE);
		expect(allowed).not.toContain("search_groups");
	});

	it("troca de faixa NÃO antecipa o passo 5 — contract_form/lead_form continuam fora", () => {
		const allowed = allowedTools(REVEAL_TROCA_FAIXA);
		expect(allowed).not.toContain("present_contract_form");
		expect(allowed).not.toContain("present_lead_form");
	});
});
