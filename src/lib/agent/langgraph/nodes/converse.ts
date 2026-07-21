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
		const valorDoBem =
			state.funnel.qualifyAnswers.valorDoBemAlvo ?? state.funnel.qualifyAnswers.creditMax;
		const jaAceitouEmbutido = state.funnel.qualifyAnswers.lanceEmbutido === true;
		const blocoEmbutido = valorDoBem
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

		// ── O LANCE DELE ALCANÇA? ──
		// O cliente diz "tenho 100 mil", o card mostra lance médio de R$ 183 mil, e
		// o agente respondia "baita empurrão!" sem ligar os dois pontos — porque a
		// comparação não existia no contexto dele, só no card. Um vendedor faz essa
		// conta na hora e é ela que abre o embutido de forma natural. Comparação
		// numérica é invariante → nasce aqui; a fala continua sendo dele.
		const lanceDele = state.funnel.qualifyAnswers.lanceValue;
		const lanceMedio = oferta?.avgBidValue;
		const blocoLance =
			lanceDele && lanceMedio
				? lanceDele >= lanceMedio
					? `O lance que ele tem (${brl(lanceDele)}) JÁ ALCANÇA o lance médio desse grupo ` +
						`(${brl(lanceMedio)}). Diga isso com clareza — é a posição dele, não uma promessa de ` +
						`contemplação, que ninguém pode garantir.`
					: `ATENÇÃO, o fato mais importante deste momento: o lance que ele tem ` +
						`(${brl(lanceDele)}) NÃO alcança o lance médio desse grupo (${brl(lanceMedio)}) — ` +
						`faltam ${brl(lanceMedio - lanceDele)}. Não elogie o valor dele e siga em frente como ` +
						`se estivesse resolvido: diga onde ele está, sem drama, e mostre a saída — é ` +
						`exatamente para isso que existe o lance embutido, que completa a diferença usando ` +
						`parte da própria carta, sem ele tirar mais nada do bolso. Nunca prometa ` +
						`contemplação: lance médio é posição, não garantia.`
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
					`NUNCA diga que vai buscar ou que "já já traz" — a busca já aconteceu.`
				: null;
		const montarSystem = (conducao: string | null) =>
			new SystemMessage({
				content: [
					cacheableSystemBlock(leanSystemPrompt()),
					...(blocoOfertas ? [{ type: "text" as const, text: blocoOfertas }] : []),
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
		let loopMessages: BaseMessage[] = [systemBeat1, ...state.messages, turnMessage];

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
		};

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
			filter.descartarPerguntaSegurada();
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

		return { messages: newMessages, events, modelAskedQuestion, streamedArtifactIds };
	};
}

export { toBaseMessage };
