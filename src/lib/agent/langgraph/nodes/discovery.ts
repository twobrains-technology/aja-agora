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
	type RevealGroupLike,
	usableRevealGroupCount,
} from "@/lib/agent/orchestrator/recommendation-payload";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { Category } from "@/lib/agent/personas";
import { alvoDeBusca } from "@/lib/agent/qualify-answers";
import { scoringInputFromMeta } from "@/lib/agent/scoring-input";
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import {
	registrarBuscaDespachada,
	registrarOfertaExibida,
} from "@/lib/observability/langfuse/busca-scores";
import { registrarFalhasDeTool } from "@/lib/observability/langfuse/funil-scores";
import { projectToMeta } from "../emit";

/** FIX-374 — snapshot do grupo REAL ranqueado (`best`) que sobrevive no meta
 * pra emissão server-side pós-reveal (`recommendedOffer`, personas.ts). Extraída
 * como função pura (mesmo padrão do FIX-368/372) pra ser testável sem montar o
 * nó inteiro (Bevi real + logo map). `availableSlots` existe em `RevealGroupLike`
 * desde o FIX-367, mas este write-site nunca o copiava — `buildScarcityCard`
 * (server-cards.ts) lê exatamente este campo, então o card de escassez pós-
 * reveal nunca tinha o que mostrar mesmo com a Bevi trazendo o dado real. */
export function buildRecommendedOfferSnapshot(
	best: RevealGroupLike,
	category: Category,
): NonNullable<FunnelState["recommendedOffer"]> {
	return {
		administradora: best.administradora,
		category,
		creditValue: best.creditValue ?? 0,
		termMonths: best.termMonths ?? 0,
		monthlyPayment: best.monthlyPayment ?? 0,
		groupId: best.id,
		avgBidValue: best.avgBidValue,
		availableSlots: best.availableSlots,
	};
}

/** Prazo-alvo (meses) de quem quer a MENOR PARCELA. Não é um número novo: é o
 * mesmo horizonte da opção "Sem pressa, quero menor parcela"
 * (`TIMEFRAME_OPTIONS`, qualify-config.ts). Serve só pra inclinar o ranking pro
 * prazo mais longo que a administradora de fato tiver — nunca inventa prazo. */
const PRAZO_ALVO_MENOR_PARCELA = 120;

import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { marcarPrimeiraCarta } from "@/lib/observability/langfuse/marcar-primeira-carta";
import type { AgentGraphStateType, FunnelState } from "../state";
import { buildLangGraphTools } from "../tool-adapter";
import { artifactAllowed, type GuardContext } from "./guarded-artifact";

/** Fronteira EXTERNA do nó: a busca real na Bevi. Injetável pelo mesmo motivo
 * do modelo e do analyzer — sem isso um cenário determinístico não consegue
 * exercitar "a Bevi voltou vazia", que é justamente o caminho que produzia
 * silêncio e retry infinito (FIX-380). */
export type BuscaGrupos = (args: {
	category: Category;
	creditMin?: number;
	creditMax?: number;
	/** FIX-382 — alvo alternativo: a parcela que cabe no bolso. */
	parcelaAlvo?: number;
	budget: number;
	desiredTermMonths: number;
}) => Promise<unknown>;

export function createDiscoveryNode(buscaInjetada?: BuscaGrupos) {
	return (state: AgentGraphStateType, config?: LangGraphRunnableConfig) =>
		discoveryNode(state, config, buscaInjetada);
}

export async function discoveryNode(
	state: AgentGraphStateType,
	config?: LangGraphRunnableConfig,
	buscaInjetada?: BuscaGrupos,
): Promise<Partial<AgentGraphStateType>> {
	const { funnel, conversationId, channel, isUserTurn } = state;
	const category = funnel.currentCategory;
	// Defensivo — `routeAfterConverse` já garante isto (I1), mas o nó não deve
	// assumir que SEMPRE roda só a partir dali (futuras arestas da Rodada 1).
	if (!category) return { events: [] };

	// Avisa AO VIVO que a busca começou, ANTES de chamar a Bevi. A consulta leva
	// de alguns segundos a meia dúzia deles, e até aqui o cliente mandava CPF e
	// celular e a tela ficava MUDA o tempo todo — sem sinal nenhum de que algo
	// estava acontecendo. A UI já sabe desenhar o progresso a partir deste evento
	// (`streaming-dots.tsx`: "Comparando grupos" → "Rankeando as melhores opções"
	// → "Quase lá"), e o adapter do WhatsApp manda o equivalente de lá. É status
	// do SISTEMA, determinístico — nunca uma fala do modelo prometendo buscar.
	config?.writer?.({
		type: "tool-call",
		toolName: "recommend_groups",
		input: {
			category,
			creditMin: funnel.qualifyAnswers.creditMin,
			creditMax: funnel.qualifyAnswers.creditMax,
		},
		toolCallId: crypto.randomUUID(),
	});

	const buscar: BuscaGrupos =
		buscaInjetada ??
		((args) => buildLangGraphTools({ conversationId, channel }).recommend_groups.invoke(args));
	// "Sem pressa, quero a menor parcela" é um pedido de PRAZO MAIOR — parcela
	// menor não existe sem prazo mais longo. O ranking recebia `desiredTermMonths:
	// 0` (sem preferência) sempre, então o cliente pedia parcela leve e o agente
	// fechava no prazo mais curto disponível, prometendo um ajuste que nunca fazia
	// (visto ao vivo, 2026-07-21). Quem tem pressa continua neutro: aí o que pesa
	// é a contemplação, não o prazo.
	// Quem declarou uma PARCELA quer, por definição, a menor parcela — e o
	// ranking não sabia disso: `querMenorParcela` só olhava objetivo e prazo, que
	// num cliente sem prazo declarado caem no default assumido. Resultado visto
	// em 14/08: o agente ofereceu espontaneamente a opção de R$ 1.101 em 24 meses
	// a quem tinha acabado de pedir parcela reduzida. O alvo por parcela é o
	// sinal mais direto que existe dessa preferência.
	const querMenorParcela =
		alvoDeBusca(funnel.qualifyAnswers) === "parcela" ||
		funnel.qualifyAnswers.objetivo === "investimento" ||
		(funnel.qualifyAnswers.prazoMeses ?? 0) >= 120;
	// O alvo é UM só, e quem o discrimina é o estado (`alvoDeBusca`). Antes daqui
	// a escolha era implícita — "tem creditMax? então é por valor" — e a busca
	// por parcela ficava inalcançável no momento em que era pedida, porque a
	// derivação parcela→crédito acabava de definir um `creditMax` (abaixo do
	// piso da Bevi, garantidamente vazio).
	const buscaPorParcela =
		alvoDeBusca(funnel.qualifyAnswers) === "parcela" &&
		(funnel.qualifyAnswers.parcelaAlvo ?? 0) > 0;
	const alvoDoSinal = {
		alvo: buscaPorParcela ? ("parcela" as const) : ("valor" as const),
		categoria: category,
		creditMax: funnel.qualifyAnswers.creditMax,
		creditMin: funnel.qualifyAnswers.creditMin,
		parcelaAlvo: funnel.qualifyAnswers.parcelaAlvo,
		creditoMinimoInformado: funnel.qualifyAnswers.creditoMinimoInformado,
	};

	let result: unknown;
	try {
		result = await buscar({
			category,
			...(buscaPorParcela
				? { parcelaAlvo: funnel.qualifyAnswers.parcelaAlvo }
				: {
						creditMin: funnel.qualifyAnswers.creditMin,
						creditMax: funnel.qualifyAnswers.creditMax,
					}),
			budget: 0,
			desiredTermMonths: querMenorParcela ? PRAZO_ALVO_MENOR_PARCELA : 0,
		});
	} catch (err) {
		// Erro da Bevi AQUI não pontuava em lugar nenhum: `tool_falhou` só cobre
		// tool chamada pelo MODELO no `converse`, e a falha do nó morria num JSON
		// de log. Foram quatro `BeviApiError` na conversa de 13/08 com o painel
		// inteiro verde. É a mesma família de falha — entra na mesma família de
		// score, senão o Monitor de tool continua cego para metade do sistema.
		registrarFalhasDeTool([
			{
				tool: "recommend_groups",
				tipo: "erro",
				mensagem: err instanceof Error ? err.message : String(err),
			},
		]);
		registrarBuscaDespachada({
			...alvoDoSinal,
			vazia: true,
			streak: (funnel.discoveryEmptyStreak ?? 0) + 1,
		});
		throw err;
	}

	const index: RevealGroupIndex = new Map();
	indexRevealGroups(index, "recommend_groups", result);
	const discoveryCount = usableRevealGroupCount(index);

	if (discoveryCount === 0) {
		// FIX-380 — busca vazia deixa de ser SILÊNCIO.
		//
		// Antes: `return { events: [] }` e nada mais. A intenção era boa (não
		// travar em "já buscado" sobre resultado vazio, então `searchDispatched`
		// segue false e o retry fica liberado). Só que sem sinal nenhum, o modelo
		// nunca sabia que a busca falhou: ele prometia "vou pesquisar agora",
		// o turno seguinte tentava de novo, voltava vazio de novo — loop
		// perpétuo, e a venda morria em silêncio (visto ao vivo, 2026-07-26).
		//
		// O retry continua permitido (a Bevi cai de verdade), mas agora fica
		// REGISTRADO: `discoveryEmptyStreak` conta as tentativas em vazio e é o
		// que permite ao funil parar de prometer e pedir outro valor. O código
		// não fabrica número nenhum — só deixa de esconder a falha.
		const streak = (funnel.discoveryEmptyStreak ?? 0) + 1;
		registrarBuscaDespachada({ ...alvoDoSinal, vazia: true, streak });
		console.log(
			`[discovery-empty] busca sem resultado (streak=${streak}, alvo=${buscaPorParcela ? `parcela ${funnel.qualifyAnswers.parcelaAlvo}` : `creditMax ${funnel.qualifyAnswers.creditMax}`}, conv=${conversationId})`,
		);
		return {
			events: [],
			funnel: {
				...funnel,
				discoveryEmptyStreak: streak,
				// O FREIO. Sem registrar o alvo TENTADO, a condição que re-dispara a
				// descoberta ("o alvo atual diverge do último buscado") nunca
				// cicatrizava, e o funil refazia a MESMA pergunta impossível à Bevi a
				// cada turno — quatro vezes seguidas em `fa0533a0-…`. Repetir uma
				// busca idêntica não muda a resposta; o que destrava é o alvo mudar.
				discoveredCreditTarget: buscaPorParcela
					? funnel.discoveredCreditTarget
					: funnel.qualifyAnswers.creditMax,
				discoveredParcelaTarget: buscaPorParcela
					? funnel.qualifyAnswers.parcelaAlvo
					: funnel.discoveredParcelaTarget,
				// A ÂNCORA PODRE — marcada, não apagada. Era ela que fazia o contexto
				// afirmar "as ofertas já foram buscadas e os cards estão na tela:
				// BANCO DO BRASIL, R$ 201.393" depois de a busca voltar em branco.
				// Apagar resolvia isso e criava outro buraco: some com a âncora de um
				// card que CONTINUA visível, e o cliente é convidado a escolher uma
				// oferta que o estado não conhece mais. Marcada, o agente não pode
				// AFIRMAR que encontrou, e a cota na tela segue escolhível.
				recommendedOfferStale: true,
			},
		};
	}

	registrarBuscaDespachada(alvoDoSinal);

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

	// O teto que ele DECLAROU manda no hero — ver `pickBestRankedGroup`.
	const best = pickBestRankedGroup(index, funnel.qualifyAnswers.parcelaAlvo);
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
		recommendedOffer = buildRecommendedOfferSnapshot(best, category as Category);
		// A oferta que vai à tela cabe no que ele disse que pode pagar? Aritmética
		// pura, e o único sinal que teria pego o turno das 23:32:35 de 13/08: o
		// cliente pediu R$ 200 por mês e o card mostrou R$ 6.270,48. A busca tinha
		// rodado, o card tinha saído, o agente tinha falado — e os três juízes
		// aprovaram o turno.
		registrarOfertaExibida({
			parcelaAlvo: funnel.qualifyAnswers.parcelaAlvo,
			monthlyPayment: recommendedOffer.monthlyPayment,
		});
	}

	// A PRIMEIRA CARTA DA CONVERSA — marco de sessão, uma vez só.
	//
	// `carta_na_tela` (funil-scores) mede turno e não responde "esta conversa
	// chegou a ver preço, e em quantos turnos?". Essa é a pergunta que
	// diagnosticou o funil no banco e é a que mede se a vitrine funcionou.
	// `revealCompleted` ainda é false neste ponto (ele vira true no retorno
	// abaixo), então esta condição é verdadeira exatamente uma vez por conversa —
	// re-descoberta por troca de faixa não reemite.
	if (!funnel.revealCompleted) {
		// `!isUserTurn` é o critério, e ele vale nos dois canais.
		//
		// Turno server-authored (clique num card, retomada) nunca acrescenta fala
		// nova: o label do clique já foi gravado ANTES — na web por `route.ts`, no
		// WhatsApp por `recordUserClick`. Turno de usuário, ao contrário, traz uma
		// fala que só o `persist` grava, DEPOIS deste nó.
		//
		// A versão anterior olhava o canal (`whatsapp && !isUserTurn`) e por isso
		// sobrecontava +1 em todo clique da web — inclusive o do slider de valor,
		// que com a vitrine é justamente o gatilho mais comum da primeira carta.
		void marcarPrimeiraCarta(conversationId, !state.isUserTurn);
	}

	// Os ARTIFACTS não saem aqui — quem entrega é o `converse` (entre os dois
	// balões do reveal) ou o `persist`, depois de `persistMeta`.

	return {
		// Liga os DOIS TEMPOS da apresentação no `converse` (ver `state.ts`).
		apresentaOfertaNesteTurno: true,
		funnel: {
			...funnel,
			searchDispatched: true,
			revealCompleted: true,
			// FIX-380 — achou: zera a contagem de vazio, senão uma falha antiga
			// ficaria pesando sobre uma busca que deu certo.
			discoveryEmptyStreak: 0,
			// Busca que ACHOU limpa a marca: a âncora volta a ser fresca.
			recommendedOfferStale: false,
			// FIX-360 — snapshot do valor-alvo REALMENTE buscado (equivalente a
			// `discoveredCreditTarget`, tool-policy.ts) — permite ao `route`
			// distinguir troca de faixa (re-descoberta legítima) de afirmativo
			// curto na mesma faixa (idempotência original, I1).
			discoveredCreditTarget: funnel.qualifyAnswers.creditMax,
			// O mesmo snapshot para o alvo por parcela — é ele que impede a
			// re-busca infinita na MESMA parcela e permite a re-busca quando ela
			// muda.
			discoveredParcelaTarget: buscaPorParcela
				? funnel.qualifyAnswers.parcelaAlvo
				: funnel.discoveredParcelaTarget,
			recommendedAdministradora,
			recommendedOffer,
			// FIX-415 — busca NOVA invalida a cota do contrato.
			//
			// A 12ª revisão independente achou que `contractOffer` não tinha ciclo de
			// vida: ninguém o limpava, nunca. Medido na rota real — cliente escolhe a
			// cota A, conversa, o funil re-busca e mostra outras ofertas, ele clica
			// numa nova de R$ 300 mil, e o contrato saía na de R$ 120 mil de duas
			// buscas atrás, que já nem estava na tela.
			//
			// Ancorar por ação estruturada só vale enquanto a ação continua fazendo
			// sentido. Uma busca nova substitui o conjunto inteiro de ofertas
			// exibidas: a escolha anterior deixa de existir como opção, e mantê-la é
			// a mesma classe de defeito que este campo foi criado pra impedir — só
			// que pelo eixo do TEMPO em vez do eixo do TEXTO.
			//
			// O custo é o cliente ter que clicar de novo depois de uma re-busca. É o
			// mesmo custo que o Kairo já aceitou ("o preço da segurança"), e a
			// alternativa é fechar contrato numa cota que sumiu da tela.
			contractOffer: undefined,
			pendingRecommendationCard,
		},
		events,
	};
}
