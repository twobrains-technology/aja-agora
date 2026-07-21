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
import type { AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { EphemeralTextFilter } from "@/lib/agent/orchestrator/sanitizer";
import { GATE_INTENT } from "@/lib/agent/orchestrator/system-context";
import { shouldAskMotive } from "@/lib/agent/qualify-state";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { projectToMeta } from "../emit";
import { cacheableSystemBlock } from "../provider";
import type { AgentGraphStateType } from "../state";
import { buildLangGraphTools } from "../tool-adapter";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import type { ArtifactType } from "@/lib/chat/types";
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
	"present_contemplation_dial",
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
		const valorDoBem = state.funnel.qualifyAnswers.creditMax;
		const blocoEmbutido = valorDoBem
			? `Regra do lance embutido (fato, não opinião): o embutido sai DA PRÓPRIA CARTA, até ` +
				`${pctEmbutido}% dela — então o crédito que o cliente recebe DIMINUI nessa proporção. ` +
				`O bem que ele quer custa ${brl(valorDoBem)}. Se ele usar o teto de ${pctEmbutido}% de ` +
				`embutido, uma carta de ${brl(valorDoBem)} deixaria só ` +
				`${brl(Math.round(valorDoBem * (1 - pctEmbutido / 100)))} na mão dele — não dá pra comprar ` +
				`o bem. Pra ele RECEBER ${brl(valorDoBem)} líquidos usando o embutido, a carta precisa ser ` +
				`de aproximadamente ${brl(Math.round(valorDoBem / (1 - pctEmbutido / 100)))}. É assim que ` +
				`um vendedor bom resolve o caso de quem não tem dinheiro pro lance: sobe a carta, não ` +
				`corta o crédito. Use esses números quando o assunto for lance/embutido; nunca invente outros.`
			: null;

		// A busca já rodou (nó `discovery`, agora ANTES deste) — os cards com as
		// ofertas REAIS já estão montados. Sem este bloco o modelo não sabia disso e
		// prometia "só um segundo que já te trago", como se a busca ainda fosse
		// acontecer. Os NÚMEROS vêm daqui (do estado, coagidos contra o grupo real),
		// nunca da cabeça dele; a APRESENTAÇÃO é dele.
		const oferta = state.funnel.recommendedOffer;
		const temCardsDeOferta = state.events.some((ev) => ev.type === "artifact");
		// Critério VERIFICÁVEL da recomendação — o cliente consegue conferir na
		// lista que acabou de ver. O card hero vinha MUDO: aparecia sem nenhuma
		// frase dizendo em QUÊ aquela opção é a melhor, e o cliente tinha que abrir
		// um acordeão pra descobrir. "Melhor opção" sem dizer melhor em quê não
		// vende — e, pior, soa a truque.
		const blocoOfertas =
			temCardsDeOferta && oferta
				? `As ofertas REAIS das administradoras já foram buscadas e os cards aparecem na ` +
					`tela logo abaixo da sua fala. A que melhor atende: ${oferta.administradora} — carta de ` +
					`${brl(oferta.creditValue)}, parcela de ${brl(oferta.monthlyPayment)} em ` +
					`${oferta.termMonths} meses. Apresente como um vendedor de consórcio experiente: ` +
					`diga o que encontrou, aponte o que chama atenção nesses números e por quê. ` +
					`NUNCA diga que vai buscar ou que "já já traz" — a busca já aconteceu.`
				: null;
		const systemMessage = new SystemMessage({
			content: [
				cacheableSystemBlock(leanSystemPrompt()),
				...(blocoOfertas ? [{ type: "text" as const, text: blocoOfertas }] : []),
				...(blocoEmbutido ? [{ type: "text" as const, text: blocoEmbutido }] : []),
				...(gateContextText ? [{ type: "text" as const, text: gateContextText }] : []),
			],
		});

		const newMessages: BaseMessage[] = state.isUserTurn ? [new HumanMessage(state.userText)] : [];
		let loopMessages: BaseMessage[] = [systemMessage, ...state.messages, ...newMessages];

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

		for (let i = 0; i < MAX_TOOL_LOOP_ITERATIONS; i++) {
			const stream = await boundModel.stream(loopMessages);
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
			const aiMessage = new AIMessage({ content: merged.content, tool_calls: merged.tool_calls });
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
						events.push({ type: "text-boundary" });
						events.push({
							type: "artifact",
							artifactType,
							payload: call.args,
							toolCallId: call.id ?? crypto.randomUUID(),
						});
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

		// ANTES do flush: `flush()` libera e zera a pergunta segurada.
		const modelAskedQuestion = filter.hasHeldQuestion();
		const tail = filter.flush();
		if (tail) {
			const ev: TurnEvent = { type: "text-delta", text: tail };
			config.writer?.(ev);
			events.push(ev);
		}

		return { messages: newMessages, events, modelAskedQuestion };
	};
}

export { toBaseMessage };
