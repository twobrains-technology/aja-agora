// Nó `analyze` — primeiro nó de todo turno de usuário (fix MÉDIA-10 do
// crítico). Reusa o MESMO `analyzeAndMerge` (turn-analyzer) do runtime
// Vercel — zero lógica de extração/classificação nova. Alimenta `intent`
// (guarda de rota do nó `route`) e funde o que o analyzer extraiu
// (categoria, valor do bem, motivo etc.) de volta no `funnel`.
import { analyzeAndMerge } from "@/lib/agent/orchestrator/analyze";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { decideRouting } from "@/lib/agent/orchestrator/routing";
import { pickPersonaForCategory } from "@/lib/agent/personas-repo";
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
	// Âncora do classificador (paridade com o runtime Vercel): a que pergunta
	// esta mensagem responde. Sem ela, "não" respondido ao lance vira resposta do
	// prazo e "uns 70 mil" dito de passagem vira o crédito — os erros que
	// geraram os guards de `analyze.ts`. No grafo a última fala do assistente já
	// está no estado, então sai de graça.
	const ultimaFalaDoAgente = [...state.messages]
		.reverse()
		.find((m) => m.getType() === "ai")
		?.text?.trim();
	const { analysis } = await analyzeAndMerge(
		state.userText,
		state.funnel.currentPersona,
		meta,
		ultimaFalaDoAgente || null,
	);

	// ROTEAMENTO concierge → specialist. Sem isto o grafo ficava preso no
	// concierge para sempre: `currentCategory` nunca era setada, e como
	// `readyForDiscovery` exige categoria, a descoberta NUNCA disparava — o
	// agente conversava bem, prometia "já te trago as opções" e nenhum card
	// aparecia. Reusa `decideRouting` (mesma decisão do runtime Vercel).
	const eventos: TurnEvent[] = [];
	const rota = decideRouting(state.userText, meta, analysis);
	if (rota.kind === "transition") {
		const personaAnterior = state.funnel.currentPersona;
		meta.currentCategory = rota.toCategory;
		const persona = await pickPersonaForCategory(rota.toCategory).catch(() => null);
		// `currentPersona` guarda o ID da persona (linha do banco), não a categoria.
		if (persona) meta.currentPersona = persona.id;
		// HANDOFF NOMEADO — o divisor "Rafael entrou na conversa · Especialista em
		// automóveis". É o que transforma o bot em gente com nome e especialidade,
		// e é o que dá autoridade ao pitch que vem depois; o grafo trocava a
		// persona em silêncio e o cliente nunca via a passagem de bastão.
		if (persona) {
			eventos.push({
				type: "transition",
				fromPersona: personaAnterior ?? null,
				toPersona: persona.id,
				toPersonaName: persona.displayName,
				toCategory: rota.toCategory,
				bridgeText: "",
			});
		}
		console.log(
			`[langgraph] roteou pra categoria=${rota.toCategory} persona=${meta.currentPersona}${rota.usedFallback ? " (fallback por keyword)" : ""}`,
		);
	}

	return {
		intent: analysis.userIntent,
		funnel: funnelFromMeta(meta),
		baseMeta: meta,
		events: eventos,
	};
}
