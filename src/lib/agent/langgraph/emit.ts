// Projeção do estado do grafo → `ConversationMetadata` persistido + mapeamento
// pros 14 `TurnEvent` que os dois channel adapters consomem (FIX-357, fix
// MÉDIA-7 do crítico). Contrato de interface — a implementação viva do
// walking skeleton (quando/como cada evento é emitido) é o FIX-358.

import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { AgentGraphStateType, FunnelState } from "./state";

/**
 * Projeta `FunnelState` (autoridade do fluxo, dentro do grafo) de volta pros
 * campos de `ConversationMetadata` que a superfície COMPARTILHADA lê — não é
 * "diff cego idêntico" (o grafo não entende os ~80 campos do meta legado),
 * é o CONJUNTO EXPLÍCITO abaixo, escolhido por quem consome cada um:
 *
 * - `currentPersona`/`currentCategory` — roteamento de persona/toolset
 *   (tool-policy.ts `allowedTools`, builder.ts).
 * - `qualifyAnswers.{creditMin,creditMax,desiredItem,motivation}` —
 *   `gatePartData`/`gateQuestion` (web/adapter.ts) leem `creditMax` pro
 *   slider e pro texto da pergunta; `desiredItem`/`motivation` alimentam o
 *   prompt (system-context.ts).
 * - `identityCollected` — guarda de rota (`nextGate`, I1: nunca discovery
 *   sem identidade) + `tool-policy.ts` (search_groups só libera com isto).
 * - `searchDispatched`/`revealCompleted` — idempotência do nó `discovery`
 *   (nunca re-busca a Bevi no mesmo turno/faixa) + guarda de rota pós-reveal.
 * - `recommendedAdministradora`/`recommendedOffer` — âncora do hero (I3: a
 *   UI nunca mostra número que não veio de um grupo REAL) + contexto do
 *   card de decisão.
 * - `decisionDispatched` — idempotência do card `decision_prompt`.
 *
 * IMPORTANTE: faz merge por cima de `baseMeta` (o `ConversationMetadata`
 * COMPLETO carregado do banco no início do turno) — nunca zera os ~80
 * campos que este runtime ainda não entende (lance, contract, whatsapp
 * opt-in, memória Letta, etc.). `persistMeta` SUBSTITUI a coluna inteira
 * (não faz merge no banco), então quem chama `projectToMeta` é responsável
 * por já ter o `baseMeta` certo em `state.baseMeta`.
 */
export function projectToMeta(state: AgentGraphStateType): ConversationMetadata {
	const { baseMeta, funnel } = state;
	return {
		...baseMeta,
		currentPersona: funnel.currentPersona,
		currentCategory: funnel.currentCategory,
		desireAsked: funnel.desireAsked,
		desireAnswered: funnel.desireAnswered,
		identityCollected: funnel.identityCollected,
		searchDispatched: funnel.searchDispatched,
		discoveredCreditTarget: funnel.discoveredCreditTarget,
		revealCompleted: funnel.revealCompleted,
		recommendedAdministradora: funnel.recommendedAdministradora,
		recommendedOffer: funnel.recommendedOffer,
		motivationAsked: funnel.motivationAsked,
		motivationMirrored: funnel.motivationMirrored,
		experiencePrev: funnel.experiencePrev,
		doubtsAddressed: funnel.doubtsAddressed,
		topicPickerDispatched: funnel.topicPickerDispatched,
		recoConsentDispatched: funnel.recoConsentDispatched,
		recoConsentAnswered: funnel.recoConsentAnswered,
		recoConsentDeclined: funnel.recoConsentDeclined,
		pendingRecommendationCard: funnel.pendingRecommendationCard,
		pendingSimulationResult: funnel.pendingSimulationResult,
		simulatorOfferDispatched: funnel.simulatorOfferDispatched,
		simulatorOfferAnswered: funnel.simulatorOfferAnswered,
		decisionDispatched: funnel.decisionDispatched,
		qualifyAnswers: {
			...baseMeta.qualifyAnswers,
			creditMin: funnel.qualifyAnswers.creditMin,
			creditMax: funnel.qualifyAnswers.creditMax,
			desiredItem: funnel.qualifyAnswers.desiredItem,
			motivation: funnel.qualifyAnswers.motivation,
			prazoMeses: funnel.qualifyAnswers.prazoMeses,
			hasLance: funnel.qualifyAnswers.hasLance,
			lanceValue: funnel.qualifyAnswers.lanceValue,
			lanceEmbutido: funnel.qualifyAnswers.lanceEmbutido,
			lanceEmbutidoPercent: funnel.qualifyAnswers.lanceEmbutidoPercent,
		},
	};
}

/**
 * ArtifactType (chat/types.ts, 19 tipos) — cobertura server-side no runtime
 * LangGraph (FIX-360/361). Emitido = builder determinístico (`server-cards.ts`
 * / `recommendation-payload.ts`), nunca dependente de tool-call do LLM.
 *
 *  ✓ comparison_table      — discoveryNode (reveal)
 *  ✓ recommendation_card   — discoveryNode; PENDENTE até `reco-consent`
 *                            responder (hero em dois tempos, hold/release
 *                            em `funnel.pendingRecommendationCard`)
 *  ✓ topic_picker          — emitCardNode (novato, emissão única)
 *  ✓ embedded_bid          — emitCardNode (gate lance-embutido)
 *  ✓ scarcity              — emitCardNode (antes do decision_prompt)
 *  ✓ two_paths             — emitCardNode (ramo hasLance="so_parcela")
 *  ✓ decision_prompt       — emitCardNode (gate decision)
 *  — simulation_result      TODO(rodada-2): tool_call what-if (simulate_quota)
 *                            não vira card ainda — precisa da ponte
 *                            tool-result→artifact (coerção própria)
 *  — group_card/scenarios/financing_comparison/value_picker/lead_form/
 *    quick_reply             TODO(rodada-2): cards do "what-if" avulso,
 *                            fora do funil determinístico desta rodada
 *  — whatsapp_optin/contract_form/real_offer/signature_handoff/
 *    document_upload/contemplation_dial
 *                            TODO(rodada-2): cerimônia de fechamento — fora
 *                            de escopo (fork de pesquisa: sem lógica visível
 *                            além do disparo do contract_form em index.ts)
 *
 * `whatsapp/formatter.ts` (`artifactToWhatsApp`) já mapeia os 19 tipos —
 * canal WhatsApp consome os 7 emitidos acima SEM mudança (contrato
 * `TurnEvent` idêntico ao runtime Vercel).
 *
 * Os 14 `TurnEvent` que `pipeOrchestratorToWriter` (web/adapter.ts:278-426) e
 * `consumeEvents`/`artifactToWhatsApp` (whatsapp/adapter.ts) consomem —
 * checklist de cobertura desta fundação (FIX-358 decide QUANDO cada um
 * dispara; aqui só o contrato). `✓ walking skeleton` = emitido nesta
 * rodada; `— TODO(rodada-1)` = nó/gate ainda não coberto pelo slice.
 *
 *  ✓ text-delta            — nó `converse`, token a token (model.stream)
 *  ✓ tool-call             — nó `converse`, what-if via bindTools/ToolNode
 *  ✓ artifact              — nó `discovery`/`emitCard` (todos os 7 tipos
 *                             acima, cada emissão passando por
 *                             `evaluateArtifactGuards`, FIX-361)
 *  ✓ gate                  — nó `route`, quando o gate ativo pede input
 *  — welcome-categories     TODO(rodada-1): boas-vindas/menu inicial fora do
 *                            slice (name→desire→credit→identify→discovery→
 *                            reveal→decision) — N/A no meio da jornada.
 *  ✓ transition            — TODO(rodada-1) estrutural: o slice não cobre
 *                            troca de persona/categoria; tipo já mapeado.
 *  — handoff                TODO(rodada-1): suggest_handoff não coberto pelo
 *                            toolset what-if desta fundação.
 *  ✓ lead-stage            — nó `persist`, proxy determinístico (engajado
 *                            após desire, qualificado após identify) —
 *                            TODO(rodada-1): paridade fina com LEAD_STAGE_BY_TOOL.
 *  ✓ meta-update           — nó `persist`, carrega `projectToMeta(state)`.
 *                            Telemetria (turn-trace) nos dois adapters HOJE
 *                            — nenhum deles lê o payload do evento pra
 *                            renderizar; quem é load-bearing é a ESCRITA no
 *                            banco (persistMeta) acontecer ANTES de emitir
 *                            "gate" (que faz `reloadMeta` fresco). O runtime
 *                            LangGraph preserva essa ordem: persist roda
 *                            antes de qualquer "gate"/"artifact" ser drenado.
 *  ✓ lead-collection-prompt — TODO(rodada-1) estrutural: fora do slice desta
 *                            fundação (fluxo name→phone→email por texto).
 *  ✓ suppression           — tipo mapeado; nesta fundação o grafo não tem
 *                            guard de artifact ativo pra suprimir (TODO
 *                            rodada-1: `evaluateArtifactGuards` no `emitCard`).
 *  ✓ usage                 — TODO(rodada-1): telemetria de cache_control,
 *                            depende de `providerMetadata` do `converse`.
 *  ✓ finish                — sempre o último evento do turno.
 *  ✓ text-boundary         — nó `converse`/`emitCard`, fecha o balão antes
 *                            de um artifact determinístico (mesmo invariante
 *                            do FIX-268/272 no runtime Vercel).
 *
 * `run-turn.ts` (FIX-358) é quem de fato produz esses eventos — este módulo
 * só documenta o contrato pra a Rodada 1 codar contra algo estável.
 */
export const TURN_EVENT_TYPES: ReadonlyArray<TurnEvent["type"]> = [
	"text-delta",
	"tool-call",
	"artifact",
	"gate",
	"transition",
	"welcome-categories",
	"handoff",
	"lead-stage",
	"meta-update",
	"lead-collection-prompt",
	"suppression",
	"usage",
	"finish",
	"text-boundary",
] as const;

/** Helper de conveniência pro nó `persist`/`run-turn.ts`: monta o evento
 * `meta-update` a partir do estado atual do grafo. */
export function metaUpdateEvent(
	state: AgentGraphStateType,
): Extract<TurnEvent, { type: "meta-update" }> {
	return { type: "meta-update", meta: projectToMeta(state) };
}

export type { FunnelState };
