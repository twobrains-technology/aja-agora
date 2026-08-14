// Nó `analyze` — primeiro nó de todo turno de usuário (fix MÉDIA-10 do
// crítico). Reusa o MESMO `analyzeAndMerge` (turn-analyzer) do runtime
// Vercel — zero lógica de extração/classificação nova. Alimenta `intent`
// (guarda de rota do nó `route`) e funde o que o analyzer extraiu
// (categoria, valor do bem, motivo etc.) de volta no `funnel`.
import { analyzeAndMerge } from "@/lib/agent/orchestrator/analyze";
import { decideRouting } from "@/lib/agent/orchestrator/routing";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { pickPersonaForCategory } from "@/lib/agent/personas-repo";
import { aplicarTrocaDeCategoria, reverterFaixaDeCredito } from "@/lib/agent/qualify-answers";
import { valorAncoradoNoTexto } from "@/lib/agent/valor-declarado";
import { registrarValorRevertido } from "@/lib/observability/langfuse/funil-scores";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType } from "../state";
import { funnelFromMeta } from "../state";

/** Assinatura da fronteira LLM do analyzer — o que `createAnalyzeNode` aceita
 * injetado. Igual à de `analyzeAndMerge` (que MUTA `meta`, e é assim que a
 * extração chega no funil). Cenários determinísticos (testing/scenario.ts)
 * passam um roteiro no lugar da chamada ao Haiku. */
export type AnalyzeFn = typeof analyzeAndMerge;

export function createAnalyzeNode(analyze: AnalyzeFn = analyzeAndMerge) {
	return async function analyzeNode(
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
		const { analysis } = await analyze(
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

		// ── O NÚMERO DO CLIENTE É O NÚMERO DO CLIENTE (FIX-378) ──
		// Ao vivo: ele escreveu "100 reais", insistiu ("foi 100 reais mesmo") e o
		// estado guardou R$ 1.000,00 — dez vezes o que falou, um número que
		// ninguém disse. Esse valor virou `creditMax`, ligou `readyForDiscovery`,
		// disparou a busca abaixo do piso e produziu o loop do FIX-377.
		//
		// A checagem é ANCORAGEM, não julgamento de intenção: o valor gravado tem
		// que sair dos números que estão na frase. O agente CONTINUA livre pra
		// dizer em português que R$ 100 é pouco pra um carro — o que ele não pode
		// é registrar outro número no lugar. Sem menção numérica na fala (slider,
		// card, turno anterior), nada é bloqueado.
		// FIX-431 — o gate corrente diz se a resposta numérica NUA vale como
		// milhar. Quando o servidor acabou de perguntar o valor do bem (gate
		// `credit`), "238" é R$ 238 mil: foi a resposta que matou a venda da
		// sessão `a68b1945`, vetada por não bater com 238000 ao pé da letra.
		// Fora desse gate o comportamento do FIX-378 fica idêntico.
		const perguntouValorDoBem = state.gate === "credit";
		// FIX-431 — a fala do cliente não cabe só no turno atual.
		//
		// `creditMentionedAtDesire` guarda o valor que ELE disse (só não estava
		// promovido ainda); é o que o escape do gate preso (FIX-307,
		// `qualify-state.ts`) promove depois de 3 turnos travados. Sem esta
		// exceção os dois guards se anulavam em ciclo: o escape promovia, e aqui
		// o valor era revertido porque a frase daquele turno ("Ok 3 anos") não
		// continha 238000 — só o número 3. O funil ficava preso em `credit` para
		// sempre, `identify` nunca chegava, a busca nunca era autorizada. Foi
		// assim que a venda de R$ 238 mil morreu (produção, sessão `a68b1945`).
		//
		// Não é afrouxamento: promover o que o cliente DISSE é o oposto de
		// fabricar valor, que é o único caso que o FIX-378 existe para impedir.
		const valorQueOClienteJaDisse = depois?.creditMentionedAtDesire;
		const ancoradoNoQueEleJaDisse =
			valorQueOClienteJaDisse !== undefined && depois?.creditMax === valorQueOClienteJaDisse;

		// FIX-431 — DEPOIS DO REVEAL, VALOR NÃO MUDA SOZINHO.
		//
		// O guard abaixo é permissivo quando a fala não traz número — o valor pode
		// ter vindo do slider, de um card ou de um turno anterior, e bloquear aí
		// quebraria fluxo legítimo. Isso vale ANTES do reveal.
		//
		// Depois dele, custa a venda. Cenário `golden-fecho-nao-anda-pra-tras`,
		// turno 9: o cliente escreveu "isso, quero contratar" (zero números) e o
		// analyzer devolveu `creditMax = 92902`. Faixa nova →
		// `revealValueTargetChanged` → descoberta reaberta → os cards do reveal
		// saíram de novo → o turno passou a ter card que pede ação → e o
		// `contract_form`, que o `route` JÁ havia liberado (`gate=contract
		// show=true`), não foi emitido. O cliente pediu para contratar e recebeu a
		// lista de opções de volta.
		//
		// A regra é estreita de propósito: só depois do reveal, só em turno de
		// texto sem número nenhum. Quem realmente pede outra faixa ("e se fosse
		// 130 mil?") escreve o número, e continua trocando.
		const faixaJaDescoberta = state.funnel.revealCompleted === true;
		const falaSemNumero = !/\d/.test(state.userText ?? "");
		if (
			faixaJaDescoberta &&
			falaSemNumero &&
			depois?.creditMax !== undefined &&
			depois.creditMax !== antes.creditMax
		) {
			console.log(
				`[analyze] creditMax R$ ${depois.creditMax} apareceu pós-reveal numa fala sem número; mantido R$ ${antes.creditMax ?? "vazio"}`,
			);
			// Revert é do PAR (`qualify-answers.ts`): devolver só o teto deixava o
			// piso da faixa desfeita órfão no estado — foi assim que produção
			// terminou com `creditMin: 18000` e `creditMax: 6424`.
			meta.qualifyAnswers = reverterFaixaDeCredito(meta.qualifyAnswers ?? {}, antes);
			registrarValorRevertido({ valorRecusado: depois.creditMax, veioDoEscape: false });
		}
		if (
			depois?.creditMax !== undefined &&
			depois.creditMax !== antes.creditMax &&
			!ancoradoNoQueEleJaDisse &&
			!valorAncoradoNoTexto(state.userText, depois.creditMax, {
				escalaImplicita: perguntouValorDoBem,
			})
		) {
			console.log(
				`[analyze] creditMax R$ ${depois.creditMax} nao ancorado na fala do cliente; devolvido a ${antes.creditMax ?? "vazio"}`,
			);
			// FIX-431 (P2 #14) — o flagrante fica no trace, não só no CloudWatch.
			// Reversão recorrente na MESMA conversa é o livelock voltando por
			// outra porta; sem este score, descobrir isso exigia ler log de
			// container linha a linha (foi o que custou a sessão `a68b1945`).
			registrarValorRevertido({
				valorRecusado: depois.creditMax,
				veioDoEscape: valorQueOClienteJaDisse !== undefined,
			});
			meta.qualifyAnswers = reverterFaixaDeCredito(meta.qualifyAnswers ?? {}, antes);
		}

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
			const categoriaAnterior = meta.currentCategory;
			// Trocar de bem invalida o que era DO BEM (faixa, item desejado, valor
			// mencionado no desire) e preserva o que é DA PESSOA (prazo, lance,
			// poupança). Sem isto, o R$ 1,5 milhão da casa sobreviveu à troca para
			// moto e voltou como pergunta — "Uns R$ 1.500.000 então, é isso?" — numa
			// conversa sobre uma moto de R$ 20 mil. O que o cliente disse NESTE
			// turno é reaplicado: "na verdade quero uma moto de 20 mil" troca e
			// informa o valor de uma vez só.
			if (categoriaAnterior && categoriaAnterior !== rota.toCategory) {
				// O bem antigo vira FATO no contexto: menção posterior ao valor dele é
				// ironia ou comparação, não pedido de voltar atrás. Sem isto, "ta
				// maluco 1.5m numa moto?" foi lido como intenção de compra em 2 de 7
				// conversas — uma delas propondo "voltar ao plano original, a casa de
				// R$ 1,5 milhão" no último turno, com o funil vivo na mesa.
				meta.bemAbandonado = {
					categoria: categoriaAnterior,
					...(meta.qualifyAnswers?.creditMax !== undefined
						? { valor: meta.qualifyAnswers.creditMax }
						: {}),
				};
				meta.qualifyAnswers = aplicarTrocaDeCategoria(
					meta.qualifyAnswers ?? {},
					{
						creditMax: analysis.creditMax,
						creditMin: analysis.creditMin,
						desiredItem: analysis.desiredItem,
					},
					rota.toCategory,
				);
				console.log(
					`[analyze] troca ${categoriaAnterior}→${rota.toCategory}: faixa e item do bem anterior invalidados`,
				);
			}
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
	};
}
