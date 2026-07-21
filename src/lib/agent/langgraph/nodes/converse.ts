// Nó `converse` — o modelo FALA. NUNCA responde por texto pré-fabricado
// (lei-mãe "não engessar"): todo texto emitido aqui vem de `model.stream()`,
// sempre. What-if (simulate_quota, get_group_details, get_rates,
// compare_with_financing, check_proposal_status, suggest_handoff,
// save_contact_name, save_contact_whatsapp) continua tool-call discricionário
// do modelo via `ToolNode` — `search_groups`/`recommend_groups` NUNCA entram
// neste toolset (viram nó determinístico, `discovery.ts`).
//
// Sanitização reusa `EphemeralTextFilter` (sanitizer.ts) — MESMA máquina de
// compliance (I4/I5/D7) do runtime Vercel, alimentada token a token.

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { listShownOffersForConversation } from "@/lib/agent/orchestrator/choose-offer";
import { EphemeralTextFilter } from "@/lib/agent/orchestrator/sanitizer";
import { GATE_INTENT } from "@/lib/agent/orchestrator/system-context";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import { querAntecipar, shouldAskMotive } from "@/lib/agent/qualify-state";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import type { ArtifactType } from "@/lib/chat/types";
import { projectToMeta } from "../emit";
import { cacheableSystemBlock } from "../provider";
import type { AgentGraphStateType, FunnelState } from "../state";
import { buildLangGraphTools } from "../tool-adapter";
import { artifactAllowed, type GuardContext } from "./guarded-artifact";

/** Toolset WHAT-IF (goal doc — fix ALTA-4): o modelo escolhe livremente
 * chamar OU não. `search_groups`/`recommend_groups` ficam FORA de propósito
 * — são o nó `discovery`, nunca discricionárias (resolve a "tool sumida"
 * estruturalmente, crítico ALTA-2). */
const WHAT_IF_TOOL_NAMES = [
	"simulate_quota",
	"get_group_details",
	"get_rates",
	"compare_with_financing",
	// Cálculo dos cenários de contemplação. Estavam FORA da lista e o cliente que
	// pedia "quero ver os cenários sim" não recebia nada — o modelo tinha só duas
	// saídas, inventar número (proibido) ou calar. `present_scenarios` (abaixo)
	// exige o output do `compute_scenarios` no schema, então sem estas duas a
	// tool de apresentação era inalcançável na prática.
	"compute_scenarios",
	"simulate_contemplation",
	// "essa parcela não cabe pra mim" → reposiciona a busca pra uma carta que
	// caiba no bolso dele. Sem ela, a objeção de preço não tinha resposta.
	"ajustar_por_parcela",
	"check_proposal_status",
	"suggest_handoff",
	"save_contact_name",
	"save_contact_whatsapp",
	// Tools de APRESENTAÇÃO — é o que faz card aparecer na tela. Estavam de fora
	// do toolset do runtime LangGraph, então o modelo dizia "dá uma conferida nos
	// números da simulação aí no card" e NENHUM card existia. `search_groups`/
	// `recommend_groups` seguem fora (a descoberta é o nó `discovery`,
	// determinística) — estas aqui só DESENHAM o que já foi apurado.
	"present_simulation_result",
	"present_group_card",
	"present_comparison_table",
	"present_financing_comparison",
	// `present_contemplation_dial` NÃO entra: a agulha é o passo do gate
	// `simulator-offer`, que vem DEPOIS do lance embutido na cascata. Como tool
	// discricionária, o modelo a chamava assim que ouvia um valor de lance e
	// atropelava o embutido — na mesma tela caíam recomendação, agulha e card do
	// embutido, os três de uma vez. Ordem de funil é invariante: vive no código.
	"present_scenarios",
] as const;

const MAX_TOOL_LOOP_ITERATIONS = 4;

/** `SYSTEM_PROMPT` (system-prompt.ts) MENOS a seção "## Fluxo de Vendas
 * (siga esta ordem)" — o grafo é a ordem agora (elimina o drift
 * prompt×código, fix MÉDIA do crítico). Reusa a MESMA fonte de compliance
 * (tom, regras de ouro, dados financeiros, what-if, o que não fazer) sem
 * duplicar o texto. TODO(rodada-1): `buildSpecialistPrompt`/
 * `buildConciergePrompt` completos (exemplos por persona, injeção de
 * identidade da persona DB) — esta fundação usa o prompt base genérico.
 */
export function leanSystemPrompt(): string {
	const flowHeading = "## Fluxo de Vendas";
	const nextHeading = "## Regras de Ouro";
	const flowStart = SYSTEM_PROMPT.indexOf(flowHeading);
	const nextStart = SYSTEM_PROMPT.indexOf(nextHeading);
	if (flowStart === -1 || nextStart === -1) return SYSTEM_PROMPT;
	const before = SYSTEM_PROMPT.slice(0, flowStart);
	const after = SYSTEM_PROMPT.slice(nextStart);
	return `${before}${after}

## Ordem do funil
A ordem de coleta (nome → objetivo → valor do bem → identidade → busca →
recomendação) é decidida pelo SISTEMA (grafo de estado), não por você — nunca
tente "pular etapas" sozinho nem anuncie a mecânica pro usuário. Fale
livremente sobre o que ele trouxer; quando o sistema decidir que é hora de um
próximo passo estruturado, ele te avisa (ferramenta liberada ou card na
tela).`;
}

function toBaseMessage(m: { role: "user" | "assistant"; content: string }): BaseMessage {
	return m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content);
}

/** A Anthropic exige que a conversa COMECE numa fala de usuário. Conversas em
 * que o agente abriu (histórico que começa em `assistant`) devolviam 400 antes
 * mesmo de o modelo ver o turno. Corta só o prefixo — nunca mexe no miolo, pra
 * não separar `tool_call` do seu `tool_result` (que precisam ficar adjacentes). */
function apartirDaPrimeiraFalaDoUsuario(msgs: BaseMessage[]): BaseMessage[] {
	const i = msgs.findIndex((m) => m.getType() === "human");
	return i <= 0 ? (i === 0 ? msgs : []) : msgs.slice(i);
}

/** Injeta a INTENÇÃO do gate ativo (o que o funil quer descobrir AGORA) pro
 * modelo perguntar com as palavras dele — UMA pergunta, sobre ISSO, sem pular
 * etapa. Reusa `GATE_INTENT` (fonte canônica, `system-context.ts`) e espelha a
 * instrução do `buildSystemContext` do runtime Vercel. Gate ausente (usuário
 * desviou / `decideShowGate` suprimiu) → null: o modelo conversa livre. */
function buildGateContextText(gate: string | undefined, temCard: boolean): string | null {
	if (!gate) return null;
	const intent = GATE_INTENT[gate];
	if (!intent) return null;
	return (
		`Próximo passo do funil: descobrir ${intent}. Faça VOCÊ essa pergunta, com as suas ` +
		`palavras e de forma calorosa — ` +
		(temCard
			? `o sistema mostra o campo/os botões logo depois e NÃO vai repetir a pergunta. `
			: `NÃO vai aparecer nenhum botão nem campo na tela: quem conduz é a sua fala. `) +
		`Faça UMA pergunta só, sobre ISSO; não pule etapas nem pergunte sobre ` +
		`outra coisa. Se o usuário puxar o assunto pra outro lado, atenda ele primeiro e emende a ` +
		`pergunta no fim — o turno NUNCA termina sem um próximo passo pro cliente.`
	);
}

/** Remove blocos `thinking`/`redacted_thinking` que o acúmulo do streaming
 * deixou pela metade. O `concat` dos chunks pode produzir um bloco com o tipo
 * mas SEM o campo `thinking` preenchido; ao reenviar esse histórico no turno
 * seguinte a Anthropic devolve `400 messages.N.content.0.thinking.thinking:
 * Field required` e a conversa inteira morre — de um turno pro outro, sem nada
 * ter mudado na jornada. Bloco de raciocínio não é fala nem ferramenta: nada do
 * que o cliente vê depende dele, então descartar o pela-metade é seguro. */
function semBlocosDeThinkingIncompletos<T>(content: T): T {
	if (!Array.isArray(content)) return content;
	const limpo = content.filter((bloco) => {
		if (!bloco || typeof bloco !== "object") return true;
		const b = bloco as { type?: string; thinking?: unknown; data?: unknown };
		if (b.type === "thinking") return typeof b.thinking === "string" && b.thinking.length > 0;
		if (b.type === "redacted_thinking") return typeof b.data === "string" && b.data.length > 0;
		return true;
	});
	// Content vazio também é 400 ("all messages must have non-empty content") — mas
	// devolver o ORIGINAL aqui (o que esta função fazia antes) reintroduzia
	// exatamente o bloco quebrado que ela existe pra remover, e o 400 voltava dois
	// turnos depois, quando aquela mensagem já era histórico. Um placeholder mínimo
	// satisfaz a API sem carregar lixo: o cliente nunca vê este texto.
	return (limpo.length > 0 ? limpo : [{ type: "text", text: "…" }]) as T;
}

/** O histórico que vai pro modelo, seguro contra os dois 400 que já mataram a
 * conversa inteira de um turno pro outro:
 *  1. bloco `thinking` pela metade (o acúmulo do streaming produz um bloco com o
 *     tipo e sem o campo) — limpa TODA mensagem, não só a que este turno cria: a
 *     de ontem vira histórico hoje;
 *  2. histórico que começa numa fala do agente — a Anthropic exige que a conversa
 *     comece no usuário. Corta só o PREFIXO, nunca o miolo (senão separa
 *     `tool_call` do `tool_result`, que precisam ficar adjacentes). */
function historicoSeguro(msgs: BaseMessage[]): BaseMessage[] {
	const limpas = msgs.map((m) => {
		if (!Array.isArray(m.content)) return m;
		const content = semBlocosDeThinkingIncompletos(m.content);
		if (content === m.content) return m;
		if (m.getType() === "ai") {
			const ai = m as AIMessage;
			return new AIMessage({ content, tool_calls: ai.tool_calls, id: ai.id });
		}
		return m;
	});
	return apartirDaPrimeiraFalaDoUsuario(limpas);
}

/** O CARD NÃO PODE CONTRADIZER A ESCOLHA DO CLIENTE.
 *
 * O payload do card é o input da tool, ou seja, escrito pelo modelo. Quando o
 * cliente trocou de cota, o modelo às vezes narra a nova no texto e repete a
 * ANTERIOR no card: um cliente escolheu a Canopus, leu "Canopus fechada em
 * R$ 3.007/mês" e viu na tela um card do Itaú com R$ 6.873 (2026-07-21). O
 * texto é do modelo, mas o número na tela é fato — e o fato está no estado.
 *
 * Só age quando há escolha REGISTRADA e o card fala de outra administradora;
 * cards de comparação (que mostram várias de propósito) ficam de fora. */
function coagirContraEscolha(
	artifactType: string,
	payload: Record<string, unknown>,
	escolha: FunnelState["escolha"],
): Record<string, unknown> {
	if (!escolha?.administradora) return payload;
	if (!["recommendation_card", "group_card", "simulation_result"].includes(artifactType)) {
		return payload;
	}
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
	const p = payload;
	const doModelo = typeof p.administradora === "string" ? p.administradora : null;
	if (!doModelo || doModelo.toUpperCase() === escolha.administradora.toUpperCase()) return payload;
	return {
		...p,
		administradora: escolha.administradora,
		...(escolha.creditValue != null ? { creditValue: escolha.creditValue } : {}),
		...(escolha.monthlyPayment != null ? { monthlyPayment: escolha.monthlyPayment } : {}),
		...(escolha.termMonths != null ? { termMonths: escolha.termMonths } : {}),
		...(escolha.groupId ? { groupId: escolha.groupId } : {}),
	};
}

export function createConverseNode(model: BaseChatModel) {
	return async function converseNode(
		state: AgentGraphStateType,
		config: LangGraphRunnableConfig,
	): Promise<Partial<AgentGraphStateType>> {
		const tools = buildLangGraphTools({
			conversationId: state.conversationId,
			channel: state.channel,
			hasLance: state.funnel.qualifyAnswers?.hasLance === "yes",
			// Paridade com o runtime Vercel: as diretivas de recuperação (grupo não
			// exibido / id fabricado) só podem citar tool que existe nesta fase —
			// citar uma escondida faz o modelo tomar NoSuchToolError e o turno cair
			// no fallback enlatado.
			allowedToolNames: WHAT_IF_TOOL_NAMES,
		});
		const whatIfTools = WHAT_IF_TOOL_NAMES.map((name) => tools[name]).filter(
			(t): t is NonNullable<typeof t> => Boolean(t),
		);
		const boundModel = model.bindTools ? model.bindTools(whatIfTools) : model;
		const toolNode = new ToolNode(whatIfTools);
		/** Preenchido quando o modelo chama `suggest_handoff` — vira estado no
		 * retorno do nó, pra o encaminhamento existir de fato. Objeto (e não `let`)
		 * porque a escrita acontece dentro da closure do beat. */
		const handoffRef: { pedido: { reason: string } | null } = { pedido: null };
		/** Cota efetivamente apresentada neste turno — vira a âncora do estado. */
		const ancoraRef: { nova: FunnelState["recommendedOffer"] | null } = { nova: null };
		/** Faixa de busca reposicionada por pedido de parcela menor. */
		const novaFaixaRef: {
			faixa: { creditMax: number; creditMin: number; parcelaAlvo: number } | null;
		} = { faixa: null };

		// Contexto do gate ATUAL (state.gate, calculado pelo `routeFinal` ANTES
		// deste nó) vai como um BLOCO no MESMO system message (a Anthropic só
		// aceita UM system, no início — dois SystemMessage quebram). Sem isto o
		// converse fica CEGO ao funil e pergunta a coisa errada — ex.: no gate
		// `name` o modelo pedia o VALOR do carro enquanto o card pedia o nome
		// (duas perguntas, desalinhadas). Reusa `GATE_INTENT` (mesma fonte do
		// runtime Vercel) e injeta a INTENÇÃO, NUNCA a frase pronta — o modelo
		// pergunta com as palavras dele (lei-mãe "não engessar"); o bloco do gate
		// NÃO é cacheado (muda a cada turno), fica DEPOIS do bloco estável.
		// O gate que o FUNIL aguarda — `state.gate` é só o card que vai aparecer.
		// `decideShowGate` suprime o card em vários intents, e antes isso também
		// suprimia a CONDUÇÃO: o modelo ficava cego sobre o próximo passo e o turno
		// morria numa fala social sem pergunta ("Show, Kairo! Prazer em te ajudar")
		// — o beco sem saída reportado ao vivo. O card pode sumir; a condução, não.
		const gateAtivo = state.gate ?? state.answeredGate;
		// Beat do MOTIVO — turno próprio, logo depois do bem. Sem isto o gate
		// `desire` pedia bem + motivo no mesmo balão e o cliente respondia só um.
		const pedirMotivo = state.isUserTurn && shouldAskMotive(projectToMeta(state));
		const gateContextText = pedirMotivo
			? `Próximo passo do funil: descobrir por que ele quer isso AGORA — o que mudou, o ` +
				`que está pesando. Faça VOCÊ essa pergunta, com as suas palavras, UMA pergunta só; ` +
				`o sistema mostra os atalhos de resposta logo depois e NÃO vai repetir a pergunta.`
			: buildGateContextText(gateAtivo, Boolean(state.gate));

		const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

		// ── LANCE EMBUTIDO: a conta que faz o vendedor parecer vendedor ──
		// O embutido sai DA PRÓPRIA CARTA (até 30%), então o crédito recebido cai.
		// Quem quer o bem de R$ X e não tem dinheiro pra lance NÃO deve mirar uma
		// carta de R$ X — tem que mirar `X / (1 - pct)`, senão contempla e falta
		// dinheiro. O agente explicava o embutido sobre a carta atual ("usa uma
		// fatia dos R$ 92.902"), que é justamente o conselho errado. A conta é
		// invariante → vive aqui, em código; a venda é do modelo.
		const pctEmbutido =
			state.funnel.qualifyAnswers.lanceEmbutidoPercent ?? LANCE_EMBUTIDO_DEFAULT_PERCENT;
		const valorDoBem =
			state.funnel.qualifyAnswers.valorDoBemAlvo ?? state.funnel.qualifyAnswers.creditMax;
		const jaAceitouEmbutido = state.funnel.qualifyAnswers.lanceEmbutido === true;
		// Este bloco entra SÓ quando o lance está em jogo. Ele estava sendo injetado
		// em todo turno pós-valor, e um contexto que explica embutido em detalhe é um
		// convite pro modelo puxar o assunto: o cliente respondia "sem pressa, quero
		// menor parcela" e no turno seguinte ouvia "quer que eu te explique o lance
		// embutido?" — justamente o que ele acabou de dispensar. A ordem do funil é
		// código (`nextGate`), mas o CONTEXTO também precisa respeitá-la.
		const lanceEstaEmJogo =
			gateAtivo === "lance" ||
			gateAtivo === "lance-value" ||
			gateAtivo === "lance-embutido" ||
			querAntecipar(state.funnel.qualifyAnswers) ||
			/\blance|embutid|antecip|contempla[çc]/i.test(state.userText ?? "");
		const blocoEmbutido =
			valorDoBem && lanceEstaEmJogo
				? `Regra do lance embutido (fato, não opinião): o embutido sai DA PRÓPRIA CARTA, até ` +
					`${pctEmbutido}% dela — então o crédito que o cliente recebe DIMINUI nessa proporção. ` +
					`O bem que ele quer custa ${brl(valorDoBem)}. É por isso que a carta do tamanho do bem ` +
					`NÃO serve pra quem vai usar embutido: ela deixaria só ` +
					`${brl(Math.round(valorDoBem * (1 - pctEmbutido / 100)))} na mão dele. ` +
					(jaAceitouEmbutido
						? `Ele ACEITOU usar embutido, então o sistema foi buscar GRUPOS DE VALOR MAIOR — cartas ` +
							`em torno de ${brl(Math.round(valorDoBem / (1 - pctEmbutido / 100)))} — pra que, depois ` +
							`do embutido, sobrem os ${brl(valorDoBem)} que ele precisa. As ofertas na tela já são ` +
							`dessa faixa nova: fale delas, não da carta antiga.`
						: `A saída de um vendedor bom é procurar grupos de carta MAIOR, em torno de ` +
							`${brl(Math.round(valorDoBem / (1 - pctEmbutido / 100)))}, e deixar o embutido encolher ` +
							`aquilo até os ${brl(valorDoBem)} que ele precisa — nunca cortar o crédito da carta que ` +
							`ele já escolheu. Se ele topar, o sistema busca esses grupos maiores automaticamente.`) +
					` Use esses números quando o assunto for lance/embutido; nunca invente outros.`
				: null;

		// A busca já rodou (nó `discovery`, agora ANTES deste) — os cards com as
		// ofertas REAIS já estão montados. Sem este bloco o modelo não sabia disso e
		// prometia "só um segundo que já te trago", como se a busca ainda fosse
		// acontecer. Os NÚMEROS vêm daqui (do estado, coagidos contra o grupo real),
		// nunca da cabeça dele; a APRESENTAÇÃO é dele.
		const oferta = state.funnel.recommendedOffer;

		// ── O QUE ELE JÁ VIU NA TELA ──
		// O contexto só carregava a oferta RECOMENDADA, então o modelo não sabia
		// quais outras opções tinham sido exibidas — e, quando o cliente falava
		// delas ("vamos de prazo mais curto", "aquela do Itaú"), ele devolvia o
		// trabalho: "pode me confirmar a administradora ou o valor da parcela dela
		// pra eu não errar o grupo?". O cliente respondeu o óbvio ("não decorei os
		// valores"), e numa das conversas isso travou a venda inteira: três
		// pedidos seguidos pra ela repetir o que estava no card acima.
		// Quem tem a proposta na mão é o vendedor.
		const ofertasExibidas = state.funnel.revealCompleted
			? await listShownOffersForConversation(state.conversationId).catch(() => [])
			: [];
		const blocoOpcoesNaTela =
			ofertasExibidas.length > 1
				? `OPÇÕES QUE ELE JÁ VIU nesta conversa (você TEM esta lista — nunca peça pra ele repetir ` +
					`valor, administradora ou prazo de algo que já está na tela):\n` +
					ofertasExibidas
						.slice(0, 8)
						.map(
							(o) =>
								`- ${o.administradora ?? "?"}: carta ${o.creditValue ? brl(o.creditValue) : "?"}, ` +
								`parcela ${o.monthlyPayment ? brl(o.monthlyPayment) : "?"}` +
								`${o.termMonths ? ` em ${o.termMonths} meses` : ""}`,
						)
						.join("\n") +
					`\nQuando ele descrever uma delas por característica ("a de menor parcela", "a de prazo ` +
					`mais curto", "a do Itaú"), RESOLVA você mesmo pela lista e siga — é PROIBIDO devolver ` +
					`a identificação pra ele.`
				: null;

		// ── O LANCE DELE ALCANÇA? ──
		// O cliente diz "tenho 100 mil", o card mostra lance médio de R$ 183 mil, e
		// o agente respondia "baita empurrão!" sem ligar os dois pontos — porque a
		// comparação não existia no contexto dele, só no card. Um vendedor faz essa
		// conta na hora e é ela que abre o embutido de forma natural. Comparação
		// numérica é invariante → nasce aqui; a fala continua sendo dele.
		const lanceDele = state.funnel.qualifyAnswers.lanceValue ?? 0;
		const lanceMedio = oferta?.avgBidValue;
		// O embutido É lance: sai da própria carta e entra na disputa junto com o
		// dinheiro do bolso. Comparar só o que o cliente tem guardado contra o lance
		// médio subestimava a posição dele e, pior, deixava o agente vender
		// "contemplação rápida" sem saber se a conta fecha. Só conta quando ele
		// ACEITOU usar embutido — antes disso é hipótese, não recurso.
		const embutidoDisponivel =
			state.funnel.qualifyAnswers.lanceEmbutido === true && oferta?.creditValue
				? Math.round(oferta.creditValue * (pctEmbutido / 100))
				: 0;
		const lanceTotal = lanceDele + embutidoDisponivel;
		// ── A ESCOLHA ESTÁ FEITA: o estado sabe qual é ──
		// Não é mais o modelo inferindo do histórico se a decisão saiu: o funil
		// grava `escolha` quando ela é verificável (cota nomeada pelo cliente ou
		// critério já capturado — `advance.ts`). O que este bloco entrega são os
		// FATOS da cota escolhida; a fala continua sendo dele.
		const escolha = state.funnel.escolha;
		const querMenorParcela =
			state.funnel.qualifyAnswers.objetivo === "investimento" ||
			(state.funnel.qualifyAnswers.prazoMeses ?? 0) >= 120;
		const blocoEscolha =
			escolha && oferta?.monthlyPayment
				? `A ESCOLHA JÁ ESTÁ FEITA — está no estado desta conversa, não é suposição sua: ` +
					`${oferta.administradora}, ${brl(oferta.monthlyPayment)} por mês em ${oferta.termMonths} ` +
					`meses.${
						querMenorParcela
							? ` O critério dele foi a MENOR PARCELA (ele disse que não tem pressa), e a busca foi ` +
								`calibrada assim — pelo prazo mais longo disponível, que é o que deixa a parcela mais leve.`
							: ""
					} Fale dela como decidida e siga pro fechamento. NÃO pergunte de novo qual opção ele quer, ` +
					`nem peça confirmação do que já está definido. Se ELE pedir outra, aí sim você busca.`
				: null;

		// ── O GRUPO MUDOU: o número de antes era de outro grupo ──
		// Quando o cliente aceita embutido, o sistema busca cartas MAIORES e a
		// oferta ancorada troca — junto com ela troca o lance médio. O agente
		// continuava citando o número antigo em algum ponto da conversa, e o
		// cliente via três "lance médio deste grupo" diferentes, sem nada explicar
		// (visto ao vivo, 2026-07-21). O fato é do código; a frase é dele.
		const blocoGrupoTrocado =
			jaAceitouEmbutido && oferta?.avgBidValue
				? `A oferta na mesa MUDOU quando ele aceitou o embutido: o sistema foi atrás de cartas ` +
					`maiores, e o grupo é outro. Qualquer lance médio que você tenha citado ANTES era de ` +
					`outro grupo e não vale mais. O número que vale agora é ${brl(oferta.avgBidValue)}. Se ` +
					`for falar disso de novo, diga que o grupo mudou — nunca deixe dois números diferentes ` +
					`no ar como se fossem do mesmo grupo.`
				: null;

		const blocoLance =
			lanceTotal > 0 && lanceMedio
				? lanceTotal >= lanceMedio
					? `O lance dele ALCANÇA o lance médio desse grupo (${brl(lanceMedio)}): ` +
						(embutidoDisponivel > 0
							? `${brl(lanceDele)} do bolso + ${brl(embutidoDisponivel)} de embutido = ` +
								`${brl(lanceTotal)}. `
							: `${brl(lanceTotal)}. `) +
						`Diga isso com clareza — é a posição dele, não uma promessa de contemplação, que ` +
						`ninguém pode garantir.`
					: `ATENÇÃO, o fato mais importante deste momento: o lance dele NÃO alcança o lance ` +
						`médio desse grupo (${brl(lanceMedio)}). ` +
						(embutidoDisponivel > 0
							? `Somando tudo — ${brl(lanceDele)} do bolso + ${brl(embutidoDisponivel)} de ` +
								`embutido — dá ${brl(lanceTotal)}, e ainda faltam ${brl(lanceMedio - lanceTotal)}. ` +
								`Diga isso com todas as letras, mesmo sendo desconfortável: é PROIBIDO vender ` +
								`contemplação rápida quando a conta não fecha. Ofereça as saídas reais — juntar ` +
								`a diferença, mirar um prazo maior, ou olhar um grupo com lance médio menor.`
							: `Faltam ${brl(lanceMedio - lanceTotal)}. Não elogie o valor dele e siga em ` +
								`frente como se estivesse resolvido: diga onde ele está, sem drama, e mostre a ` +
								`saída — é exatamente para isso que existe o lance embutido, que completa a ` +
								`diferença usando parte da própria carta, sem ele tirar mais nada do bolso.`) +
						` Nunca prometa contemplação: lance médio é posição, não garantia.`
				: null;

		// Basta a oferta EXISTIR no estado — a busca já rodou em ALGUM turno. Antes
		// isto exigia artifact NESTE turno, então em todo turno pós-reveal (liberar o
		// hero, responder "sim, quero ver") o modelo ficava sem saber que os números
		// já estavam apurados e improvisava "só um instante que vou confirmar com a
		// administradora e já te trago" — duas, três vezes seguidas, sem nunca trazer
		// nada, porque não havia nada a buscar. O card já estava pronto no estado.
		const temCardsDeOferta = Boolean(oferta);
		// Critério VERIFICÁVEL da recomendação — o cliente consegue conferir na
		// lista que acabou de ver. O card hero vinha MUDO: aparecia sem nenhuma
		// frase dizendo em QUÊ aquela opção é a melhor, e o cliente tinha que abrir
		// um acordeão pra descobrir. "Melhor opção" sem dizer melhor em quê não
		// vende — e, pior, soa a truque.
		const blocoOfertas =
			temCardsDeOferta && oferta
				? `As ofertas REAIS das administradoras JÁ FORAM BUSCADAS e os cards estão na tela. ` +
					`Você NUNCA precisa buscar, confirmar ou validar nada com a administradora: os números ` +
					`abaixo são finais. É PROIBIDO dizer "só um instante", "vou confirmar", "já te trago", ` +
					`"já já te mostro" ou qualquer promessa de trazer algo depois — se o cliente pede pra ` +
					`ver, você MOSTRA agora, falando dos números. A que melhor atende: ` +
					`${oferta.administradora} — carta de ` +
					`${brl(oferta.creditValue)}, parcela de ${brl(oferta.monthlyPayment)} em ` +
					`${oferta.termMonths} meses. Apresente como um vendedor de consórcio experiente: ` +
					`diga o que encontrou, aponte o que chama atenção nesses números e por quê. ` +
					`NUNCA diga que vai buscar ou que "já já traz" — a busca já aconteceu.` +
					(oferta.groupId
						? ` Pra simular ESSA cota você NÃO precisa de nada do cliente: o identificador ` +
							`dela é ${oferta.groupId} — chame \`simulate_quota\` com ele e traga os números. ` +
							`É PROIBIDO pedir pro cliente "tocar", "clicar" ou "selecionar" um card pra você ` +
							`conseguir seguir: quem faz o trabalho é você, nunca ele. Também nunca diga que ` +
							`trouxe um card se você não chamou a ferramenta que o desenha.` +
							` Quando ele te der um CRITÉRIO ("quero a menor parcela", "o mais rápido"), ` +
							`NÃO devolva a escolha em forma de pergunta ("qual delas você quer?"): você tem ` +
							`os números, então DIGA qual atende o critério dele e por quê. Devolver a decisão ` +
							`pra quem acabou de dizer como quer decidir é o oposto de vender.`
						: "")
				: null;
		// ── PRIMEIRA VEZ: a pergunta que não pode morrer sem resposta ──
		// O funil pergunta "já fez consórcio antes?", o cliente responde "é a
		// primeira vez"… e o agente seguia direto pra pergunta seguinte. Coletar
		// e não usar é o comportamento de formulário que este produto combateu.
		// Só no turno em que a resposta CHEGA (o gate já resolveu, mas a fala
		// ainda não aconteceu) — depois disso o assunto não volta.
		// Guiado por FLAG, não por "aconteceu neste turno": amarrar no turno exato
		// era frágil (quando o `converse` roda, o `route` já avançou o gate) e, se
		// o modelo ignorasse a instrução uma vez, a explicação sumia pra sempre. Com
		// a flag, ela insiste até acontecer — e acontece uma vez só.
		const deveExplicarComoFunciona =
			state.funnel.experiencePrev === "first" && !state.funnel.explicouComoFunciona;
		const blocoNovato = deveExplicarComoFunciona
			? `Ele acabou de dizer que é a PRIMEIRA VEZ dele com consórcio. Antes de seguir pro ` +
				`próximo passo, explique o mecanismo em 2 ou 3 frases suas, sem jargão: entra num grupo, ` +
				`paga a parcela (sem juros, só a taxa da administradora), e todo mês alguém é contemplado ` +
				`— por sorteio ou por lance —, recebendo a carta pra comprar à vista. Só DEPOIS disso ` +
				`emende a próxima pergunta. Não diga "te explico no caminho": explique agora.`
			: null;

		// ── O CANAL NÃO TEM TELA ──
		// No WhatsApp não existe card, botão nem "aqui em cima": tudo é mensagem.
		// O agente dizia "das opções que você viu na tela" e "aqui na minha tela
		// preciso que você confirme", e o cliente não tinha tela nenhuma.
		const blocoCanal =
			state.channel === "whatsapp"
				? `Vocês estão conversando pelo WHATSAPP: não existe tela, card, botão nem "aqui em cima". ` +
					`É PROIBIDO dizer "na tela", "no card", "clica em", "aqui na minha tela" ou pedir que ele ` +
					`role/toque em algo — fale como quem fala ao telefone. Isso é só sobre COMO você escreve; ` +
					`não muda o assunto do turno nem te autoriza a reconfirmar coisas já decididas.`
				: null;

		// ── O FORMULÁRIO ESTÁ ABERTO E ESPERANDO ELE ──
		// No web a contratação se conclui com o cliente confirmando os dados no
		// formulário (é ali que o consentimento acontece). Quando ele responde por
		// texto — "pode confirmar sim" —, o modelo achava que estava feito e
		// respondia "seus dados já estão confirmados no sistema, o pré-cadastro
		// segue direto": afirmação de uma ação que NÃO aconteceu, e o cliente
		// ficava esperando ("cadê o passo de contratação? não apareceu nada").
		// Nunca dar por concluído o que depende dele; e nunca nomear botão (a
		// mecânica da tela continua invisível).
		const aguardandoConfirmacaoDoFormulario =
			state.channel === "web" &&
			state.funnel.contractFormDispatched === true &&
			!state.baseMeta.contractClosed;
		const blocoFormularioAberto = aguardandoConfirmacaoDoFormulario
			? `A contratação está aberta AGUARDANDO A CONFIRMAÇÃO DELE — ela ainda NÃO aconteceu. É ` +
				`PROIBIDO dizer que os dados "já estão confirmados", que o cadastro "seguiu" ou que o ` +
				`próximo passo "vai aparecer": nada avança sem ele confirmar. Se ele disser que confirma, ` +
				`peça com naturalidade que conclua a confirmação dos dados pra você seguir — sem nomear ` +
				`botão, campo ou card, e sem dizer que já está feito.`
			: null;

		// ── A BUSCA NÃO TROUXE NADA ──
		// O contexto só falava quando HAVIA oferta. Quando a administradora falhava
		// (timeout, HTML no lugar de JSON — acontece), o modelo ficava sem
		// informação nenhuma e preenchia o vazio com otimismo: anunciou "Encontrei
		// ótimas opções aí na sua faixa de R$ 190 mil!" sem ter encontrado nada, e
		// dois turnos depois teve que se desculpar ("ainda não te mostrei nada").
		// Afirmar achado que não existe é a pior mentira possível numa venda.
		const buscaJaTentada = state.funnel.searchDispatched === true;
		const blocoBuscaVazia =
			buscaJaTentada && !oferta
				? `A busca de ofertas JÁ foi tentada nesta conversa e NÃO há nenhuma oferta ancorada agora ` +
					`— nenhum card de oferta está na tela. É PROIBIDO dizer que encontrou opções, que "achei ` +
					`ótimas opções", que elas "estão aí" ou pedir que ele escolha entre opções que ele não ` +
					`viu. Se ele perguntar pelas opções, seja honesto: você ainda não tem os números pra ` +
					`mostrar e está atrás deles. Nunca invente carta, parcela ou administradora.`
				: null;

		// ── A CARTA NÃO COBRE O BEM ──
		// A carta real vem em denominações do grupo e quase nunca bate com o preço
		// do bem. Quando ela vem MENOR, o cliente vai ter que tirar a diferença do
		// bolso na hora da compra — e isso não estava sendo dito: um cliente ouviu
		// que crédito líquido de R$ 118.500 era "um cenário mais tranquilo" pro
		// carro de R$ 150 mil que ele queria, e outro fechou carta de R$ 225.759
		// pra uma sala de R$ 250 mil sem que o buraco fosse retomado no fecho.
		// A conta é verificável → código. O jeito de dizer é do modelo.
		const faltaParaOBem =
			valorDoBem && oferta?.creditValue && oferta.creditValue < valorDoBem
				? valorDoBem - oferta.creditValue
				: 0;
		const blocoCartaMenor =
			faltaParaOBem > 0
				? `ATENÇÃO — a carta NÃO cobre o bem que ele quer: a carta é de ${brl(
						oferta?.creditValue as number,
					)} e o bem custa ${brl(valorDoBem as number)}, então faltam ${brl(faltaParaOBem)} ` +
					`que sairiam do bolso dele na hora da compra. Diga isso com todas as letras ANTES de ` +
					`seguir pro fechamento — é dinheiro dele. Nunca apresente uma carta menor que o bem ` +
					`como boa notícia ou alívio. Se houver carta maior disponível, ofereça.`
				: null;

		// ── QUEM É O CLIENTE, E O QUE ELE JÁ ENTREGOU ──
		// O prompt manda "verifique a system message «Nome do usuario» antes de
		// perguntar o nome" — e essa injeção só existia no runtime Vercel
		// (`orchestrator/system-context.ts`). No LangGraph o modelo nunca via nada
		// disso: pedia o nome de quem o WhatsApp já identifica pelo perfil e, no
		// fim da conversa, dizia "seus dados eu não tenho aqui comigo" a um cliente
		// que tinha passado CPF e celular dez turnos antes (visto ao vivo).
		const blocoIdentidade = [
			state.contactName ? `Nome do usuario: "${state.contactName}".` : null,
			state.contactName
				? "Ele JÁ está identificado — não pergunte o nome de novo. Use quando fizer sentido, sem forçar em todo balão."
				: null,
			state.funnel.identityCollected
				? "O CPF e o celular dele JÁ estão registrados nesta conversa. É PROIBIDO dizer que você não tem os dados dele ou pedir de novo — a contratação segue com o que já está no sistema."
				: null,
		]
			.filter(Boolean)
			.join(" ");

		const montarSystem = (conducao: string | null) =>
			new SystemMessage({
				content: [
					cacheableSystemBlock(leanSystemPrompt()),
					...(blocoIdentidade ? [{ type: "text" as const, text: blocoIdentidade }] : []),
					...(blocoCartaMenor ? [{ type: "text" as const, text: blocoCartaMenor }] : []),
					...(blocoBuscaVazia ? [{ type: "text" as const, text: blocoBuscaVazia }] : []),
					...(blocoFormularioAberto
						? [{ type: "text" as const, text: blocoFormularioAberto }]
						: []),
					...(blocoCanal ? [{ type: "text" as const, text: blocoCanal }] : []),
					...(blocoOfertas ? [{ type: "text" as const, text: blocoOfertas }] : []),
					...(blocoOpcoesNaTela ? [{ type: "text" as const, text: blocoOpcoesNaTela }] : []),
					...(blocoFechamento ? [{ type: "text" as const, text: blocoFechamento }] : []),
					...(blocoNovato ? [{ type: "text" as const, text: blocoNovato }] : []),
					...(blocoEscolha ? [{ type: "text" as const, text: blocoEscolha }] : []),
					...(blocoGrupoTrocado ? [{ type: "text" as const, text: blocoGrupoTrocado }] : []),
					...(blocoLance ? [{ type: "text" as const, text: blocoLance }] : []),
					...(blocoEmbutido ? [{ type: "text" as const, text: blocoEmbutido }] : []),
					...(conducao ? [{ type: "text" as const, text: conducao }] : []),
				],
			});

		// ── REVEAL EM DOIS TEMPOS ──
		// No turno em que a busca acabou de rodar, o modelo recebia ao mesmo tempo
		// "apresente as ofertas" e "descubra a experiência do cliente" — e resolvia
		// as duas coisas numa frase só ("Encontrei ótimas opções! E me conta: você
		// já fez consórcio antes?"), com os cards e os atalhos pendurados embaixo.
		// Um vendedor não faz isso: ele mostra o que achou, deixa a pessoa ver, e
		// SÓ ENTÃO pergunta o que precisa saber pra recomendar uma delas. São dois
		// balões, com os cards no meio. Aqui só a ESTRUTURA é do código (quantos
		// beats, em que ordem, o que cada um sabe) — as palavras são todas do
		// modelo, nos dois.
		const revealEmDoisTempos = Boolean(state.apresentaOfertaNesteTurno && blocoOfertas);
		// O turno mostra a RECOMENDAÇÃO (hero liberado pelo `advance`) ou a LISTA
		// recém-buscada? Muda o que o vendedor tem a dizer no primeiro balão.
		const ehRecomendacao = state.events.some(
			(ev) => ev.type === "artifact" && ev.artifactType === "recommendation_card",
		);

		// A conversa enviada ao modelo TEM que terminar numa mensagem de usuário —
		// o Sonnet 5 não aceita prefill de assistente e devolve 400
		// ("This model does not support assistant message prefill"). Num turno de
		// SERVIDOR (`isUserTurn:false`, `pipeDirectiveTurn`) `newMessages` vinha
		// vazio: o array terminava na última fala do agente (→ 400) e, pior, a
		// DIRETIVA nem chegava ao modelo — o turno inteiro rodava sem a instrução
		// que o motivou. Ela entra como turno de usuário ROTULADO (o cliente nunca
		// vê; `pareceDirectiveDeServidor` em persist.ts impede de virar fala dele).
		const turnMessage = state.isUserTurn
			? new HumanMessage(state.userText?.trim() || "(o cliente abriu a conversa)")
			: new HumanMessage(
					`[instrução do sistema — o cliente NÃO vê este texto, não o repita] ${
						state.userText?.trim() || "siga a conversa a partir do ponto em que ela parou"
					}`,
				);
		const newMessages: BaseMessage[] = [turnMessage];
		// ── FECHAMENTO: o que acontece DEPOIS que o cliente confirma ──
		// A adesão na administradora é feita por um atendente humano, e o canal do
		// contato muda conforme onde a conversa aconteceu. São fatos operacionais
		// (quem faz, por onde, qual número) — viram contexto; a fala continua dele.
		const blocoFechamento = state.baseMeta.contractClosed
			? `O fechamento JÁ está feito, e o sistema JÁ mostrou na tela os cards do fecho: a ` +
				`proposta em PDF e ` +
				(state.channel === "whatsapp"
					? `o aviso de que um atendente da Aja Agora vai chamar por este mesmo número pra fazer ` +
						`a ADESÃO na ${state.funnel.recommendedAdministradora ?? "administradora escolhida"}.`
					: `o card com o botão do WhatsApp oficial, por onde um atendente da Aja Agora vai ` +
						`continuar com ele pra fazer a ADESÃO na ` +
						`${state.funnel.recommendedAdministradora ?? "administradora escolhida"}.`) +
				` Você NÃO precisa repetir nada disso: não escreva o número de telefone, não peça pra ` +
				`ele clicar em botão nenhum e não liste os próximos passos de novo. Se ele falar com ` +
				`você, responda o que ele perguntar, com naturalidade. Nunca prometa prazo de ` +
				`contemplação nem diga que a cota está reservada.`
			: null;

		const systemBeat1 = montarSystem(
			revealEmDoisTempos
				? `Esta MENSAGEM é só a apresentação. ${
						ehRecomendacao
							? `Você está RECOMENDANDO uma opção — a ${oferta?.administradora}. Diga que é a sua ` +
								`indicação e, principalmente, POR QUÊ ela é a certa pra ele, usando o que ele te ` +
								`contou. Recomendação sem motivo não vende.`
							: `Conte o que encontrou como um vendedor experiente contaria — o que chamou sua ` +
								`atenção nesses números e por quê.`
					} ` +
						`Termine SEM pergunta: nenhuma frase sua pode terminar em "?" aqui. A regra de nunca ` +
						`encerrar sem um próximo passo vale pro TURNO, e o próximo passo vem na sua PRÓXIMA ` +
						`mensagem, que você escreve logo em seguida — os cards aparecem entre as duas. ` +
						`Seja breve.`
				: gateContextText,
		);
		let loopMessages: BaseMessage[] = [
			systemBeat1,
			...historicoSeguro(state.messages),
			turnMessage,
		];

		// O filtro PRECISA do contexto de fatos. Sem ele, TODOS os guards de
		// verdade retornam cedo (`if (!ctx) return false`): o agente podia dizer
		// "a Bradesco é a melhor" sem Bradesco existir (FIX-342) e "sua proposta já
		// saiu" com `bevi_proposals` vazio (FIX-336) — enquanto os guards de ESTILO
		// continuavam ativos. Era o pior dos dois mundos: mentira liberada, fala
		// podada. O `state.funnel` é a autoridade de fato do grafo, então é dele
		// que o contexto nasce.
		const ctxDeFatos = () => {
			// As administradoras REAIS desta conversa: a recomendada + a do hero já
			// coagido. Nunca a narrativa do modelo — é justamente isso que o guard
			// `isHallucinatedAdministradoraClaim` existe pra checar.
			const reais = [
				state.funnel.recommendedAdministradora,
				state.funnel.recommendedOffer?.administradora,
				state.funnel.pendingRecommendationCard?.administradora,
			].filter((a): a is string => typeof a === "string" && a.length > 0);
			return {
				hasReceivedDocuments: (state.baseMeta.documentSlotsSent?.length ?? 0) > 0,
				// O `converse` NÃO chama busca (a descoberta é nó determinístico, fora
				// do toolset dele) — então nenhum turno deste nó é "o turno do reveal".
				hasSearchToolCall: false,
				// No runtime Vercel `hasProposal` vem de uma query em `bevi_proposals`;
				// aqui não há esse fato no estado, então usamos o proxy CONSERVADOR
				// (contrato fechado ⇒ existe proposta). Erra pro lado seguro: no
				// máximo bloqueia um "reservado" legítimo, nunca libera um indevido.
				hasProposal: state.baseMeta.contractClosed === true,
				contractClosed: state.baseMeta.contractClosed === true,
				channel: state.channel,
				recoConsentPending: state.funnel.recoConsentAnswered !== true,
				shownAdministradoras: reais,
			};
		};
		const filter = new EphemeralTextFilter(ctxDeFatos);
		const events: TurnEvent[] = [];

		/** Um "beat" de fala: streama o modelo, resolve as tool-calls e devolve. É a
		 * mesma máquina do turno inteiro — o reveal só a executa duas vezes, com
		 * contextos diferentes. */
		const executarBeat = async (comTools = true) => {
			for (let i = 0; i < MAX_TOOL_LOOP_ITERATIONS; i++) {
				// O segundo beat do reveal é UMA pergunta curta — não precisa de tool
				// nenhuma. Mandar o toolset inteiro ali dobrava o custo do turno à toa:
				// os turnos de reveal chegaram a 53s ao vivo, tempo em que o cliente vê
				// tela parada e acha que o agente morreu. Sem tools o modelo também não
				// tem como se distrair chamando algo no meio da pergunta.
				const stream = await (comTools ? boundModel : model).stream(loopMessages);
				let merged: AIMessageChunk | undefined;
				for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
					merged = merged ? merged.concat(chunk) : chunk;
					// FIX — achado na validação ao vivo (Kairo, gateway real): o
					// `ChatAnthropic` streama `content` como ARRAY de blocos
					// (`[{type:"text",text}]`), não string. `typeof chunk.content
					// === "string"` sempre falhava contra o modelo REAL (só passava
					// nos testes, que usam `FakeStreamingChatModel` com content
					// string) — turno inteiro engolido, virava
					// empty-turn-fallback. `chunk.text` (getter nativo do
					// LangChain, base.js) trata os dois formatos.
					const delta = chunk.text;
					if (!delta) continue;
					const clean = filter.push(delta);
					if (clean) {
						const ev: TurnEvent = { type: "text-delta", text: clean };
						config.writer?.(ev);
						events.push(ev);
					}
				}
				if (!merged) break;
				// Telemetria de CACHE. O `usage` só era emitido no runtime Vercel, então
				// no LangGraph o trace registrava `cacheRead: null` em todo turno — e
				// isso foi lido (por mim, inclusive) como "o cache não está pegando",
				// quando na verdade ninguém estava medindo. Agora o número é o número.
				const uso = merged.usage_metadata?.input_token_details;
				if (uso) {
					config.writer?.({
						type: "usage",
						cacheRead: typeof uso.cache_read === "number" ? uso.cache_read : null,
						cacheWrite: typeof uso.cache_creation === "number" ? uso.cache_creation : null,
					});
				}
				const aiMessage = new AIMessage({
					content: semBlocosDeThinkingIncompletos(merged.content),
					tool_calls: merged.tool_calls,
				});
				loopMessages = [...loopMessages, aiMessage];
				newMessages.push(aiMessage);

				if (!aiMessage.tool_calls || aiMessage.tool_calls.length === 0) break;

				for (const call of aiMessage.tool_calls) {
					const ev: TurnEvent = {
						type: "tool-call",
						toolName: call.name,
						input: call.args,
						toolCallId: call.id ?? crypto.randomUUID(),
					};
					config.writer?.(ev);
					events.push(ev);

					// HANDOFF PROMETIDO TEM QUE ACONTECER.
					// A tool estava no toolset mas o evento nunca era emitido neste
					// runtime (o TODO em `emit.ts` admitia). O modelo chamava, dizia ao
					// cliente "já encaminhei pra alguém te ajudar" — e ninguém era
					// encaminhado: `handoff` seguia false no estado e a pessoa ficava
					// esperando um atendente que nunca vinha (visto ao vivo, com uma
					// cliente travada num recálculo que o sistema não conseguia fazer).
					// Prometer atendimento e não abrir o chamado é pior que não oferecer.
					// "Essa parcela não cabe" → reposiciona a FAIXA DE BUSCA pelo estado
					// do grafo. A tool só calcula e narra; quem escreve é aqui, senão o
					// nó de persistência apaga logo em seguida e a busca nunca roda.
					if (call.name === "ajustar_por_parcela") {
						const desejada = Number((call.args as { parcelaDesejada?: unknown })?.parcelaDesejada);
						const atual = state.funnel.recommendedOffer;
						if (
							Number.isFinite(desejada) &&
							desejada > 0 &&
							atual?.creditValue &&
							atual.monthlyPayment &&
							desejada < atual.monthlyPayment
						) {
							const alvo = Math.round(atual.creditValue * (desejada / atual.monthlyPayment));
							novaFaixaRef.faixa = {
								creditMax: alvo,
								creditMin: Math.round(alvo * 0.9),
								parcelaAlvo: desejada,
							};
						}
					}

					if (call.name === "suggest_handoff") {
						const motivo =
							typeof (call.args as { reason?: unknown })?.reason === "string"
								? ((call.args as { reason: string }).reason ?? "")
								: "";
						handoffRef.pedido = { reason: motivo };
						const hv: TurnEvent = { type: "handoff", reason: motivo };
						config.writer?.(hv);
						events.push(hv);
					}

					// Tool de apresentação → CARD. O payload é o INPUT da tool (mesma
					// convenção do runtime Vercel, `artifactTypeFor` em runner.ts:206):
					// a tool valida os números, o artifact desenha. Sem isto o modelo
					// chamava a tool, ela executava, e nada aparecia na tela.
					if (PRESENTATION_TOOLS.has(call.name)) {
						const artifactType = call.name.replace("present_", "") as ArtifactType;
						const guardCtx: GuardContext = {
							meta: projectToMeta(state),
							userIntent: state.intent ?? "neutral",
							isUserTurn: state.isUserTurn,
							channel: state.channel,
							discoveryCount: null,
							conversationId: state.conversationId,
							turnArtifactTypes: events
								.filter((e): e is Extract<TurnEvent, { type: "artifact" }> => e.type === "artifact")
								.map((e) => e.artifactType),
							// Simulação rodada NESTE turno = conteúdo novo (o usuário escolheu
							// um grupo), não re-reveal. Sem isso o guard `reveal-loop` engolia
							// o card sempre que o intent saía `neutral` (ex.: o cliente digita
							// só "ITAÚ") e o agente falava de uma simulação inexistente.
							freshSimulationThisTurn: events.some(
								(e) => e.type === "tool-call" && e.toolName === "simulate_quota",
							),
						};
						if (artifactAllowed(guardCtx, artifactType)) {
							const payloadFinal = coagirContraEscolha(
								artifactType,
								call.args,
								state.funnel.escolha,
							);
							events.push({ type: "text-boundary" });
							events.push({
								type: "artifact",
								artifactType,
								payload: payloadFinal,
								toolCallId: call.id ?? crypto.randomUUID(),
							});
							// A COTA NA TELA É A COTA ANCORADA.
							//
							// O estado guardava a PRIMEIRA simulação e nunca acompanhava a
							// recomendação que o agente apresentou depois e o cliente
							// aceitou. Consequência: uma cliente escolheu R$ 1.798/148m,
							// recebeu exatamente isso no contrato — e mesmo assim leu
							// "atenção: essa cota não é a mesma que eu simulei", porque o
							// aviso comparava com a simulação de R$ 5.377 que ela tinha
							// REJEITADO. O aviso de divergência virou ruído: falava onde
							// não havia divergência e calava onde havia 2,3x na parcela.
							const p = payloadFinal as Record<string, unknown>;
							const num = (v: unknown) =>
								typeof v === "number" && Number.isFinite(v) ? v : undefined;
							const credito = num(p.creditValue);
							const parcela = num(p.monthlyPayment);
							const prazo = num(p.termMonths);
							if (
								(artifactType === "recommendation_card" ||
									artifactType === "simulation_result") &&
								credito &&
								parcela &&
								prazo
							) {
								ancoraRef.nova = {
									...(typeof p.administradora === "string"
										? { administradora: p.administradora }
										: {}),
									creditValue: credito,
									monthlyPayment: parcela,
									termMonths: prazo,
									...(typeof p.groupId === "string" ? { groupId: p.groupId } : {}),
									...(num(p.avgBidValue) != null ? { avgBidValue: num(p.avgBidValue) } : {}),
								};
							}
						}
					}
				}
				// ToolNode NUNCA lança em tool desconhecida — devolve ToolMessage de
				// erro (status "error"). É a garantia estrutural de "0 NoSuchToolError"
				// desta fundação (crítico ALTA-2): o toolset what-if é fechado e
				// pequeno, mas mesmo uma alucinação de nome de tool não derruba o turno.
				const { messages: toolMessages } = await toolNode.invoke({ messages: [aiMessage] });
				loopMessages = [...loopMessages, ...toolMessages];
				newMessages.push(...toolMessages);
			}
		};

		// No reveal em dois tempos, o PRIMEIRO beat só apresenta — nenhuma pergunta
		// pode sair nele (ela é o segundo balão, depois dos cards). Como a pergunta
		// agora sai na ORDEM em que o modelo escreve (e não guardada pro fim), o
		// bloqueio precisa estar ligado ANTES do beat, não depois.
		if (revealEmDoisTempos) filter.descartarPerguntaSegurada();
		await executarBeat();

		const streamedArtifactIds: string[] = [];
		if (revealEmDoisTempos) {
			// Fecha o balão do anúncio e joga os CARDS na tela AGORA, entre as duas
			// falas — é o que o cliente vê antes da pergunta. Emitir aqui (e não no
			// `persist`) é seguro porque `artifact` é o único evento que os adapters
			// desenham sem reler a meta do banco; `gate`/`meta-update` continuam
			// esperando a escrita. O `persist` grava todos e pula os já emitidos.
			// `flushPending` (não `flush`): libera a cauda MAS não a pergunta segurada
			// — e logo em seguida a descartamos. A instrução "não pergunte agora" não
			// bastava; o modelo emendava a pergunta no fim do anúncio e ela saía duas
			// vezes (uma aqui, outra no balão de baixo). Quem garante a estrutura é o
			// código; o texto continua todo dele.
			const cauda = filter.flushPending();
			if (cauda) {
				const ev: TurnEvent = { type: "text-delta", text: cauda };
				config.writer?.(ev);
				events.push(ev);
			}
			config.writer?.({ type: "text-boundary" });
			events.push({ type: "text-boundary" });
			for (const ev of state.events) {
				if (ev.type !== "artifact") continue;
				config.writer?.(ev);
				streamedArtifactIds.push(ev.toolCallId);
			}

			// Segundo balão: agora sim a condução do funil. O modelo sabe que acabou
			// de mostrar as opções — a pergunta nasce dessa deixa ("antes de te
			// recomendar uma delas..."), com as palavras dele.
			const deixaDoSegundoBeat = new HumanMessage(
				"[instrução do sistema — o cliente NÃO vê este texto, não o repita] Siga para a " +
					"pergunta, em mensagem separada.",
			);
			// Segundo balão: aqui a pergunta é justamente o ponto.
			filter.liberarPerguntas();
			newMessages.push(deixaDoSegundoBeat);
			loopMessages = [
				montarSystem(
					`Você ACABOU de apresentar as opções encontradas e os cards já estão na tela. ` +
						`Agora, numa mensagem NOVA e curta, emende o próximo passo: antes de recomendar ` +
						`UMA delas, você precisa saber isso. ` +
						`${buildGateContextText(gateAtivo, Boolean(state.gate)) ?? ""}`,
				),
				...loopMessages.slice(1),
				deixaDoSegundoBeat,
			];
			await executarBeat(false);
		}

		// O card só cala a pergunta canônica quando o MODELO já perguntou. Olhar só
		// a pergunta SEGURADA no filtro não bastava: com dois beats, o `flush()` do
		// meio zera o que o beat 1 segurou, e se o beat 2 sai sem interrogação o
		// turno era classificado como "ninguém perguntou" — o card emitia a pergunta
		// canônica embaixo dos cards, repetindo o que o agente já tinha acabado de
		// dizer. Qualquer interrogação emitida NESTE turno conta.
		const modelAskedQuestion =
			filter.hasHeldQuestion() ||
			events.some((ev) => ev.type === "text-delta" && ev.text.includes("?"));
		const tail = filter.flush();
		if (tail) {
			const ev: TurnEvent = { type: "text-delta", text: tail };
			config.writer?.(ev);
			events.push(ev);
		}

		return {
			messages: newMessages,
			events,
			modelAskedQuestion,
			streamedArtifactIds,
			...(deveExplicarComoFunciona || handoffRef.pedido || ancoraRef.nova || novaFaixaRef.faixa
				? {
						funnel: {
							...state.funnel,
							...(novaFaixaRef.faixa
								? {
										// Zera o snapshot da última busca pra a descoberta rodar de
										// novo na faixa nova (mesmo mecanismo do lance embutido).
										discoveredCreditTarget: undefined,
										qualifyAnswers: {
											...state.funnel.qualifyAnswers,
											creditMax: novaFaixaRef.faixa.creditMax,
											creditMin: novaFaixaRef.faixa.creditMin,
											parcelaAlvo: novaFaixaRef.faixa.parcelaAlvo,
										},
									}
								: {}),
							...(deveExplicarComoFunciona ? { explicouComoFunciona: true } : {}),
							...(handoffRef.pedido
								? { handoffSuggested: true, handoffReason: handoffRef.pedido.reason }
								: {}),
							...(ancoraRef.nova
								? {
										recommendedOffer: ancoraRef.nova,
										...(ancoraRef.nova.administradora
											? { recommendedAdministradora: ancoraRef.nova.administradora }
											: {}),
									}
								: {}),
						},
					}
				: {}),
		};
	};
}

export { toBaseMessage };
