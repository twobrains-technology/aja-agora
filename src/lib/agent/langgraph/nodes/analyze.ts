// Nó `analyze` — primeiro nó de todo turno de usuário (fix MÉDIA-10 do
// crítico). Reusa o MESMO `analyzeAndMerge` (turn-analyzer) do runtime
// Vercel — zero lógica de extração/classificação nova. Alimenta `intent`
// (guarda de rota do nó `route`) e funde o que o analyzer extraiu
// (categoria, valor do bem, motivo etc.) de volta no `funnel`.
import { analyzeAndMerge } from "@/lib/agent/orchestrator/analyze";
import { decideRouting } from "@/lib/agent/orchestrator/routing";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { pickPersonaForCategory } from "@/lib/agent/personas-repo";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType } from "../state";
import { funnelFromMeta } from "../state";

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

	// ── O DINHEIRO QUE ELE TEM NÃO É O PREÇO DO QUE ELE QUER ──
	// "Tenho uns 80 mil guardado, podia dar de lance" saía do analyzer como
	// lanceValue=80.000 E creditMax=80.000 ao mesmo tempo: o alvo da busca, que
	// era R$ 250 mil (o caminhão), virava R$ 80 mil. A partir daí tudo desandou em
	// silêncio — a busca voltou com cartas de R$ 80 mil, o lance embutido esticou
	// o alvo pra R$ 114 mil (80.000 ÷ 0,7), e o contrato fechou numa carta de
	// R$ 160.746 pra um caminhão de R$ 250 mil. O cliente viu: "pera, isso tá
	// errado, cadê a carta de 251 mil que a gente combinou?"
	//
	// O invariante é verificável e não depende de interpretar intenção: o dinheiro
	// que o cliente TEM e o preço do bem que ele QUER não podem ser o mesmo número.
	// Ninguém dá de lance próprio o valor inteiro da carta — quando os dois campos
	// batem, é erro de extração, não fato.
	//
	// A colisão acontece nas DUAS direções, e as duas já apareceram ao vivo:
	//   - lance vira o alvo da busca: caminhão de R$ 250 mil virou carta de
	//     R$ 160.746 e o cliente reclamou ("cadê a carta de 251 mil?");
	//   - o alvo vira o lance: o cliente disse "80 mil" três vezes, o agente falou
	//     80 mil em todas as contas, e o estado guardou R$ 250 mil. Esse é o mais
	//     perigoso — `dinheiroDeclaradoPeloCliente` devolveria a carta inteira como
	//     dinheiro dele e a simulação diria que a contemplação é quase imediata.
	//     Mentir pra mais é o erro que VENDE.
	//
	// Nos dois casos o remédio é o mesmo: nenhum campo aceita o valor do outro;
	// cada um mantém o que já estava firmado. Errar pra menos devolve uma
	// pergunta ao cliente, que é barato.
	const antes = state.funnel.qualifyAnswers;
	const depois = meta.qualifyAnswers;
	if (
		depois?.lanceValue !== undefined &&
		depois.creditMax !== undefined &&
		depois.creditMax === depois.lanceValue
	) {
		const alvoMudou = antes.creditMax !== undefined && antes.creditMax !== depois.creditMax;
		const lanceMudou = antes.lanceValue !== depois.lanceValue;
		if (alvoMudou) {
			console.log(
				`[analyze] lance R$ ${depois.lanceValue} tentou virar o alvo da busca; mantido R$ ${antes.creditMax}`,
			);
			meta.qualifyAnswers = { ...meta.qualifyAnswers, creditMax: antes.creditMax };
			if (antes.creditMin !== undefined) meta.qualifyAnswers.creditMin = antes.creditMin;
		} else if (lanceMudou) {
			// O alvo continua certo; quem foi contaminado é o lance. Volta pro valor
			// anterior (ou some) — o gate `lance-value` pergunta de novo se precisar,
			// e perguntar é infinitamente melhor que simular com dinheiro que ele
			// não tem.
			console.log(
				`[analyze] alvo R$ ${depois.creditMax} tentou virar o lance; lance devolvido a ${antes.lanceValue ?? "vazio"}`,
			);
			meta.qualifyAnswers = { ...meta.qualifyAnswers };
			if (antes.lanceValue === undefined) delete meta.qualifyAnswers.lanceValue;
			else meta.qualifyAnswers.lanceValue = antes.lanceValue;
		}
	}

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
