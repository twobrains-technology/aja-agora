// Nó `analyze` — primeiro nó de todo turno de usuário (fix MÉDIA-10 do
// crítico). Reusa o MESMO `analyzeAndMerge` (turn-analyzer) do runtime
// Vercel — zero lógica de extração/classificação nova. Alimenta `intent`
// (guarda de rota do nó `route`) e funde o que o analyzer extraiu
// (categoria, valor do bem, motivo etc.) de volta no `funnel`.
import { analyzeAndMerge } from "@/lib/agent/orchestrator/analyze";
import { projectToMeta } from "../emit";
import { funnelFromMeta } from "../state";
import type { AgentGraphStateType } from "../state";

export async function analyzeNode(
	state: AgentGraphStateType,
): Promise<Partial<AgentGraphStateType>> {
	if (!state.isUserTurn) return {};

	// `ConversationMetadata` de trabalho: baseMeta (persistido) + o que o
	// funnel já sabe nesta execução do grafo (mesmo merge de `projectToMeta`,
	// reusado — a "metaLike" que `analyzeAndMerge` espera e MUTA).
	const meta = projectToMeta(state);
	const { analysis } = await analyzeAndMerge(state.userText, state.funnel.currentPersona, meta);

	return {
		intent: analysis.userIntent,
		funnel: funnelFromMeta(meta),
		baseMeta: meta,
	};
}
