import type { ConversationMetadata } from "@/lib/agent/personas";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

/**
 * FIX-19 (bloco G) — tool-policy por fase da jornada.
 *
 * Causa raiz comum de FIX-11/FIX-12/BUG-REVEAL-LOOP/PF-07: o modelo enxergava
 * o catálogo INTEIRO de tools em qualquer fase — cada tool visível fora de
 * fase é um convite à chamada indevida — e a defesa era 100% a jusante
 * (guards do runner suprimem o card DEPOIS da chamada, sem proteger o texto
 * que o modelo gera "achando" que o card apareceu).
 *
 * Esta tabela inverte: tool fora de fase NEM ENTRA no request da Anthropic.
 * O builder filtra o toolset por `allowedTools(meta)` ao montar o agent; os
 * guards do runner viram segunda linha de defesa (defense-in-depth) — disparo
 * de guard pós-policy = bug DESTA tabela e ganha log [tool-policy-violation].
 *
 * Respaldo externo (pesquisa 2026-06-11): Vercel AI SDK "Phased Tool
 * Progression" (prepareStep/activeTools) + Anthropic context engineering
 * ("tool sets minimal and focused, avoid ambiguous decision points").
 *
 * Tool NOVA no registry: precisa ser adicionada aqui à(s) fase(s) certa(s) —
 * fail-closed por desenho (tool fora da tabela não entra em fase nenhuma).
 */
export type ToolPhase = "qualify" | "reveal" | "closing" | "terminal";

/**
 * Fase derivada do meta — mesma fonte de verdade do `nextGate()`
 * (qualify-state.ts). Precedência: terminal > closing > reveal > qualify.
 */
export function phaseFromMeta(meta: ConversationMetadata): ToolPhase {
	if (meta.contractClosed === true) return "terminal";
	if (meta.decisionDispatched === true) return "closing";
	if (meta.revealCompleted === true) return "reveal";
	return "qualify";
}

/** Primitivos de conversa — válidos em TODA fase.
 *
 * check_proposal_status entrou aqui pelo eval EVAL-FIX-14-STATUS-VIA-TOOL
 * (nightly 2026-06-11): a 1ª versão da tabela só a expunha em closing/
 * terminal, mas a fonte de verdade da proposta é `bevi_proposals` — que pode
 * existir SEM meta.contractClosed — e o agent negou uma proposta real DE
 * MEMÓRIA (violação direta do FIX-14: status sempre via tool). É leitura
 * pura sem efeito colateral; não há fase em que escondê-la seja seguro. */
const BASE = [
	"suggest_handoff",
	"save_contact_name",
	"save_contact_whatsapp",
	"present_topic_picker",
	"check_proposal_status",
];

/** Descoberta completa + cards do reveal — o passo 3+4 acontece na fase
 * qualify (o turno do reveal roda com revealCompleted ainda false). */
const DISCOVERY_AND_REVEAL_CARDS = [
	"search_groups",
	"recommend_groups",
	"present_group_card",
	"present_comparison_table",
	"present_recommendation_card",
];

/** What-if e detalhe — legítimos também pós-reveal (re-simular com novo valor,
 * responder "qual a taxa?", comparar com financiamento). */
const WHAT_IF_AND_DETAIL = [
	"simulate_quota",
	"get_rates",
	"get_group_details",
	"compare_with_financing",
	"compute_scenarios",
	"present_simulation_result",
	"present_scenarios",
	"present_financing_comparison",
];

/** Seletor de valor + captura de lead — válidos até o fechamento (o
 * present_value_picker reabre o ajuste de valor pós-reveal; capture_lead
 * persiste o lead). FIX-34: present_lead_form NÃO entra aqui — pós-reveal o
 * sinal de avanço é decision → contract_form (jornada self-service), nunca
 * captura de lead pra consultor humano. A tool fica restrita a `qualify`. */
const LEAD_CAPTURE = ["present_value_picker", "capture_lead"];

/**
 * Tabela declarativa fase → tools permitidas. O builder INTERSETA o resultado
 * com (activeTools do admin ∪ primitivos) — a policy nunca ADICIONA tool que o
 * builder não exporia; só corta o que está fora de fase.
 */
export function allowedTools(meta: ConversationMetadata, _channel?: "web" | "whatsapp"): string[] {
	// channel reservado na assinatura (manifesto FIX-19) — hoje a tabela é a
	// mesma nos dois canais; diferenciação por canal entra aqui quando houver
	// regra anotada (ex.: optin dentro do próprio WhatsApp).
	const phase = phaseFromMeta(meta);

	switch (phase) {
		case "qualify":
			// FIX-12: present_contract_form FORA — identidade pré-reveal é assunto
			// do gate identify do SERVIDOR, nunca do form de contratação.
			// BUG-OPTIN-ENGOLE-GATES: present_whatsapp_optin FORA pré-reveal.
			// FIX-34: present_lead_form SÓ aqui (captura de lead pré-reveal) — some
			// das fases pós-reveal, onde o avanço é decision → contract_form.
			return [
				...BASE,
				...DISCOVERY_AND_REVEAL_CARDS,
				...WHAT_IF_AND_DETAIL,
				...LEAD_CAPTURE,
				"present_lead_form",
			];
		case "reveal":
			// BUG-REVEAL-LOOP: re-descoberta (search/recommend/cards do reveal)
			// FORA — o que sobra de reveal é what-if/detalhe. Dial (passo 4) e
			// decision_prompt entram; contract_form SÓ depois da decisão.
			return [
				...BASE,
				...WHAT_IF_AND_DETAIL,
				...LEAD_CAPTURE,
				"present_contemplation_dial",
				"present_decision_prompt",
				...(shouldEmitWhatsappOptin(meta) ? ["present_whatsapp_optin"] : []),
			];
		case "closing":
			// Decisão tomada: passo 5 libera (contract_form). present_decision_prompt
			// PERMANECE: o orquestrador persiste decisionDispatched=true ANTES de
			// rodar o turno da directive (index.ts) — o turno que EMITE o card já
			// roda nesta fase. Tirar a tool daqui fez o card do passo 4 sumir da
			// jornada (eval nightly 2026-06-11). Dup em turno de USUÁRIO é papel
			// do guard isDecisionDup (2ª linha), que distingue user-turn de
			// directive — granularidade que a fase não tem.
			return [
				...BASE,
				...WHAT_IF_AND_DETAIL,
				...LEAD_CAPTURE,
				"present_contemplation_dial",
				"present_decision_prompt",
				"present_contract_form",
				...(shouldEmitWhatsappOptin(meta) ? ["present_whatsapp_optin"] : []),
			];
		case "terminal":
			// FIX-11: estado TERMINAL — re-descoberta/simulação/decisão NUNCA.
			// Status respondido pela tool real (FIX-14, via BASE), resto é conversa.
			return [...BASE];
	}
}
