// Nó `discovery` — descoberta DETERMINÍSTICA (crítico ALTA-2: resolve a
// "tool sumida" estruturalmente). Dispara por TRANSIÇÃO (identidade + valor
// prontos, `readyForDiscovery` em route.ts — I1), nunca porque o modelo
// "lembrou" de chamar uma tool. Chama `recommend_groups` via o MESMO adapter
// AI-SDK→LangChain do toolset what-if (tool-adapter.ts) — zero lógica de
// busca nova, reusa `buildConsorcioTools`/Bevi adapter tal-e-qual.
//
// Coerção reusa `recommendation-payload.ts` (indexRevealGroups,
// buildComparisonTableFromRevealGroups, pickBestRankedGroup,
// buildRecommendationCardFromRevealGroup) — MESMAS funções que blindam o
// runtime Vercel contra números fabricados pela LLM (I3, "36/mês").
//
// FIX-361 — toda emissão passa por `evaluateArtifactGuards`
// (`guarded-artifact.ts`) antes do `events.push` — 2ª linha de defesa
// (idempotência/pós-fechamento/single-option/hero-awaits-reco-consent).
// Quando o guard suprime `recommendation_card` por `hero-awaits-reco-
// consent` (reveal em DOIS TEMPOS: lista sai na hora, hero espera o
// usuário consentir), o payload COAGIDO fica pendente em
// `funnel.pendingRecommendationCard` — `emitCardNode` libera assim que
// `recoConsentAnswered` vira true, nunca recalculado.
//
// Este nó NÃO empurra os eventos via `config.writer` (ao contrário de
// `converse`, que faz isso com text-delta/tool-call) — `artifact` depende de
// leitura fresca do banco no lado do adapter (mesma nota de ordem em
// `persist.ts`/`emit.ts`), então só é seguro entregá-lo ao chamador DEPOIS
// que `persist` gravar. `run-turn.ts` drena `state.events` do estado final
// do grafo pra estes tipos, não do stream ao vivo.

import {
	buildComparisonTableFromRevealGroups,
	buildRecommendationCardFromRevealGroup,
	indexRevealGroups,
	pickBestRankedGroup,
	type RevealGroupIndex,
	usableRevealGroupCount,
} from "@/lib/agent/orchestrator/recommendation-payload";
import { scoringInputFromMeta } from "@/lib/agent/orchestrator/runner";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { Category } from "@/lib/agent/personas";
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType, FunnelState } from "../state";
import { buildLangGraphTools } from "../tool-adapter";
import { artifactAllowed, type GuardContext } from "./guarded-artifact";

export async function discoveryNode(
	state: AgentGraphStateType,
): Promise<Partial<AgentGraphStateType>> {
	const { funnel, conversationId, channel, isUserTurn } = state;
	const category = funnel.currentCategory;
	// Defensivo — `routeAfterConverse` já garante isto (I1), mas o nó não deve
	// assumir que SEMPRE roda só a partir dali (futuras arestas da Rodada 1).
	if (!category) return { events: [] };

	const tools = buildLangGraphTools({ conversationId, channel });
	const result = await tools.recommend_groups.invoke({
		category,
		creditMin: funnel.qualifyAnswers.creditMin,
		creditMax: funnel.qualifyAnswers.creditMax,
		budget: 0,
		desiredTermMonths: 0,
	});

	const index: RevealGroupIndex = new Map();
	indexRevealGroups(index, "recommend_groups", result);
	const discoveryCount = usableRevealGroupCount(index);

	if (discoveryCount === 0) {
		// Descoberta falhou/degradou (Bevi fora, faixa sem grupo real) — NÃO
		// marca searchDispatched, mesma regra do runtime Vercel
		// ([discovery-degraded] em index.ts): retry liberado num turno seguinte,
		// nunca trava em "já buscado" sobre um resultado vazio.
		return { events: [] };
	}

	const logos = await loadAdministradoraLogoMap();
	const events: TurnEvent[] = [];
	const turnArtifactTypes: string[] = [];
	const guardCtx: GuardContext = {
		meta: projectToMeta(state),
		userIntent: state.intent ?? "neutral",
		isUserTurn,
		channel,
		discoveryCount,
		conversationId,
		turnArtifactTypes,
	};

	if (artifactAllowed(guardCtx, "comparison_table")) {
		events.push({
			type: "artifact",
			artifactType: "comparison_table",
			payload: buildComparisonTableFromRevealGroups(index, logos),
			toolCallId: crypto.randomUUID(),
		});
		turnArtifactTypes.push("comparison_table");
	}

	const best = pickBestRankedGroup(index);
	let recommendedAdministradora = funnel.recommendedAdministradora;
	let recommendedOffer = funnel.recommendedOffer;
	let pendingRecommendationCard: FunnelState["pendingRecommendationCard"] =
		funnel.pendingRecommendationCard;
	if (best) {
		const scoringInput = scoringInputFromMeta(projectToMeta(state));
		const payload = buildRecommendationCardFromRevealGroup(
			best,
			logos,
			funnel.qualifyAnswers.creditMax,
			scoringInput,
		);
		if (artifactAllowed(guardCtx, "recommendation_card")) {
			events.push({
				type: "artifact",
				artifactType: "recommendation_card",
				payload,
				toolCallId: crypto.randomUUID(),
			});
			turnArtifactTypes.push("recommendation_card");
			pendingRecommendationCard = undefined;
		} else {
			// FIX-361 — "hero-awaits-reco-consent": reveal em DOIS TEMPOS. O
			// payload JÁ está coagido contra o grupo REAL (I3) — guardado pra
			// `emitCardNode` emitir sem recalcular assim que o consentimento
			// chegar (nunca dependente de nova tool-call/busca).
			pendingRecommendationCard = payload;
		}
		recommendedAdministradora = best.administradora;
		recommendedOffer = {
			administradora: best.administradora,
			category: category as Category,
			creditValue: best.creditValue ?? 0,
			termMonths: best.termMonths ?? 0,
			monthlyPayment: best.monthlyPayment ?? 0,
			groupId: best.id,
		};
	}

	return {
		funnel: {
			...funnel,
			searchDispatched: true,
			revealCompleted: true,
			// FIX-360 — snapshot do valor-alvo REALMENTE buscado (equivalente a
			// `discoveredCreditTarget`, tool-policy.ts) — permite ao `route`
			// distinguir troca de faixa (re-descoberta legítima) de afirmativo
			// curto na mesma faixa (idempotência original, I1).
			discoveredCreditTarget: funnel.qualifyAnswers.creditMax,
			recommendedAdministradora,
			recommendedOffer,
			pendingRecommendationCard,
		},
		events,
	};
}
