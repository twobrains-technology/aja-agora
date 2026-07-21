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
// TODO(rodada-1): `evaluateArtifactGuards` (artifact-guard.ts) — esta
// fundação ainda não aplica os guards de idempotência/ordem cruzada com
// outros artifacts do turno (o slice cobre só o primeiro reveal).
//
// Este nó NÃO empurra os eventos via `config.writer` (ao contrário de
// `converse`, que faz isso com text-delta/tool-call) — `artifact` depende de
// leitura fresca do banco no lado do adapter (mesma nota de ordem em
// `persist.ts`/`emit.ts`), então só é seguro entregá-lo ao chamador DEPOIS
// que `persist` gravar. `run-turn.ts` drena `state.events` do estado final
// do grafo pra estes tipos, não do stream ao vivo.
import type { Category } from "@/lib/agent/personas";
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
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType } from "../state";
import { buildLangGraphTools } from "../tool-adapter";

export async function discoveryNode(
	state: AgentGraphStateType,
): Promise<Partial<AgentGraphStateType>> {
	const { funnel } = state;
	const category = funnel.currentCategory;
	// Defensivo — `routeAfterConverse` já garante isto (I1), mas o nó não deve
	// assumir que SEMPRE roda só a partir dali (futuras arestas da Rodada 1).
	if (!category) return { events: [] };

	const tools = buildLangGraphTools({
		conversationId: state.conversationId,
		channel: state.channel,
	});
	const result = await tools.recommend_groups.invoke({
		category,
		creditMin: funnel.qualifyAnswers.creditMin,
		creditMax: funnel.qualifyAnswers.creditMax,
		budget: 0,
		desiredTermMonths: 0,
	});

	const index: RevealGroupIndex = new Map();
	indexRevealGroups(index, "recommend_groups", result);

	if (usableRevealGroupCount(index) === 0) {
		// Descoberta falhou/degradou (Bevi fora, faixa sem grupo real) — NÃO
		// marca searchDispatched, mesma regra do runtime Vercel
		// ([discovery-degraded] em index.ts): retry liberado num turno seguinte,
		// nunca trava em "já buscado" sobre um resultado vazio.
		return { events: [] };
	}

	const logos = await loadAdministradoraLogoMap();
	const events: TurnEvent[] = [];

	events.push({
		type: "artifact",
		artifactType: "comparison_table",
		payload: buildComparisonTableFromRevealGroups(index, logos),
		toolCallId: crypto.randomUUID(),
	});

	const best = pickBestRankedGroup(index);
	let recommendedAdministradora = funnel.recommendedAdministradora;
	let recommendedOffer = funnel.recommendedOffer;
	if (best) {
		const scoringInput = scoringInputFromMeta(projectToMeta(state));
		events.push({
			type: "artifact",
			artifactType: "recommendation_card",
			payload: buildRecommendationCardFromRevealGroup(
				best,
				logos,
				funnel.qualifyAnswers.creditMax,
				scoringInput,
			),
			toolCallId: crypto.randomUUID(),
		});
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
			recommendedAdministradora,
			recommendedOffer,
		},
		events,
	};
}
