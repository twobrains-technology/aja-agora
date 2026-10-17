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
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { escolhaPodeSerAncorada } from "@/lib/agent/escolha-ancoravel";
import {
	reescreverToolMessagesComFalha,
	toolAceitouPedido,
	toolsQueRecusaram,
} from "@/lib/agent/langgraph/tool-falha";
import type { ChosenOffer } from "@/lib/agent/orchestrator/choose-offer";
import {
	coerceEscolhaNosAtalhos,
	listShownOffersForConversation,
} from "@/lib/agent/orchestrator/choose-offer";
import { payloadSemOfertasRepetidas } from "@/lib/agent/orchestrator/dedup-ofertas";
import {
	pediuONomeExplicitamente,
	perguntouONome,
} from "@/lib/agent/orchestrator/detect-name-turn";
import {
	contemPerguntaQueOcupaCota,
	EphemeralTextFilter,
} from "@/lib/agent/orchestrator/sanitizer";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { leituraDoDesbloqueio } from "@/lib/chat/telefone-ab-do-servidor";
import type { ArtifactType } from "@/lib/chat/types";
import { registrarFalaContraCatalogo } from "@/lib/observability/langfuse/busca-scores";
import { registrarToolsRecusadas } from "@/lib/observability/langfuse/conducao-scores";
import {
	registrarEscolhaNaoAncorada,
	registrarFalaPodada,
	registrarFalhasDeTool,
} from "@/lib/observability/langfuse/funil-scores";
import { projectToMeta } from "../emit";
import {
	payloadComNumerosDaFonte,
	TOOL_DE_ORIGEM,
	toolResultsComRecusaDeCard,
} from "../numeros-do-card";
import { pausaDeConversa, RITMO } from "../ritmo";
import type { AgentGraphStateType, FunnelState } from "../state";
import { buildLangGraphTools } from "../tool-adapter";
import { WHAT_IF_TOOL_NAMES } from "../toolset";
import { artifactAllowed, type GuardContext } from "./guarded-artifact";
import { montarContextoDoTurno } from "./turn-context";

const MAX_TOOL_LOOP_ITERATIONS = 4;

/** As tools que DEVOLVEM ou DESENHAM número de oferta — carta, parcela, prazo,
 * taxa, contemplação, lance.
 *
 * Com o desbloqueio do telefone pendente (D1 do FIX-432), elas saem do `bind`:
 * a trava é de CONTEXTO e de TOOL, nunca de regex sobre a fala. Sem o número na
 * mão e sem a ferramenta que o busca, o modelo não tem como citá-lo. */
export const TOOLS_QUE_REVELAM_OFERTA: ReadonlySet<string> = new Set([
	"simulate_quota",
	"compare_with_financing",
	"compute_scenarios",
	"simulate_contemplation",
	"ajustar_por_parcela",
	"get_group_details",
	"get_rates",
	"present_simulation_result",
	"present_group_card",
	"present_comparison_table",
	"present_financing_comparison",
	"present_scenarios",
]);

/** Depois de executar estas tools, o modelo tem algo NOVO pra dizer?
 *
 * O `converse` roda em loop enquanto a resposta trouxer tool_calls. Isso é certo
 * pra tool de DADO (`simulate_quota`, `get_rates`): ela devolve número que o
 * agente precisa explicar, e sem a fala seguinte ele chamaria a simulação e
 * ficaria mudo sobre o resultado.
 *
 * Mas tool de APRESENTAÇÃO só desenha um card a partir do que o modelo JÁ sabia.
 * Não traz informação nova — e mesmo assim devolvia ToolMessage, o loop dava
 * outra volta e o modelo falava de novo, do mesmo contexto. Ao vivo (Kairo,
 * 2026-07-30) isso saiu como gagueira literal: dois balões abrindo com "Boa
 * escolha, Corolla é sucesso de vendas!", um com os atalhos e outro com o
 * slider. O card É a resposta; depois dele o turno se encerra. */
export function pedeFalaDepoisDasTools(nomes: readonly string[]): boolean {
	if (nomes.length === 0) return false;
	return nomes.some((nome) => !PRESENTATION_TOOLS.has(nome));
}

/** `SYSTEM_PROMPT` (system-prompt.ts) MENOS a seção "## Fluxo de Vendas
 * (siga esta ordem)" — o grafo é a ordem agora (elimina o drift
 * prompt×código, fix MÉDIA do crítico). Reusa a MESMA fonte de compliance
 * (tom, regras de ouro, dados financeiros, what-if, o que não fazer) sem
 * duplicar o texto. TODO(rodada-1): `buildSpecialistPrompt`/
 * `buildConciergePrompt` completos (exemplos por persona, injeção de
 * identidade da persona DB) — esta fundação usa o prompt base genérico.
 */
/**
 * A âncora do turno do reveal entregou alguma coisa ao cliente?
 *
 * "Entregar" não é só escrever: um `quick_reply` com as opções de caminho
 * ("Folga no bolso" / "Contemplar mais rápido") conduz tão bem quanto uma frase
 * — melhor, no celular. Medir só caracteres fazia a rede de segurança concluir
 * "âncora falhou" e reabrir o gate do funil embaixo dos cards: duas perguntas e
 * cinco botões no mesmo turno, que é o defeito que o FIX-424 existe para evitar.
 *
 * A rede continua inteira para o que ela realmente protege — o turno em que nada
 * chega ao cliente (sessão `ff8f2080`: cards na tela e nenhum convite a
 * responder).
 */
export function ancoraEntregouAlgo(args: {
	charsAntes: number | null;
	charsDepois: number;
	artifactsDoBeat: readonly string[];
}): boolean {
	if (args.charsAntes === null) return true; // âncora nem foi tentada
	if (args.charsDepois > args.charsAntes) return true;
	return args.artifactsDoBeat.some((t) => CARDS_QUE_PERGUNTAM.has(t));
}

/**
 * Cards que, sozinhos, dão ao cliente o que responder.
 *
 * O critério é estreito: só entra o que pede INTERAÇÃO (botão, campo, escolha).
 * `comparison_table`, `simulation_result` e afins ficam de fora de propósito —
 * são informativos, e um turno que só os mostra continua mudo do ponto de vista
 * de "o que eu faço agora?". É essa distinção que mantém a rede de segurança
 * viva para o caso que ela existe para cobrir (sessão `ff8f2080`).
 */
const CARDS_QUE_PERGUNTAM: ReadonlySet<string> = new Set([
	"quick_reply",
	"value_picker",
	"topic_picker",
	"two_paths",
	"decision_prompt",
	"whatsapp_optin",
	"contemplation_dial",
	"embedded_bid",
	"lead_form",
	"contract_form",
	"document_upload",
]);

/**
 * Cards que entregam um DADO na tela e por isso precisam de uma frase junto.
 *
 * São o oposto dos `CARDS_QUE_PERGUNTAM`: não pedem interação nenhuma, então
 * sozinhos eles não deixam o cliente com o que responder — deixam o cliente
 * olhando um card sem uma palavra que o explique. Medido em produção
 * (21/09/2026): `[card: simulation_result]` e `[card: comparison_table]`
 * chegando sozinhos, porque o modelo chamou a tool de apresentação sem escrever
 * nada antes e a tool de apresentação encerra o loop (`pedeFalaDepoisDasTools`).
 *
 * Esta lista autoriza o beat de apoio — as PALAVRAS continuam do modelo.
 */
const CARDS_DE_DADO: ReadonlySet<string> = new Set([
	"simulation_result",
	"comparison_table",
	"group_card",
	"recommendation_card",
]);

/**
 * O QUE ELE JÁ RESPONDEU — o contexto do turno precisa devolver estes fatos.
 *
 * Medido em produção (21/09/2026): o cliente já tinha dito o carro e, ao mandar
 * um "Oi", o agente reabriu a qualificação ("que carro você tem em mente?").
 * As respostas vivem no FUNIL (`state.funnel`: `desireAnswered`,
 * `currentCategory`, `qualifyAnswers`) e nunca chegavam ao modelo como FATO —
 * ele via só o histórico cru e a intenção do próximo gate.
 *
 * São fatos de servidor. A fala continua sendo do modelo; o que ele ganha aqui é
 * o dado que já está respondido, para não reabrir uma pergunta fechada.
 *
 * Mora aqui (e não em `contexto-da-tela.ts`) porque é contexto DESTE nó — a
 * mesma origem dos outros blocos de fato (`blocoEmbutido`). Ver
 * `.orientacao/pendencia-L4.md`: o ideal é subir para `contexto-da-tela.ts` (L1),
 * que já hospeda os blocos do que está na tela.
 */

/**
 * As REGRA DURAs que precisam sobreviver ao recorte do fluxo — e só as que valem
 * no mundo atual.
 *
 * Duas coisas que a versão ingênua (fatiar por linha em branco e filtrar quem
 * contém "REGRA DURA") errava, as duas medidas por sonda:
 *
 *  - **Arrastava vizinho.** Sem uma linha em branco entre a regra e o item
 *    seguinte do fluxo, o "5. Feche (self-service)" vinha de carona, órfão do
 *    fluxo que acabou de ser cortado. Aqui o bloco termina onde a regra termina:
 *    na próxima linha que abre um item numerado ou um novo negrito de topo.
 *
 *  - **Entregava regra de outro mundo.** A regra de que buscar oferta não custa
 *    documento só é verdadeira com a vitrine ligada. Sem ela, o modelo recebia
 *    essa regra E o bloco de ordem dizendo `identidade → busca` — duas ordens
 *    contraditórias na mesma janela, no kill switch e no estado default do
 *    rollout. Regra que contradiz o servidor é pior que regra ausente.
 */

/** O título da regra traz a tag de escopo? (`**REGRA DURA [VITRINE] — …`) */

/**
 * A ordem que o modelo deve assumir — e ela DEPENDE da vitrine.
 *
 * Este bloco é a autoridade mais específica na janela sobre o desenho do funil.
 * Enquanto ele afirmasse `identidade → busca` com a vitrine ligada, o modelo
 * ouviria do prompt o oposto do que o servidor faz — e é justamente a
 * contradição servidor×prompt que este projeto já pagou caro para aprender a
 * evitar. Por isso a frase acompanha o mesmo predicado que move o gate.
 */

/** FIX-368 (rodada 2, veredito do juiz — 3/3 personas reproduziram): o
 * `blocoFechamento` (montado em `createConverseNode`) cobre CONTESTAÇÃO e
 * PERGUNTA DE STATUS, mas nenhuma seção instruía a ABERTURA da retomada — o
 * modelo tratava "Voltei" como início de conversa comum e cada persona
 * "inventou" uma etapa pendente diferente (formulário travado / decisão não
 * tomada / contratação pendente). Dispara SÓ no turno sinalizado como
 * retomada (`isResumeGreeting`, ver `theater-chat.tsx`/`run-turn.ts`) — nunca
 * por heurística de texto (não trava em regex de "Voltei"). Extraída como
 * função pura (rodada 3) pra ser testável sem montar o grafo inteiro — o
 * card original já pedia "é assertable que a SEÇÃO existe no prompt final
 * quando as condições batem" como regressão exigida. */

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
		const desbloqueio =
			state.channel === "web"
				? await leituraDoDesbloqueio(state.conversationId).catch(() => null)
				: null;
		// `pede-antes` e `borrado` são os dois braços que escondem a oferta até o
		// telefone chegar. `livre` (telefone já conhecido / recusou) segue como antes.
		const desbloqueioPendente = desbloqueio !== null && desbloqueio.estado !== "livre";
		const nomesDasTools = desbloqueioPendente
			? WHAT_IF_TOOL_NAMES.filter((nome) => !TOOLS_QUE_REVELAM_OFERTA.has(nome))
			: WHAT_IF_TOOL_NAMES;

		const tools = buildLangGraphTools({
			conversationId: state.conversationId,
			channel: state.channel,
			// Âncora do que o modelo tentar GRAVAR neste turno (hoje: o nome).
			//
			// `null` em turno server-authored, e a condição é o conserto: nesses
			// turnos `state.userText` carrega a DIRECTIVE do servidor, não fala do
			// cliente — e a palavra "cliente" aparece em praticamente toda directive.
			// Sem o `isUserTurn`, `save_contact_name("Cliente")` voltava a ancorar e
			// gravar, justamente na classe de turno que domina o fecho da jornada
			// (o fecho é dirigido por cliques). O comentário anterior aqui afirmava
			// essa recusa — mas o código não a fazia.
			userText: state.isUserTurn ? state.userText : null,
			hasLance: state.funnel.qualifyAnswers?.hasLance === "yes",
			// A MESMA fonte que este nó usa. O `persist` é o último nó do turno, então
			// no turno da descoberta o banco ainda não tem a oferta que o `discovery`
			// acabou de apurar — e as tools recusavam pedidos legítimos por causa
			// disso (sessão `ff8f2080`).
			metaDoTurno: projectToMeta(state),
			// O que este turno já pôs (ou vai pôr) na tela. Inclui o card de
			// recomendação PENDENTE: ele é emitido pelo `emitCard` no fim deste mesmo
			// turno, e o contexto do modelo já manda simular com esse grupo — o guard
			// não pode recusar aquilo que o próprio sistema mandou fazer.
			artifactsDoTurno: [
				...state.events
					.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
					.map((ev) => ({ type: ev.artifactType, payload: ev.payload })),
				...(state.funnel.pendingRecommendationCard
					? [
							{
								type: "recommendation_card",
								payload: state.funnel.pendingRecommendationCard,
							},
						]
					: []),
			],
			// Paridade com o runtime Vercel: as diretivas de recuperação (grupo não
			// exibido / id fabricado) só podem citar tool que existe nesta fase —
			// citar uma escondida faz o modelo tomar NoSuchToolError e o turno cair
			// no fallback enlatado.
			allowedToolNames: nomesDasTools,
			// O turno do cliente vai junto para que `escolher_cota` responda ao
			// modelo pelo MESMO critério que este nó usa para gravar. Enquanto ela
			// não tinha isso, dizia "confirmada" para um efeito que o veto abaixo
			// descartaria — e o modelo anunciava ao cliente a cota confirmada que o
			// servidor não tinha (`fd76e393`, prod, 16/08/2026).
			turnoDoCliente: { texto: state.userText ?? "", intent: state.intent },
		});
		const whatIfTools = nomesDasTools
			.map((name) => tools[name])
			.filter((t): t is NonNullable<typeof t> => Boolean(t));
		const boundModel = model.bindTools ? model.bindTools(whatIfTools) : model;
		const toolNode = new ToolNode(whatIfTools);
		/** Preenchido quando o modelo chama `suggest_handoff` — vira estado no
		 * retorno do nó, pra o encaminhamento existir de fato. Objeto (e não `let`)
		 * porque a escrita acontece dentro da closure do beat. */
		const handoffRef: { pedido: { reason: string } | null } = { pedido: null };
		/** Cota efetivamente apresentada neste turno — vira a âncora do estado. */
		const ancoraRef: { nova: FunnelState["recommendedOffer"] | null } = { nova: null };
		/** As cotas que os ATALHOS deste turno oferecem como escolha (coagidas
		 * server-side a partir dos rótulos — ver `coerceEscolhaNosAtalhos`). É o
		 * fato que autoriza ancorar a resposta do cliente no turno seguinte: ele
		 * respondeu à pergunta que o próprio agente fez, entre cotas que o
		 * SERVIDOR nomeou. */
		const escolhaOfertadaRef: { groupIds: string[] | null } = { groupIds: null };
		/** Uma simulação chegou à tela neste turno. Marca o cliente como "dentro do
		 * simulador" — daí em diante o gate `timeframe` para de barrar o fechamento
		 * (o prazo desejado é insumo do simulador, e ele já está nele). */
		const simulouRef = { apresentou: false };
		/** Faixa de busca reposicionada por pedido de parcela menor. */
		const novaFaixaRef: {
			faixa: { creditMax: number; creditMin: number; parcelaAlvo: number } | null;
		} = { faixa: null };
		/** Tools que responderam RECUSANDO o pedido neste turno — vira o score
		 * `tool_recusou`. */
		const toolsRecusadas: string[] = [];
		/** Quanto texto já tinha sido entregue quando o beat da âncora começou.
		 * `null` = a âncora não foi tentada neste turno (não é reveal, ou o gate
		 * ativo é de coleta e quem conduz é o funil). */
		const ancoraCharsRef: { antes: number | null } = { antes: null };
		/** Reposicionamentos que o modelo PEDIU e que ainda esperam a resposta da
		 * tool — só viram `novaFaixaRef` se ela tiver mesmo ajustado. */
		const ajustesPendentes: Array<{
			toolCallId: string | undefined;
			faixa: { creditMax: number; creditMin: number; parcelaAlvo: number };
		}> = [];
		/** A cota que o cliente escolheu, dita pelo modelo e conferida contra as
		 * que de fato apareceram em card nesta conversa. */
		const escolhaRef: { cota: ChosenOffer | null } = { cota: null };

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
		// O CONTEXTO DO TURNO (system + fatos + a mensagem do turno) mora em
		// `turn-context.ts` desde 17/10/2026: o motor do pi precisa montar o MESMO
		// contexto, e duplicá-lo daria duas verdades sobre o mesmo turno.
		const {
			montarSystem,
			systemBeat1,
			llmConfig,
			turnMessage,
			newMessages,
			gateAtivo,
			ofertasExibidas,
			turnoDeApresentacao,
			dossie,
			deveExplicarComoFunciona,
			lfPrompt,
		} = await montarContextoDoTurno({
			state,
			config,
			tools,
			desbloqueio,
			desbloqueioPendente,
		});
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
				// O FATO real (fio cruzado L3 → L1): existe proposta REGISTRADA para a
				// PESSOA (`dossie.simulacoes`), de qualquer conversa. Antes era o proxy
				// `contractClosed` — que lê "sem proposta" enquanto a proposta existe sem
				// contrato fechado, e aí o guard da L3 dropava uma fala VERDADEIRA.
				// Quando o dossiê não resolve (sem identidade, ou leitura falhou) cai no
				// proxy conservador: no máximo bloqueia um "reservado" legítimo.
				hasProposal: dossie ? dossie.simulacoes.length > 0 : state.baseMeta.contractClosed === true,
				contractClosed: state.baseMeta.contractClosed === true,
				channel: state.channel,
				recoConsentPending: state.funnel.recoConsentAnswered !== true,
				shownAdministradoras: reais,
			};
		};
		const filter = new EphemeralTextFilter(ctxDeFatos);
		const events: TurnEvent[] = [];
		/** Ids dos artifacts que JÁ foram pra tela ao vivo neste nó — o `persist`
		 * pula estes pra não desenhar o mesmo card duas vezes. Declarado AQUI (e não
		 * depois dos beats) porque o `executarBeat` também emite ao vivo agora. */
		const streamedArtifactIds: string[] = [];

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
				// `llmConfig` no call leva os callbacks do turno (Langfuse) e o link de
				// versão do prompt até o modelo — a auto-propagação por ALS do
				// @langchain/core não é garantida através deste generator.
				// Com prompt gerenciado, o modelo vai embrulhado num RunnableSequence:
				// o mecanismo do @langfuse/langchain só linka a VERSÃO na generation
				// quando um chain-IRMÃO carrega `metadata.langfusePrompt` (o
				// passthrough cumpre esse papel; sem isso o link simplesmente não
				// acontece em chamada direta de modelo). Sem Langfuse: caminho idêntico
				// ao original.
				const runnableDoBeat = comTools ? boundModel : model;
				const stream = lfPrompt
					? await RunnableSequence.from([
							new RunnablePassthrough<typeof loopMessages>(),
							runnableDoBeat,
						]).stream(loopMessages, llmConfig)
					: await runnableDoBeat.stream(loopMessages, llmConfig);
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

				// FRONTEIRA DE GERAÇÃO — o que uma não fechou não vaza para a próxima.
				//
				// O filtro retém no `pending` o trecho final sem delimitador, esperando
				// o resto da frase. Só que "R$ 1.800." NÃO fecha frase (o "." colado a
				// dígito é separador de milhar — `sanitizer.ts:985-991`, FIX-248), e a
				// geração seguinte chegava colada nesse resto: as duas viravam UM
				// segmento, que começava pelo preâmbulo da anterior e caía inteiro,
				// levando junto a fala boa da nova. Foi assim que o cliente da sessão
				// `ff8f2080` (produção 2026-08-13) recebeu "Excelente, Kairo! Um
				// instante." e cinco cards, sem uma palavra sobre as ofertas.
				//
				// `flushPending` (e não `flush`) é o método feito para isto: libera a
				// cauda e NUNCA a pergunta segurada, porque uma fronteira intermediária
				// não é o fim do turno (FIX-330, `sanitizer.ts:1207-1219` — que já
				// descrevia este uso, "troca de bloco multi-tool-call, pré-tool-call").
				const cauda = filter.flushPending();
				if (cauda) {
					const ev: TurnEvent = { type: "text-delta", text: cauda };
					config.writer?.(ev);
					events.push(ev);
				}

				// B14.2 (FIX-436) — toolCallId → tool de origem dos cards que forem
				// DESCARTADOS por falta de fonte neste beat. O `ToolNode` executa a tool
				// de apresentação de qualquer forma e devolveria SUCESSO — e o modelo,
				// ouvindo sucesso, narra "confere no card abaixo" de um card que não
				// existe. Depois do ToolNode, o tool-result desses vira RECUSA.
				const cardsSemFonte = new Map<string, string>();
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
					//
					// O efeito fica PENDENTE até a tool responder. Enquanto ele era
					// aplicado aqui, o servidor escrevia um ajuste que a tool tinha
					// acabado de RECUSAR — as duas leem a mesma oferta de lugares
					// diferentes (a tool do banco, via `reloadMeta`; este nó do estado
					// do grafo), e no turno da DESCOBERTA elas divergem: o `discovery`
					// já escreveu a oferta no estado e o `persist` ainda não a gravou
					// no banco. Produção 2026-08-13, sessão `ff8f2080`: o cliente pediu
					// um carro de R$ 238 mil, a tool devolveu "[Sem oferta ancorada
					// nesta conversa]" ao modelo, e o funil terminou o turno buscando
					// cartas de R$ 63–70 mil assim mesmo. O modelo, que ouviu "não
					// deu", nem sabia. O servidor só aplica o que ele disse ao modelo
					// que aplicaria.
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
							// A proporção continua sendo calculada — mas para NARRAR ("com
							// R$ 200 por mês a carta fica em torno de R$ X"), nunca para
							// virar o alvo da busca. Como `creditMax`, ela produziu R$ 9.120
							// e depois R$ 6.424 numa moto de R$ 20 mil: abaixo do piso que a
							// Bevi aceita, quatro buscas vazias seguidas, venda morta. Quem
							// falou em parcela é buscado por parcela (`INSTALLMENT_VALUE`).
							const alvo = Math.round(atual.creditValue * (desejada / atual.monthlyPayment));
							ajustesPendentes.push({
								toolCallId: call.id,
								faixa: {
									creditMax: alvo,
									creditMin: Math.round(alvo * 0.9),
									parcelaAlvo: desejada,
								},
							});
						}
					}

					// O modelo diz QUAL cota o cliente escolheu; aqui só se confere que
					// ela foi realmente exibida nesta conversa e ela vira a âncora. Grupo
					// que não apareceu em card nenhum não ancora nada — a tool já devolve
					// erro ao modelo, e aqui a escolha simplesmente não acontece.
					if (call.name === "escolher_cota") {
						// FIX-405 — o VETO de recusa também vale pra tool.
						//
						// Este é o 3º escritor de `escolha`, e o mais discricionário: quem
						// decide chamar `escolher_cota` é o MODELO, lendo o texto. O
						// `groupId` é verificado (tem que ser uma cota exibida), mas a
						// INTENÇÃO do turno nunca era. Um turno em que o cliente diz "não
						// quero essa" podia virar uma chamada com groupId válido e ancorar —
						// mesma classe das oito portas anteriores, com roupa melhor: em vez
						// do servidor inferir por regex, é o modelo inferindo e o servidor
						// obedecendo sem checar.
						//
						// A conversa segue sendo do modelo: ele chama a tool quando quiser. O
						// que o código faz é vetar o EFEITO quando o texto do cliente é uma
						// recusa determinística — e `converse` roda DEPOIS do `advance`,
						// sobrescrevendo `funnel.escolha`, então sem este veto ele desfazia
						// uma decisão correta tomada no mesmo turno.
						// FIX-410 — o predicado INTEIRO, não metade dele.
						//
						// A 1ª versão deste veto usava só `detectYesNoText(...) === false`, e
						// recusa sem a palavra "não" devolve `null`, não `false`:
						//
						//   detectYesNoText("de jeito nenhum", "ready_to_proceed") → null
						//
						// Ou seja: "de jeito nenhum", "nem pensar", "jamais", "esquece" e
						// "deixa pra lá" NÃO vetavam, e a tool ancorava a cota. Confirmado no
						// grafo real (`cenario-tool-escolher-cota.fix-410.test.ts`), com
						// controle positivo provando que o caminho está vivo — a 9ª revisão
						// independente listou isto como hipótese que não conseguiu reproduzir.
						//
						// É a terceira vez que reusar METADE de `falaRecusa` produz o mesmo
						// defeito (proxy do WhatsApp no FIX-407, `extractNegatedAdministradoras`
						// no FIX-408, aqui). `detectYesNoText` fica junto porque é o único que
						// enxerga o rótulo `declines` do analyzer; `falaRecusa` cobre o léxico
						// que não depende da palavra "não".
						const texto = state.userText ?? "";
						// ── FIX-416: ALLOWLIST, não blocklist ──
						//
						// O 12º vazamento, medido pela 12ª revisão independente no grafo real:
						//
						//   "quanto fica a parcela da Rodobens?" → contractOffer = RODOBENS
						//   "me explica melhor essa da Rodobens" → contractOffer = RODOBENS
						//
						// Uma PERGUNTA sobre preço amarrava o cliente à cota. O veto era
						// blocklist ("o cliente recusou?"), e ausência de recusa não é prova de
						// escolha — o `~/.claude/reference/arquitetura-agentes-ia.md` diz isso
						// com todas as letras (allowlist, não blocklist) e este era o lugar do
						// sistema onde a lei mais importava.
						//
						// Quem decide chamar a tool é o MODELO, lendo texto livre. O `groupId`
						// ser real prova que a cota EXISTE, não que ela foi ESCOLHIDA. Agora o
						// servidor exige o sinal positivo: `detectYesNoText === true`, ou seja,
						// uma afirmação reconhecida ("quero", "bora", "pode ser", "é essa que eu
						// quero"). Pergunta e dúvida devolvem `null` e não ancoram nada.
						//
						// Perder um aceite que o léxico não reconhece custa uma pergunta
						// repetida — o card de decisão aparece. Ganhar um falso aceite custa um
						// contrato. É a mesma assimetria que o `yes-no.ts:21` argumenta.
						// FIX-414 — o veto também cobre EXCLUSÃO da marca, não só recusa
						// genérica. A 11ª revisão mediu a tool ancorando RODOBENS em
						// "qualquer uma menos a Rodobens, quero fechar" — ou seja, o
						// caminho "estruturado", que existe pra ser a parede, era mais
						// permissivo que o resolvedor de texto que ele substitui.
						//
						// 16/08/2026: o predicado inteiro saiu daqui para
						// `agent/escolha-ancoravel.ts` porque a TOOL não o consultava.
						// Ela respondia "confirmada: true" ao modelo enquanto este bloco
						// descartava o efeito, e o modelo — corretamente — contava ao
						// cliente o que a ferramenta lhe dissera: "Pronto! A cota está
						// confirmada", com `escolha = null` no servidor. Duas cópias da
						// mesma regra, e a que falava com o modelo estava errada.
						const gid = (call.args as { groupId?: unknown })?.groupId;
						if (typeof gid === "string" && gid.trim()) {
							const exibidas = await listShownOffersForConversation(state.conversationId).catch(
								() => [],
							);
							const veredito = escolhaPodeSerAncorada({
								texto,
								intent: state.intent,
								groupId: gid,
								exibidas,
								// O fato de servidor que abre a segunda porta: os atalhos do
								// turno anterior ofereceram estas cotas como escolha (D6).
								...(state.funnel.escolhaOfertada
									? { escolhaOfertada: state.funnel.escolhaOfertada }
									: {}),
							});
							if (veredito.ancora) {
								escolhaRef.cota = veredito.cota;
							} else {
								// FIX-431 — O SILÊNCIO MAIS CARO DO SISTEMA.
								//
								// Quando o cliente diz "quero contratar" e a âncora NÃO
								// acontece, `escolha` não entra no estado,
								// `fechamentoSinalizado` fica falso e o funil continua no
								// reveal: o cliente pede o contrato e recebe o card de
								// recomendação de novo. Isso não deixava rastro — nem log,
								// nem score —, e o defeito só aparecia como "o agente não
								// fecha", sem causa legível.
								//
								// O registro cobria só o groupId inexistente. O veto por falta
								// de aceite — o que de fato aconteceu em `fd76e393` — era mudo,
								// e por isso a conversa que anunciou uma venda inexistente não
								// gerou sinal nenhum no minuto em que aconteceu.
								console.error(
									`[escolha-nao-ancorou] veto=${veredito.veto} groupId=${gid} exibidas=${exibidas.length} (conv=${state.conversationId})`,
								);
								registrarEscolhaNaoAncorada({
									groupId: gid,
									exibidas: exibidas.length,
									veto: veredito.veto,
								});
							}
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
						// FIX-436 (D7) — o card que revela número de oferta sai com o RESULTADO
						// da tool de dado, nunca com o número que o modelo digitou. Sem o
						// resultado de origem no histórico, o card NÃO sai: a tela não mente.
						const toolDeOrigem = TOOL_DE_ORIGEM[artifactType];
						const payloadDaFonte = toolDeOrigem
							? payloadComNumerosDaFonte(
									artifactType,
									call.args as Record<string, unknown>,
									loopMessages,
									// Extensão D7 (gerente): a cota ancorada no estado é fato do
									// servidor e vale como origem do `simulation_result` quando a
									// tool de dado não está no histórico — para a MESMA cota.
									state.funnel.escolha ?? state.funnel.recommendedOffer ?? null,
								)
							: null;
						if (toolDeOrigem && !payloadDaFonte) {
							console.error(
								`[card-sem-fonte] ${artifactType} sem resultado de ${toolDeOrigem} (conv=${state.conversationId})`,
							);
							if (call.id) cardsSemFonte.set(call.id, toolDeOrigem);
							continue;
						}
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
							// A mesma oferta não sai duas vezes na mesma tela: o payload é
							// escrito pelo MODELO e ele repetia o grupo já destacado ao
							// remontar a lista ("quero ver mais opções"). Report de 05/08,
							// reproduzido pelo gate em 13/08 assim que os cenários pararam
							// de ficar SKIPPED. Invariante — vive aqui, não no prompt.
							let payloadFinal = payloadSemOfertasRepetidas(
								coagirContraEscolha(
									artifactType,
									payloadDaFonte ?? (call.args as Record<string, unknown>),
									state.funnel.escolha,
								),
							);
							// O ATALHO QUE ESCOLHE COTA PASSA A CARREGAR A COTA (D6).
							//
							// "Qual delas você prefere? [A de menor parcela] [A de prazo mais
							// curto]" era a pergunta certa com o botão errado: o atalho manda
							// TEXTO, e o texto não ancorava escolha nenhuma (FIX-406). A
							// cliente respondia com precisão e o funil ficava três portões
							// atrás.
							//
							// O MODELO declara de quais cotas está falando (ele acabou de
							// citá-las) e o SERVIDOR confere: o id existe entre as exibidas? o
							// rótulo do botão aponta para a cota declarada? Só então o clique
							// vira `choose_offer` estruturado, igualzinho ao do card — e o
							// estado guarda quais cotas foram ofertadas, para o caso de ela
							// responder digitando. Ver `coerceEscolhaNosAtalhos`.
							if (artifactType === "quick_reply") {
								const p = payloadFinal as {
									options?: Array<{ label?: unknown; groupId?: unknown }>;
								};
								const declaradas = (p.options ?? []).map((o) => ({
									label: typeof o?.label === "string" ? o.label : "",
									...(typeof o?.groupId === "string" ? { groupId: o.groupId } : {}),
								}));
								const conferidas = coerceEscolhaNosAtalhos(declaradas, ofertasExibidas);
								const comCota = conferidas.filter((o) => o.groupId);
								if (comCota.length >= 2) {
									payloadFinal = {
										...(payloadFinal as Record<string, unknown>),
										options: (p.options ?? []).map((o, i) => ({
											...(o as Record<string, unknown>),
											// O id que vale é o CONFERIDO pelo servidor — nunca o que
											// veio na tool sem checagem.
											...(conferidas[i]?.groupId
												? { groupId: conferidas[i].groupId }
												: { groupId: undefined }),
										})),
									};
									escolhaOfertadaRef.groupIds = comCota.map((o) => o.groupId as string);
								} else {
									// Nenhuma escolha reconhecida: o atalho volta a ser texto puro,
									// sem id nenhum viajando para o cliente.
									payloadFinal = {
										...(payloadFinal as Record<string, unknown>),
										options: (p.options ?? []).map((o) => {
											const { groupId: _descartado, ...resto } = o as Record<string, unknown>;
											return resto;
										}),
									};
								}
								// IDENTIDADE PERSISTIDA DO ATALHO (L4).
								//
								// Cada opção ganha um `replyId` único gerado AQUI e gravado junto com o
								// artifact. É o que o clique reivindica (`claimQuickReplyConsumption`,
								// chave `click:<conversationId>:<replyId>`) e o que o render consulta
								// depois do reload. Sem ele o botão voltava ao recarregar a página e o
								// cliente clicava o mesmo atalho duas vezes — o segundo clique era
								// reprocessado como resposta nova (medido em produção, 21/09/2026).
								// Gerado a cada emissão de propósito: um card repetido em outro turno
								// recebe id novo e não nasce "já consumido".
								const opcoesAtalho =
									(payloadFinal as { options?: Array<Record<string, unknown>> }).options ?? [];
								payloadFinal = {
									...(payloadFinal as Record<string, unknown>),
									options: opcoesAtalho.map((o) => ({ ...o, replyId: crypto.randomUUID() })),
								};
							}
							// O CARD SAI AGORA, COLADO NA FALA QUE O ANUNCIOU.
							//
							// Visto ao vivo (Kairo, 2026-07-30): o agente apresentava a carta do
							// Itaú, o carrossel aparecia, ele perguntava "você já fez consórcio
							// antes?" — e SÓ ENTÃO caía o card daquela carta, entre a pergunta e
							// os chips de resposta dela. É o FIX-376 por outra porta: lá o card
							// intruso era um `group_card` não-guardado; aqui é o card LEGÍTIMO,
							// no lugar errado.
							//
							// Causa: só os artifacts que já estavam em `state.events` (os do nó
							// `discovery`) eram empurrados ao vivo entre os balões. Os que o
							// PRÓPRIO beat criava por tool ficavam só no `events` de retorno, e
							// quem os entregava era o `persist` — o último nó do turno, depois
							// de toda a fala. O card nascia no meio da frase e chegava no fim.
							const artifactId = call.id ?? crypto.randomUUID();
							const fechaBalao: TurnEvent = { type: "text-boundary" };
							const cardDaTool: TurnEvent = {
								type: "artifact",
								artifactType,
								payload: payloadFinal,
								toolCallId: artifactId,
							};
							// FIX-431 (P1 #9): o gancho que ANUNCIOU este card passa a ter o
							// que anunciar — sem isto ele é descartado no flush e o turno
							// entrega card sem uma palavra (turno mudo da sessão `04fda013`).
							filter.marcarArtifactEmitido();
							events.push(fechaBalao);
							events.push(cardDaTool);
							config.writer?.(fechaBalao);
							await pausaDeConversa(RITMO.falaParaCard);
							config.writer?.(cardDaTool);
							streamedArtifactIds.push(artifactId);
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
							if (artifactType === "simulation_result") simulouRef.apresentou = true;
							if (
								(artifactType === "recommendation_card" || artifactType === "simulation_result") &&
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
									// FIX-375: mesma lacuna do FIX-374/375 — sem isto, a re-âncora
									// via tool-result (present_recommendation_card/simulate_quota)
									// apagava o `availableSlots` real que `discovery.ts` já tinha
									// propagado no reveal, e o card de escassez pós-fechamento
									// (FIX-372) nunca tinha o que mostrar.
									...(num(p.availableSlots) != null
										? { availableSlots: num(p.availableSlots) }
										: {}),
								};
							}
						}
					}
				}
				// ToolNode NUNCA lança em tool desconhecida — devolve ToolMessage de
				// erro (status "error"). É a garantia estrutural de "0 NoSuchToolError"
				// desta fundação (crítico ALTA-2): o toolset what-if é fechado e
				// pequeno, mas mesmo uma alucinação de nome de tool não derruba o turno.
				const { messages: toolMessagesBrutas } = await toolNode.invoke(
					{ messages: [aiMessage] },
					config,
				);
				// B14.2 (FIX-436) — o card descartado não volta ao modelo como SUCESSO.
				const toolMessagesCruas = toolResultsComRecusaDeCard(toolMessagesBrutas, cardsSemFonte);
				// FIX-431: o turno não cai, mas o ERRO CRU ("Error: Tool "search_groups"
				// not found. Please fix your mistakes.") ia inteiro pro contexto do
				// modelo, que o traduzia pro cliente como "tive um problema técnico" e,
				// em prod (2026-08-13, sessão a68b1945), acabou em handoff com a venda
				// perdida. Aqui o erro vira instrução de conduta e, no mesmo passo,
				// vira SCORE — é o fato do servidor, não a fala do modelo, que alimenta
				// o alerta.
				const { mensagens: toolMessages, falhas } = reescreverToolMessagesComFalha(
					toolMessagesCruas,
					// A conduta certa depois de uma tool ausente depende de a busca já
					// ter acontecido: com os cards na tela, "colete o próximo dado" faz
					// o agente repetir pergunta respondida (FIX-431 P1 #12).
					{ buscaJaFeita: state.funnel.revealCompleted === true },
				);
				if (falhas.length > 0) registrarFalhasDeTool(falhas);
				toolsRecusadas.push(...toolsQueRecusaram(toolMessagesCruas));
				// O reposicionamento de faixa só vale se a tool tiver mesmo ajustado.
				// `ajustar_por_parcela` recusa quando não há oferta ancorada — e nesse
				// caso o servidor NÃO pode escrever o ajuste pelas costas do modelo
				// (ver o pedido pendente, mais acima).
				for (const pendente of ajustesPendentes) {
					if (!toolAceitouPedido(toolMessagesCruas, pendente.toolCallId)) continue;
					// A tool CALCULAR e o servidor APLICAR são coisas diferentes.
					//
					// Desde que as tools passaram a ler o estado do turno, o cálculo
					// funciona já no turno da descoberta — e é bom que funcione: o modelo
					// consegue dizer "com R$ 1.800 a carta fica em torno de R$ 70 mil".
					// Mas TROCAR a faixa de busca ali seria decidir pelo cliente antes de
					// mostrar a ele a primeira opção: ele pediu um carro de R$ 238 mil e
					// não reclamou de parcela nenhuma — a objeção "essa parcela não cabe"
					// só existe depois que ele VÊ a parcela. Um vendedor apresenta o que
					// achou, explica o que R$ 1.800 compra, e deixa a pessoa escolher.
					if (state.apresentaOfertaNesteTurno) continue;
					novaFaixaRef.faixa = pendente.faixa;
				}
				ajustesPendentes.length = 0;
				loopMessages = [...loopMessages, ...toolMessages];
				newMessages.push(...toolMessages);
				// Só volta pro modelo se alguma das tools trouxe informação nova. Ver
				// `pedeFalaDepoisDasTools`: card não pede comentário, dado pede.
				if (!pedeFalaDepoisDasTools(aiMessage.tool_calls.map((c) => c.name))) break;
			}
		};

		// No turno do reveal o beat é ÚNICO e só apresenta — nenhuma pergunta pode
		// sair nele. Como a pergunta sai na ORDEM em que o modelo escreve (e não
		// guardada pro fim), o bloqueio precisa estar ligado ANTES do beat.
		if (turnoDeApresentacao) filter.descartarPerguntaSegurada();
		await executarBeat();

		if (turnoDeApresentacao) {
			// O TURNO DA BUSCA SÓ APRESENTA. A PERGUNTA É DO TURNO SEGUINTE.
			//
			// Visto ao vivo (Kairo, 2026-07-30): o mesmo turno dizia "Encontrei uma
			// excelente opção pra você: carta de R$ 180.339 no Itaú" e, três linhas
			// abaixo, "ANTES de eu te indicar a melhor opção, você já fez consórcio
			// antes?". As duas falas se contradizem — ele já tinha indicado. Um
			// vendedor mostra o que achou, deixa a pessoa OLHAR, e pergunta na próxima
			// vez que abre a boca.
			//
			// Então o segundo beat (a pergunta do gate) SAIU daqui. O gate segue ativo
			// no estado: `emitCard` não emite os chips neste turno (senão eles caem
			// órfãos, sem pergunta nenhuma acima), e no turno seguinte o funil pergunta
			// normalmente, com os chips colados na pergunta.
			//
			// `flushPending` (não `flush`): libera a cauda MAS não a pergunta segurada
			// — e logo em seguida a descartamos. A instrução "não pergunte agora" não
			// bastava; o modelo emendava a pergunta no fim do anúncio.
			const cauda = filter.flushPending();
			if (cauda) {
				const ev: TurnEvent = { type: "text-delta", text: cauda };
				config.writer?.(ev);
				events.push(ev);
			}

			// ⚠️ AQUI MORAVA UMA "RECUPERAÇÃO DE TURNO MUDO" QUE EU REMOVI.
			//
			// A ideia era: se o beat de apresentação não produziu texto, repetir o
			// beat instruindo o modelo a só apresentar — porque turno mudo no
			// WhatsApp aciona o `empty-turn-guard` (adapter.ts), que re-cobra o gate
			// de coleta e faz o agente pedir o CPF de novo.
			//
			// MEDIDO antes de commitar: ela disparava em 19 de 19 cenários do
			// `escolher_cota` (o filtro poda a fala do beat 1 com muito mais
			// frequência do que eu supus) e COMIA a chamada seguinte do modelo — a
			// que trazia a tool. Resultado: `escolha: undefined`, 5 testes vermelhos,
			// e em produção uma chamada de LLM extra em todo reveal.
			//
			// Fica registrado pra não ser reinventado: o turno mudo é real, mas a
			// solução não é falar mais — é o guard do canal não tratar um turno que
			// ENTREGOU CARDS como se ninguém tivesse dito nada.
			config.writer?.({ type: "text-boundary" });
			events.push({ type: "text-boundary" });
			// Os CARDS entram AGORA, logo abaixo da fala que os anunciou — e um de
			// cada vez, com respiro entre eles. Emitir aqui (e não no `persist`) é
			// seguro porque `artifact` é o único evento que os adapters desenham sem
			// reler a meta do banco; `gate`/`meta-update` continuam esperando a
			// escrita. O `persist` grava todos e pula os já emitidos.
			let primeiro = true;
			for (const ev of state.events) {
				if (ev.type !== "artifact") continue;
				await pausaDeConversa(primeiro ? RITMO.falaParaCard : RITMO.cardParaCard);
				primeiro = false;
				config.writer?.(ev);
				streamedArtifactIds.push(ev.toolCallId);
			}

			// A ÂNCORA: o turno não pode fechar largando os cards e sumindo.
			//
			// Visto ao vivo (Kairo, 2026-07-30): tirar a pergunta do funil daqui
			// resolveu a contradição, mas deixou o turno terminar no carrossel, sem
			// nada convidando o cliente a reagir. Vendedor não faz isso — ele mostra e
			// pergunta "alguma dessas te chamou atenção?".
			//
			// A diferença pro que estava errado antes é o ASSUNTO da pergunta: aqui ela
			// é sobre o que ESTÁ NA TELA, não sobre o histórico do cliente. Por isso o
			// contexto do gate NÃO entra neste beat — sem ele, o modelo não tem como
			// puxar a pergunta de experiência, e a âncora nasce do que ele acabou de
			// mostrar. As palavras continuam dele.
			// A ÂNCORA NÃO ROLA ENQUANTO O FUNIL AINDA PRECISA COLETAR UM DADO.
			//
			// Visto em PRODUÇÃO, no WhatsApp (Kairo, 2026-07-30): com o gate de coleta
			// ainda aberto, este beat "completou" a frase amputada do beat 1 pedindo o
			// CPF — que o cliente já tinha mandado dois minutos antes. Pedir de novo um
			// documento que a pessoa acabou de entregar é o pior tipo de repetição:
			// parece que o sistema perdeu o dado dela.
			//
			// Nesses gates quem conduz é o funil, com pergunta própria e determinística;
			// uma segunda fala do modelo aqui só tem como atrapalhar. Nos demais casos
			// (o normal pós-reveal) a âncora continua fechando o turno.
			const GATES_DE_COLETA = new Set(["name", "identify", "credit", "desire"]);
			if (!GATES_DE_COLETA.has(String(gateAtivo ?? ""))) {
				await pausaDeConversa(RITMO.cardParaFala);
				const deixaDaAncora = new HumanMessage(
					"[instrução do sistema — o cliente NÃO vê este texto, não o repita] Feche o turno " +
						"com a âncora, em mensagem separada e curta.",
				);
				filter.liberarPerguntas();
				newMessages.push(deixaDaAncora);
				loopMessages = [
					montarSystem(
						`Os cards com as opções JÁ estão na tela, logo abaixo da sua mensagem. Feche com ` +
							`UMA frase curta convidando o cliente a reagir ao que ele está vendo — qual delas ` +
							`chamou a atenção dele, o que achou. É só isso: não puxe assunto novo, não peça ` +
							`dado nenhum, não pergunte sobre a experiência dele com consórcio e não repita os ` +
							`números que você já disse.`,
						// Este beat roda sem tools: a janela não pode mandar chamar nenhuma.
						false,
					),
					...loopMessages.slice(1),
					deixaDaAncora,
				];
				// Marco: o que a âncora entregar vem DEPOIS daqui. Se nada vier, o
				// `emit-card` devolve a pergunta do funil em vez de suprimi-la.
				ancoraCharsRef.antes = events
					.map((ev) => (ev.type === "text-delta" ? ev.text : ""))
					.join("").length;
				await executarBeat(false);
			}
		} else {
			// CARD DE DADO NÃO DEIXA O TURNO MUDO (L4).
			//
			// O modelo chamou uma tool de apresentação sem escrever nada antes. Como
			// tool de apresentação encerra o loop (`pedeFalaDepoisDasTools`), o turno
			// acabava no card — o cliente via um número na tela sem uma palavra que o
			// explicasse. O dado PEDE comentário; ele simplesmente não veio.
			//
			// Mesma máquina da âncora do reveal logo acima: um beat extra, SEM tools,
			// com o fato no system. As PALAVRAS continuam do modelo — aqui só se garante
			// que ele fale sobre o que já está na tela, sem inventar número novo.
			const caudaDoCard = filter.flushPending();
			if (caudaDoCard) {
				const ev: TurnEvent = { type: "text-delta", text: caudaDoCard };
				config.writer?.(ev);
				events.push(ev);
			}
			const textoJaEntregue = events
				.map((ev) => (ev.type === "text-delta" ? ev.text : ""))
				.join("");
			const cardsDeDado = events
				.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
				.map((ev) => ev.artifactType)
				.filter((tipo) => CARDS_DE_DADO.has(tipo));
			if (cardsDeDado.length > 0 && textoJaEntregue.trim().length === 0) {
				await pausaDeConversa(RITMO.cardParaFala);
				const deixaDoCard = new HumanMessage(
					"[instrução do sistema — o cliente NÃO vê este texto, não o repita] O card que você " +
						"acabou de entregar está na tela e o turno está sem uma palavra sua sobre ele. " +
						"Escreva agora a frase que acompanha esse card.",
				);
				filter.liberarPerguntas();
				newMessages.push(deixaDoCard);
				loopMessages = [
					montarSystem(
						`Você acabou de entregar um card ao cliente (${cardsDeDado.join(", ")}) e não escreveu ` +
							`nada junto. Escreva UMA frase curta, na sua voz, dizendo o que esse dado significa ` +
							`pra ele. Use SOMENTE os números que você mesmo colocou no card: é PROIBIDO inventar ` +
							`valor, prazo, parcela ou administradora. Não faça pergunta nova, não puxe assunto que ` +
							`não seja o card e não repita o card.`,
						// Este beat roda sem tools: a janela não pode mandar chamar nenhuma.
						false,
					),
					...loopMessages.slice(1),
					deixaDoCard,
				];
				await executarBeat(false);
			}
		}

		// O card só cala a pergunta canônica quando o MODELO já perguntou. Olhar só
		// a pergunta SEGURADA no filtro não bastava: com dois beats, o `flush()` do
		// meio zera o que o beat 1 segurou, e se o beat 2 sai sem interrogação o
		// turno era classificado como "ninguém perguntou" — o card emitia a pergunta
		// canônica embaixo dos cards, repetindo o que o agente já tinha acabado de
		// dizer. Qualquer interrogação emitida NESTE turno conta.
		// Cortesia ("Tudo certo?") não conta como pergunta em NENHUM dos dois
		// caminhos: ela não pede dado nenhum, e tratá-la como pergunta apagava a
		// canônica do gate no WhatsApp — cliente sem nada pra responder, funil
		// parado no primeiro turno (trace be5cc1e6, produção 2026-08-10).
		const textoDoTurno = events.map((ev) => (ev.type === "text-delta" ? ev.text : "")).join("");
		// RECONCILIAÇÃO FALA × CATÁLOGO — o sinal que mede a ADESÃO ao dado.
		//
		// O contexto passou a carregar os números reais da tela, e mesmo assim o
		// agente convidou o cliente a "esticar pra algo entre R$ 300 e R$ 400" em
		// 4 de 10 rodadas medidas — com o R$ 484,16 correto disponível no mesmo
		// turno. Injetar não é aderir, e sem medida isso é anedota.
		//
		// Não é lista de frases: a âncora é o intervalo real do catálogo NAQUELE
		// turno. A mesma fala é violação com um catálogo e correta com outro.
		registrarFalaContraCatalogo({
			falaDoAgente: textoDoTurno,
			parcelasDoCatalogo: ofertasExibidas
				.map((o) => o.monthlyPayment)
				.filter((p): p is number => typeof p === "number" && p > 0),
		});
		const modelAskedQuestion = filter.hasHeldQuestion() || contemPerguntaQueOcupaCota(textoDoTurno);
		const tail = filter.flush();
		// FIX-431 (P2 #14): por que a fala do turno encolheu. O sanitizer sempre
		// soube (`droppedSegmentReasons`), e a informação morria nele — o turno
		// mudo da sessão `04fda013` apareceu no painel como silêncio sem causa.
		registrarFalaPodada(filter.droppedSegmentReasons());
		registrarToolsRecusadas(toolsRecusadas);
		if (tail) {
			const ev: TurnEvent = { type: "text-delta", text: tail };
			config.writer?.(ev);
			events.push(ev);
		}
		// A pergunta foi a DO NOME? Só depois do `flush()`, porque a pergunta fica
		// SEGURADA no filtro até aqui (é assim que a última pergunta vence a
		// anterior) — computar antes leria o turno sem justamente a frase que
		// interessa. Sem essa distinção o card do gate `name` saía embaixo de uma
		// pergunta sobre o imóvel e roubava a resposta dela (ver
		// `deveEmitirCardDeNome`).
		const modelAskedForName = perguntouONome(textoDoTurno + tail);
		// O estreito, que autoriza a ESCRITA do nome em `captureAnswerNode`. O
		// largo acima continua decidindo só se o card sai junto com a fala.
		const pedidoDeNomeExplicito = pediuONomeExplicitamente(textoDoTurno + tail);

		// FIX-431 (P1 #11) — O MODELO PRECISA SABER O QUE NÃO FOI ENTREGUE.
		//
		// O checkpointer guarda a fala CRUA do modelo, e o cliente recebe a fala
		// PODADA. A partir do turno seguinte o modelo relê como dita uma frase que
		// ninguém ouviu — na sessão `a68b1945` ele "lembrava" de ter prometido
		// "deixa eu buscar os melhores grupos… 🔍", promessa que o sanitizer havia
		// cortado, e o prompt manda cumprir o que foi prometido.
		//
		// Reescrever a mensagem persistida quebraria o par `tool_call`/
		// `tool_result` (contrato da API). A anotação resolve o mesmo problema
		// sem tocar no que já está lá: é FATO do servidor, no formato de
		// instrução de sistema que a casa já usa nos directives.
		const podados = filter.droppedSegmentReasons();
		if (podados.length > 0) {
			newMessages.push(
				new HumanMessage(
					`[instrução do sistema — o cliente NÃO vê este texto] Parte da sua última fala NÃO chegou ao cliente (filtro do servidor: ${podados.join(", ")}). Não conte com nada que você disse ali: se era uma promessa ou um anúncio, ele não ouviu.`,
				),
			);
		}

		// A âncora foi tentada e não entregou nada? Medido depois do `flush()`, de
		// propósito: o que ela escreveu pode ter ficado retido no filtro até aqui,
		// e olhar antes contaria como silêncio uma fala que o cliente recebeu.
		// TODO artifact deste turno conta — não só os do beat da âncora.
		//
		// A primeira versão fatiava a partir de um marco, para pegar "só o que a
		// âncora emitiu". Era código morto por duas razões, e as duas importam: o
		// beat da âncora roda SEM tools (`executarBeat(false)`), então nunca emite
		// artifact nenhum; e `events` nasce vazio a cada turno, então não existe
		// "card de turno anterior" de que o slice protegesse. Resultado: a lista
		// chegava sempre vazia e o predicado degenerava no antigo — só caracteres.
		//
		// A pergunta que importa não é "quem emitiu", é "o cliente tem o que
		// responder AGORA?". O `quick_reply` do incidente nasce no beat principal,
		// e ele conduz igual.
		const artifactsDoTurno = events
			.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
			.map((ev) => ev.artifactType);
		const ancoraFalhou = !ancoraEntregouAlgo({
			charsAntes: ancoraCharsRef.antes,
			charsDepois: (textoDoTurno + tail).length,
			artifactsDoBeat: artifactsDoTurno,
		});

		return {
			messages: newMessages,
			events,
			modelAskedQuestion,
			modelAskedForName,
			pedidoDeNomeExplicito,
			ancoraFalhou,
			streamedArtifactIds,
			...(deveExplicarComoFunciona ||
			handoffRef.pedido ||
			ancoraRef.nova ||
			novaFaixaRef.faixa ||
			escolhaRef.cota ||
			escolhaOfertadaRef.groupIds ||
			simulouRef.apresentou ||
			(state.isUserTurn && state.funnel.escolhaOfertada)
				? {
						funnel: {
							...state.funnel,
							...(simulouRef.apresentou ? { simulacaoApresentada: true } : {}),
							// A pergunta de escolha vale para o turno SEGUINTE, e só para ele:
							// o turno do cliente a consome, respondida ou não. Sem consumir,
							// um "a de menor parcela" solto três turnos depois ancoraria uma
							// escolha que ninguém tinha pedido agora.
							...(escolhaOfertadaRef.groupIds
								? { escolhaOfertada: { groupIds: escolhaOfertadaRef.groupIds } }
								: state.isUserTurn
									? { escolhaOfertada: undefined }
									: {}),
							...(novaFaixaRef.faixa
								? {
										// NÃO zere `discoveredCreditTarget` aqui. Ele é o snapshot da
										// faixa REALMENTE buscada da última vez, e `deveDescobrir`
										// (route.ts) só reabre a busca quando ele EXISTE e diverge do
										// `creditMax` novo — `undefined` é o fail-safe anti-loop, que
										// tranca a descoberta em vez de liberá-la.
										//
										// Zerei numa primeira versão achando que "limpar o snapshot"
										// forçaria a re-busca; faz o contrário. Custou uma venda ao
										// vivo: a cliente disse que só cabia R$ 1.800/mês, o funil
										// gravou a faixa nova certinho, o agente prometeu QUATRO vezes
										// que as cartas iam aparecer, nenhuma apareceu, e ela saiu
										// dizendo "o que cabe no meu bolso vocês não têm de verdade".
										// Deixando o valor antigo, `creditMax !== discoveredCreditTarget`
										// vira true e a descoberta roda na faixa nova.
										// O que vai ao ESTADO é a parcela e o discriminante do alvo.
										// O crédito derivado da parcela fica de fora: ele existe
										// para o modelo narrar a ordem de grandeza, e como alvo de
										// busca é justamente o número abaixo do piso que esvaziou
										// quatro buscas seguidas.
										qualifyAnswers: {
											...state.funnel.qualifyAnswers,
											parcelaAlvo: novaFaixaRef.faixa.parcelaAlvo,
											alvoDeBusca: "parcela" as const,
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
							// DEPOIS da âncora do card, de propósito: quando o cliente escolhe
							// explicitamente, a escolha dele ganha do que o servidor tinha
							// apresentado. Era ao contrário na prática — ele escolhia a carta
							// de R$ 120 mil e o contrato saía com a de R$ 132 mil que o
							// sistema havia recomendado antes.
							...(escolhaRef.cota
								? {
										recommendedOffer: {
											...(escolhaRef.cota.groupId ? { groupId: escolhaRef.cota.groupId } : {}),
											...(state.funnel.currentCategory
												? { category: state.funnel.currentCategory }
												: {}),
											administradora: escolhaRef.cota.administradora,
											creditValue: escolhaRef.cota.creditValue,
											termMonths: escolhaRef.cota.termMonths,
											monthlyPayment: escolhaRef.cota.monthlyPayment,
											// Só o da cota escolhida. Ausente é melhor que errado: herdar o
											// lance médio do grupo anterior fazia a conversa citar um número
											// que não pertencia a esta cota.
											avgBidValue: escolhaRef.cota.avgBidValue,
											// FIX-375: mesma regra do avgBidValue acima — sem isto, escolher
											// uma cota aqui apagava o `availableSlots` real propagado no
											// reveal (FIX-374), e o card de escassez pós-fechamento (FIX-372)
											// nunca tinha o que mostrar.
											availableSlots: escolhaRef.cota.availableSlots,
										} as FunnelState["recommendedOffer"],
										...(escolhaRef.cota.administradora
											? { recommendedAdministradora: escolhaRef.cota.administradora }
											: {}),
										escolha: {
											...(escolhaRef.cota.groupId ? { groupId: escolhaRef.cota.groupId } : {}),
											administradora: escolhaRef.cota.administradora,
											creditValue: escolhaRef.cota.creditValue,
											termMonths: escolhaRef.cota.termMonths,
											monthlyPayment: escolhaRef.cota.monthlyPayment,
											origem: "mencao" as const,
										},
										// FIX-413 — a COTA DO CONTRATO. Este é um dos dois caminhos
										// autorizados a amarrar dinheiro: o `groupId` veio da tool,
										// foi conferido contra as ofertas REALMENTE exibidas nesta
										// conversa, e o efeito é vetado em turno de recusa
										// (FIX-405/410). O outro caminho é o clique de card
										// (route.ts). Texto livre não escreve aqui — é essa a
										// parede que dez revisões pediram.
										contractOffer: {
											...(escolhaRef.cota.groupId ? { groupId: escolhaRef.cota.groupId } : {}),
											administradora: escolhaRef.cota.administradora,
											creditValue: escolhaRef.cota.creditValue,
											termMonths: escolhaRef.cota.termMonths,
											monthlyPayment: escolhaRef.cota.monthlyPayment,
										} as FunnelState["contractOffer"],
									}
								: {}),
						},
					}
				: {}),
		};
	};
}

export { toBaseMessage };
