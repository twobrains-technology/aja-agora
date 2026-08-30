// Nó `emitCard` — traduz a decisão de rota (`state.gate`, calculada pelo nó
// `route`) em `TurnEvent`s determinísticos: o evento `gate` (pro input
// estruturado do gate ativo) + os cards server-side da coreografia
// (FIX-360/361) — sempre via builder determinístico (`server-cards.ts`),
// NUNCA dependente de tool-call do LLM (crítico "tool sumida",
// FIX-246/253/280/309). FIX-361: toda emissão passa por
// `evaluateArtifactGuards` (`guarded-artifact.ts`) — 2ª linha de defesa
// contra pós-fechamento/re-reveal/duplicação intra-turno.
//
// O `contract_form` (passo 5) TAMBÉM nasce aqui — ficou de fora da rodada 1 e
// isso abriu o buraco do fecho: o funil terminava mudo e quem dizia "bora
// fechar" ouvia "fico por aqui então". `real_offer`/`signature_handoff` e o
// resto da cerimônia seguem no handler de `offer-confirm` (route.ts), que roda
// depois do submit do formulário.
//
// NÃO empurra via `config.writer` (mesma nota de `discovery.ts`) — "gate"
// dispara `reloadMeta` fresco no adapter (web/adapter.ts:308); só é seguro
// entregar depois que `persist` gravar. `run-turn.ts` drena do estado final.

import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { enrichContractFormPayload } from "@/lib/agent/orchestrator/contract-form-prefill";
import {
	buildDecisionPromptCard,
	buildEmbeddedBidCard,
	buildScarcityCard,
	buildTopicPickerCard,
	buildTwoPathsCard,
} from "@/lib/agent/orchestrator/server-cards";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { decideShowGate, type Gate, nextGate } from "@/lib/agent/qualify-state";
import { loadIdentity } from "@/lib/conversation/identity";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType, FunnelState } from "../state";

/** FIX-372 (rodada 4): condição pura da rede de segurança de escassez — cliente
 * DECIDIDO (`intent === "ready_to_proceed"`) ancora `escolha` no nó `advance`
 * antes deste nó rodar, e `nextGate` (qualify-state.ts:421) pula o gate
 * `decision` pra sempre a partir daí (`!meta.escolha` nunca mais é true). Sem
 * esta rede, quem decide rápido (o perfil que MAIS se beneficia do empurrão de
 * urgência) nunca vê o card de escassez — só quem ainda está indeciso o vê,
 * exatamente o oposto do que a rubrica pedia. Extraída como função pura
 * (mesmo padrão do FIX-368) pra ser testável sem montar o grafo inteiro. */
export function shouldEmitLateScarcity(
	gate: Gate | undefined,
	funnel: Pick<FunnelState, "scarcityDispatched" | "qualifyAnswers">,
): boolean {
	return (
		gate === "contract" &&
		!funnel.scarcityDispatched &&
		funnel.qualifyAnswers.hasLance !== "so_parcela"
	);
}

/**
 * O card do gate `name` deve sair NESTE turno?
 *
 * Produção, 2026-08 (conv do Erik): o texto perguntou o imóvel, o card pediu o
 * nome, o cliente respondeu ao card — que é o que tem campo pra digitar — e a
 * pergunta do texto morreu sem resposta. O agente a repetiu no turno seguinte,
 * parecendo um robô. Foi o padrão mais frequente da base.
 *
 * `modelAsked` sozinho não resolve: ele diz que o modelo perguntou ALGUMA
 * coisa, e serve pro card não repetir a pergunta canônica em dobro. Mas quando a
 * pergunta do modelo é sobre outro assunto, calar o card não basta — um campo
 * mudo pedindo nome embaixo de uma pergunta sobre imóvel compete igual.
 *
 * Quem manda é a fala (decisão do Kairo, "card só quando a fala pedir"):
 *   • modelo não perguntou nada → card aparece e faz a pergunta (a rede nunca
 *     cai: sem isto, um turno social deixaria ninguém perguntando);
 *   • modelo perguntou o nome    → card complementa, com o input focado;
 *   • modelo perguntou outra coisa → card cede a vez, UMA vez.
 *
 * O "uma vez" é o que reconcilia isto com o FIX-379 (2026-07-26), que decidiu o
 * OPOSTO a partir de um caso igualmente real: o agente perguntou o valor antes
 * do nome, o cliente ironizou ("Pode me chamar de 100 reais") e a conclusão foi
 * que o card precisa sair pra corrigir o desvio do modelo. Os dois casos são o
 * mesmo fenômeno — o modelo perguntando fora de ordem — julgados de lados
 * opostos, e os dois julgamentos estão certos sobre o próprio risco: atropelar a
 * pergunta do agente (Erik) e ficar refém do modelo (FIX-379).
 *
 * Ceder por um turno paga os dois: a pergunta do agente é respondida, e se o
 * nome ainda não veio no turno seguinte o card entra e o funil retoma a ordem.
 * O pior caso deixa de ser "a venda anda em círculo" e passa a ser "um turno a
 * mais".
 */
export function deveEmitirCardDeNome(args: {
	modelAsked: boolean;
	modelAskedForName: boolean;
	jaAdiouUmaVez?: boolean;
}): boolean {
	if (!args.modelAsked) return true;
	if (args.modelAskedForName) return true;
	return args.jaAdiouUmaVez === true;
}

import { pediuIdentidade } from "@/lib/agent/orchestrator/detect-name-turn";
import { artifactAllowed, type GuardContext } from "./guarded-artifact";

export async function emitCardNode(
	state: AgentGraphStateType,
	config?: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
	const events: TurnEvent[] = [];
	let funnel = state.funnel;

	// Artifacts já emitidos ANTES neste turno (nó `discovery`) — alimenta a
	// regra `card-dup-intraturn` (nunca o mesmo tipo 2x no mesmo turno).
	const turnArtifactTypes = state.events
		.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
		.map((ev) => ev.artifactType);
	const guardCtx: GuardContext = {
		meta: projectToMeta(state),
		userIntent: state.intent ?? "neutral",
		isUserTurn: state.isUserTurn,
		channel: state.channel,
		discoveryCount: null,
		conversationId: state.conversationId,
		turnArtifactTypes,
	};

	// Emissão AO VIVO via `config.writer`. Antes estes eventos só viviam em
	// `state.events` e dependiam do drain do `values` final no `run-turn.ts` —
	// mas o grafo PAUSA no `human` (interrupt) e esse `values` final nunca chega
	// ao chamador. Resultado: o cliente recebia só `text-delta`/`tool-call` (que
	// já iam pelo writer) e NENHUM card jamais renderizava. O writer entrega na
	// ordem em que é chamado, então a ordem do turno é preservada.
	// NO TURNO DO REVEAL O GATE NÃO É NEM EMITIDO NEM CONSUMIDO.
	//
	// O `converse` apenas APRESENTA nesse turno (fala + cards); a pergunta do gate
	// é do turno seguinte. Emitir os chips aqui os deixaria pendurados embaixo dos
	// cards sem pergunta nenhuma acima — o "badge fora de ordem" visto ao vivo
	// (Kairo, 2026-07-30).
	//
	// ⚠️ Só suprimir a EMISSÃO não bastava, e isso custou uma regressão em
	// produção: os blocos abaixo continuavam CONSUMINDO o gate — marcavam
	// `decisionDispatched: true` e emitiam scarcity/decision_prompt no mesmo turno
	// do reveal, onde eles também sumiam. O gate era gasto sem nada aparecer, e no
	// turno seguinte a cascata já tinha pulado pra `contract`: o cliente dizia
	// "bora fechar" e nunca via o card de decisão (cenario-nomear-nao-assina).
	//
	// Então o gate de PERGUNTA fica para o próximo turno. Nada se perde: ele
	// continua ativo no estado (`pendingGate` inclusive) e é recalculado lá.
	//
	// `decision` e `contract` são a EXCEÇÃO, e a distinção importa: eles não fazem
	// pergunta com chips concorrendo com os cards — são o próximo passo do que
	// acabou de ser mostrado ("esse plano faz sentido?" / o formulário). Suspendê-los
	// junto atrasava em um turno inteiro quem chega decidido, que é exatamente o
	// cliente que a gente menos pode fazer esperar.
	// Os gates que SÃO o pedido de ação do turno — eles não cedem a vez para um
	// card, porque são o passo seguinte da venda, não uma pergunta paralela.
	//
	// `identify` entrou aqui em 2026-08-27, junto com a vitrine. Enquanto ele
	// morava antes da busca, nunca disputava turno com card de oferta e a lista
	// estava completa; ao descer para o fecho, passou a viver exatamente onde
	// `recommendation_card` e `simulation_result` são emitidos — e começou a ser
	// engolido por eles. O sintoma, medido no app: `[route] gate=identify
	// show=true`, o agente anunciando "o formulário está aparecendo na tela
	// agora", e nenhum gate no stream. A venda morre no último metro, com o
	// cliente já decidido.
	const GATES_DE_ACAO = new Set(["decision", "contract", "identify"]);

	// UM TURNO, UMA PERGUNTA — vale também pro card que o MODELO emitiu.
	//
	// Visto ao vivo (Kairo, 2026-07-30), WhatsApp: card "Simulação de Cota" com
	// [Tenho interesse!] [Ajustar valor] e, logo abaixo, "Você já fez consórcio
	// antes?" com [É a primeira vez] [Já conheço] [Tenho dúvidas]. Cinco botões,
	// duas perguntas, um turno — responder uma joga a outra fora.
	//
	// `turnArtifactTypes` traz o que já saiu ANTES deste nó (discovery + tools do
	// `converse`). Se algum deles pede ação do cliente, ELE é a pergunta do turno e
	// o gate espera o próximo. Os cards que o próprio `emitCard` emite (embedded_bid,
	// decision_prompt) não entram nessa conta: eles SÃO o gate, não competem com ele.
	const CARDS_QUE_PEDEM_ACAO = new Set([
		"simulation_result",
		"recommendation_card",
		"group_card",
		// 2026-08-27 — `comparison_table` faltava nesta lista, e ela é justamente o
		// card em que o cliente ESCOLHE a cota. Visto no app: quatro cartas na tela
		// e, embaixo, os chips de "você já fez consórcio antes?". A lacuna é antiga;
		// o que mudou foi a frequência — antes a tabela e o `experience` caíam em
		// turnos diferentes, com o gate `identify` entre os dois. Com a carta no
		// primeiro turno, passaram a colidir quase sempre.
		"comparison_table",
		// 2026-08-27 — `quick_reply` é a forma mais comum de o modelo ancorar o
		// turno do reveal ("Folga no bolso" / "Contemplar mais rápido"), e ele
		// pede resposta como qualquer outro CTA. Sem ele aqui, os chips do modelo
		// e os chips do gate caíam juntos: duas perguntas, cinco botões, um turno
		// — reproduzido em cenário (`cenario-chips-conduzem-o-reveal`).
		"quick_reply",
		"decision_prompt",
		"contract_form",
		"two_paths",
		"contemplation_dial",
	]);
	const turnoJaPedeAcao = turnArtifactTypes.some((t) => CARDS_QUE_PEDEM_ACAO.has(t));

	// NINGUÉM DECIDE SOBRE O EMBUTIDO SEM SABER O QUE ELE É.
	//
	// Visto ao vivo (Kairo, 2026-07-30): "Quer considerar esse tipo de lance nas
	// suas simulações? [Sim, considerar] [Sem lance embutido]" — sem que ninguém
	// tivesse explicado o que é lance embutido. O "esse tipo de lance" pressupõe uma
	// explicação que nem sempre chega: o card `embedded_bid` sai UMA vez por conversa
	// e a PERGUNTA reaparece sempre que o gate está ativo.
	//
	// A educação NÃO vem pra cá (FIX-212: nada de aula enlatada no gate). O que muda
	// é a ordem de precedência: sem educação na conversa e sem card saindo agora, a
	// pergunta espera. É uma decisão que REDUZ o crédito que o cliente recebe — ela
	// não pode ser tomada no escuro.
	const educacaoDoEmbutidoSaiNesteTurno =
		state.gate === "lance-embutido" &&
		funnel.qualifyAnswers.lanceEmbutido === undefined &&
		!funnel.qualifyAnswers.embeddedBidDispatched &&
		artifactAllowed(guardCtx, "embedded_bid");
	const perguntaEmbutidoNoEscuro =
		state.gate === "lance-embutido" &&
		!funnel.qualifyAnswers.embeddedBidDispatched &&
		!educacaoDoEmbutidoSaiNesteTurno;

	// O PEDIDO DE CPF NÃO SAI EM DOBRO.
	//
	// `modelAskedQuestion` responde "o modelo fez ALGUMA pergunta" — e pedir CPF
	// quase nunca sai como pergunta ("preciso do seu CPF" é afirmação). Resultado
	// medido em 14/08: 4 de 4 turnos de identidade entregaram o pedido duas vezes,
	// a fala do modelo e, colada, a canônica do canal. É o turno de maior atrito
	// da jornada — pedir o CPF em dobro ali é o pior lugar para soar automático.
	//
	// ⚠️ O predicado é a FALA, e o gate é conferido à parte. Enquanto os dois
	// estavam na mesma expressão (`state.gate === "identify" && pediu…`), a guarda
	// morria exatamente no turno que o recálculo abaixo criou: ali o gate nasce
	// DEPOIS da rota, então `state.gate` é `undefined` por construção e o pedido
	// voltava a sair em dobro — no fecho, o pior turno possível.
	const falaPediuIdentidade = pediuIdentidade(
		state.events.map((ev) => (ev.type === "text-delta" ? ev.text : "")).join(""),
	);
	// O card do nome espera quando a fala do turno perguntou OUTRA coisa — sem
	// isto ele aparecia mudo embaixo de "já tem uma ideia do que procura?" e
	// roubava a resposta da pergunta do agente. Ver `deveEmitirCardDeNome`.
	//
	// `modelAsked` aqui é só `modelAskedQuestion`: o operando que existia ao lado
	// (`state.gate === "identify" && falaPediuIdentidade`) nunca podia ser
	// verdadeiro dentro de um bloco que exige `state.gate === "name"` — dois
	// valores diferentes para o mesmo campo. Era herança do tempo em que o
	// predicado da fala e o do gate viviam na mesma variável.
	const cardDeNomeAtropelaAFala =
		state.gate === "name" &&
		!deveEmitirCardDeNome({
			modelAsked: state.modelAskedQuestion,
			modelAskedForName: state.modelAskedForName,
			jaAdiouUmaVez: funnel.nameCardAdiado,
		});

	// O reveal suprime o gate porque a ÂNCORA fecha o turno — mas só se ela tiver
	// mesmo fechado. Sem `!state.ancoraFalhou`, as duas redes caíam juntas: o gate
	// já tinha sido gasto e a âncora não saiu, então o cliente ficava diante dos
	// cards sem nada a responder (sessão `ff8f2080`, produção 2026-08-13). Quando
	// a âncora conduz, nada muda — o gate continua suprimido e não há pergunta
	// dupla.
	// O GATE OPCIONAL NÃO SE PENDURA SOB A RESPOSTA DE UM CLIQUE (D9).
	//
	// `decideShowGate` devolve `true` para todo turno server-authored de
	// propósito (FIX-206: clique → directive → próximo passo no mesmo turno), e
	// isso vale para os gates de COLETA. Para o `experience` — que é opcional,
	// de uso único e existe para ajudar a vender — o efeito era outro: o cliente
	// pedia os cenários de contemplação e recebia, embaixo da resposta, os chips
	// de "você já fez consórcio antes?". Pergunta que ninguém fez, no meio do
	// assunto que ele pediu; e, na conversa da Rute, o portão ainda foi queimado
	// sem que a pergunta aparecesse em lugar nenhum.
	//
	// Ele espera o turno do cliente. Nada se perde: `nextGate` continua devolvendo
	// `experience` enquanto a resposta não vier.
	const gateOpcionalEmTurnoDoSistema = !state.isUserTurn && state.gate === "experience";

	const revelouSemConduzir = state.apresentaOfertaNesteTurno && state.ancoraFalhou;
	// A rede vale para as DUAS formas de "o card é a pergunta do turno".
	//
	// `revelouSemConduzir` precisa anular tanto a apresentação quanto o
	// `turnoJaPedeAcao` — senão o gate segue suprimido num turno em que a âncora
	// não entregou texto, e o cliente fica olhando os cards sem nada convidando a
	// responder (sessão `ff8f2080`, produção 2026-08-13). Antes de
	// `comparison_table` entrar em `CARDS_QUE_PEDEM_ACAO` isso não aparecia,
	// porque no turno do reveal o único sinal era `apresentaOfertaNesteTurno` —
	// que já era anulado. Com a tabela na lista, os dois precisam ceder juntos.
	const cardEhAPerguntaDoTurno =
		(state.apresentaOfertaNesteTurno || turnoJaPedeAcao) && !revelouSemConduzir;
	const gateDoTurno =
		(cardEhAPerguntaDoTurno && !GATES_DE_ACAO.has(String(state.gate ?? ""))) ||
		perguntaEmbutidoNoEscuro ||
		cardDeNomeAtropelaAFala ||
		gateOpcionalEmTurnoDoSistema
			? undefined
			: state.gate;
	// O FUNIL AVANÇA DEPOIS DE A ROTA JÁ TER DECIDIDO — e é no fecho que isso dói.
	//
	// A ordem dos nós é `routeFinal → converse → emitCard`: o gate é escolhido
	// ANTES de o modelo falar, mas a escolha da cota é gravada DENTRO do
	// `converse` (tool `escolher_cota`). No turno em que o cliente escolhe, a
	// rota ainda via `experience` e não mostrou gate nenhum; o `identify` só
	// passou a existir quando o turno já estava acabando.
	//
	// Medido no app, conversa `213b426b`, com o metadata literal dela na sonda:
	//
	//   nextGate(meta COM a escolha) → "identify"
	//   nextGate(meta SEM a escolha) → "experience"
	//
	//   🤖 "Agora o sistema abre o formulário de contratação com a Itaú"
	//   tela: nenhum card · metadata: pendingGate = "identify"
	//
	// O agente prometeu e a tela não cumpriu; a venda ficou esperando o cliente
	// escrever de novo. Enquanto `identify` morava antes da busca isso não
	// existia — ele nunca dependia de uma tool do próprio turno. A vitrine o
	// trouxe para o fecho, e trouxe o problema junto.
	//
	// O recorte é estreito de propósito: só os GATES DE AÇÃO (que este arquivo já
	// declara serem "o próximo passo do que acabou de ser mostrado"), só em turno
	// do cliente, e só quando o funil de fato mudou dentro do turno. Gate opcional
	// que nasce no meio do caminho continua esperando o turno seguinte.
	//
	// Só `identify` entra aqui, e não os três GATES_DE_ACAO. `decision` e
	// `contract` não têm payload de card próprio (`gatePartData` devolve `null`
	// para os dois) e seus artifacts — `decision_prompt`, `contract_form` — são
	// disparados por blocos que leem `state.gate`, mais abaixo. Emiti-los por aqui
	// seria evento sem tela: a mesma promessa vazia que este bloco existe para
	// acabar, agora parecendo resolvida. Quando um deles nascer no meio do turno,
	// o comportamento segue o de antes (pendência + re-engage) — não pioro, e não
	// finjo cobrir.
	const GATES_QUE_NASCEM_NO_TURNO = new Set(["identify"]);
	const metaAposOTurno = projectToMeta(state);
	const gateAposOTurno = nextGate(metaAposOTurno, {
		hasContactName: Boolean(state.contactName),
	});
	const gateDeAcaoNasceuNesteTurno =
		state.isUserTurn &&
		!gateDoTurno &&
		gateAposOTurno !== state.answeredGate &&
		GATES_QUE_NASCEM_NO_TURNO.has(gateAposOTurno) &&
		// O gate recém-nascido passa pela MESMA porteira que a rota usaria. Sem
		// isto, uma escolha ancorada num turno em que o cliente está perguntando
		// outra coisa despejava o formulário por cima da dúvida dele.
		decideShowGate({
			gate: gateAposOTurno,
			intent: state.intent ?? "neutral",
			meta: metaAposOTurno,
			isUserTurn: state.isUserTurn,
		});
	const gateFinal = gateDoTurno ?? (gateDeAcaoNasceuNesteTurno ? gateAposOTurno : undefined);

	if (gateFinal) {
		// `modelAsked`: o `converse` agora é CIENTE do gate (via `GATE_INTENT`) e
		// faz a pergunta com as palavras dele. Se produziu texto neste turno, o
		// adapter NÃO deve reinjetar a pergunta canônica (`gateQuestion`) — senão
		// vira DUAS perguntas (a do modelo + a do card). Se o modelo ficou mudo
		// (turno vazio), fica `false` → o card injeta a pergunta como rede (nunca
		// cala a pergunta). O `text-boundary`/persist a jusante mantêm a ordem.
		// `modelAsked` = o modelo FEZ UMA PERGUNTA (sinal real do sanitizer,
		// `hasHeldQuestion`), não "emitiu algum caractere". Com o proxy antigo, uma
		// fala social sem pergunta ("Prazer em te ajudar!") calava a pergunta
		// canônica do card — as duas redes caíam juntas e o turno terminava sem
		// ninguém perguntando nada.
		events.push({
			type: "gate",
			gate: gateFinal,
			modelAsked: state.modelAskedQuestion || (gateFinal === "identify" && falaPediuIdentidade),
		});
	}

	// A liberação do hero pendente MUDOU DE LUGAR: vive no `advance`, que roda
	// ANTES do `converse` — só assim o modelo sabe que vai recomendar e fala
	// disso, em vez de já perguntar o prazo com o card caindo embaixo.

	// FIX-360 — `topic_picker`: card ÚNICO pro usuário novato, assim que
	// `experience` resolve (experiencePrev==="first") — independente do gate
	// ativo NESTE turno. `topicPickerDispatched` garante emissão única; sem
	// janela adicional contra `recoConsentDispatched` (diferente do runtime
	// Vercel) porque neste grafo `experience`→`reco-consent` podem resolver
	// no MESMO turno (analyze funde `experiencePrev` antes de `route`
	// computar o próximo gate) — a janela do Vercel nunca seria alcançável
	// aqui.
	// Nunca no MESMO turno de um gate: o picker de tópicos é um convite lateral e
	// competia com a pergunta do funil ("Posso te mostrar a opção que recomendo?"
	// + "Escolha uma opção: Ver tópicos", os dois juntos). Sem gate no turno, ele
	// sai normal; com gate, espera.
	//
	// FIX-425 (Kairo, produção 2026-08-02): a mesma competição existia contra o
	// CONTEÚDO, não só contra o gate. No print, o cliente pediu "Ver outras opções"
	// e o que apareceu foi este menu de dúvidas. Convite lateral não divide turno
	// com o que a pessoa pediu — havendo qualquer card no turno, ele espera o
	// próximo. Turno calmo (sem card e sem gate) continua levando o convite.
	//
	// A marcação de `topicPickerDispatched` desceu pra dentro do `artifactAllowed`:
	// o comentário sempre disse "só é marcado quando de fato saiu", mas o código
	// marcava mesmo quando o guard suprimia — e aí o convite não saía nunca mais.
	const turnoCalmo = turnArtifactTypes.length === 0;
	if (
		!gateDoTurno &&
		turnoCalmo &&
		funnel.experiencePrev === "first" &&
		!funnel.topicPickerDispatched
	) {
		if (artifactAllowed(guardCtx, "topic_picker")) {
			events.push({
				type: "artifact",
				artifactType: "topic_picker",
				payload: buildTopicPickerCard().payload,
				toolCallId: crypto.randomUUID(),
			});
			turnArtifactTypes.push("topic_picker");
			funnel = { ...funnel, topicPickerDispatched: true };
		}
	}

	// FIX-360 — `embedded_bid`: educação + opt-in do lance embutido, emitido
	// enquanto o gate segue sem resposta (o nó `advance` já consome a
	// resposta de texto livre ANTES deste nó rodar — sem loop, FIX-260).
	// Reusa a decisão tomada lá em cima (evita chamar o guard duas vezes e
	// duplicar o log): se a educação sai neste turno, o gate saiu junto.
	if (gateDoTurno === "lance-embutido" && educacaoDoEmbutidoSaiNesteTurno) {
		const meta = projectToMeta({ ...state, funnel });
		events.push({ type: "text-boundary" });
		events.push({
			type: "artifact",
			artifactType: "embedded_bid",
			payload: buildEmbeddedBidCard(meta).payload,
			toolCallId: crypto.randomUUID(),
		});
		turnArtifactTypes.push("embedded_bid");
		funnel = {
			...funnel,
			qualifyAnswers: { ...funnel.qualifyAnswers, embeddedBidDispatched: true },
		};
	}

	if (gateDoTurno === "decision" && !funnel.decisionDispatched) {
		const meta = projectToMeta({ ...state, funnel });
		const soParcela = funnel.qualifyAnswers.hasLance === "so_parcela";

		// FIX-360 — `scarcity` SEMPRE antes do card de decisão (nunca depois),
		// exceto no ramo `so_parcela` (a "agulha" toda é pulada ali, mesma
		// ordem do `dispatchDecisionCascade` Vercel). `buildScarcityCard`
		// devolve `null` sem `groupId` ancorado — nunca fabrica.
		if (!soParcela) {
			const scarcity = buildScarcityCard(meta);
			if (scarcity && artifactAllowed(guardCtx, "scarcity")) {
				events.push({ type: "text-boundary" });
				events.push({
					type: "artifact",
					artifactType: "scarcity",
					payload: scarcity.payload,
					toolCallId: crypto.randomUUID(),
				});
				turnArtifactTypes.push("scarcity");
				funnel = { ...funnel, scarcityDispatched: true };
			}
		}

		const finalArtifactType = soParcela ? "two_paths" : "decision_prompt";
		if (artifactAllowed(guardCtx, finalArtifactType)) {
			events.push({ type: "text-boundary" });
			events.push({
				type: "artifact",
				artifactType: finalArtifactType,
				payload: soParcela
					? buildTwoPathsCard(meta).payload
					: buildDecisionPromptCard(meta).payload,
				toolCallId: crypto.randomUUID(),
			});
		}
		funnel = { ...funnel, decisionDispatched: true };
	}

	// FIX-372 (rodada 4, achado ao vivo pelo orquestrador): cliente DECIDIDO
	// (`intent === "ready_to_proceed"`, ex. "bora fechar", clique em "Tenho
	// interesse") ancora `escolha` no nó `advance` ANTES deste nó rodar —
	// `nextGate` (qualify-state.ts:421) então PULA o gate `decision` pra sempre
	// (`!meta.escolha` nunca mais é true), e o bloco de escassez acima nunca
	// dispara. Resultado observado ao vivo: em 7 conversas reais de teste desta
	// campanha, 0 viram o card de escassez — não por falta de dado da Bevi (a
	// oferta ancorada tinha `availableSlots` real em todas), mas porque o
	// cliente decidido nunca passa pelo gate que o mostra. É exatamente o
	// perfil "com pressa" que mais se beneficiaria do empurrão de urgência.
	// Rede de segurança: se chegou até aqui (`gate === "contract"`, prestes a
	// mostrar o formulário) e a escassez ainda não foi mostrada nesta conversa,
	// mostra AGORA — reforço, não pergunta, então não atrasa o fechamento nem
	// pede confirmação de novo. Mesma regra de nunca fabricar: `buildScarcityCard`
	// retorna `null` sem `groupId`/`availableSlots` reais ancorados.
	if (shouldEmitLateScarcity(gateDoTurno, funnel) && artifactAllowed(guardCtx, "scarcity")) {
		const meta = projectToMeta({ ...state, funnel });
		const scarcity = buildScarcityCard(meta);
		if (scarcity) {
			events.push({ type: "text-boundary" });
			events.push({
				type: "artifact",
				artifactType: "scarcity",
				payload: scarcity.payload,
				toolCallId: crypto.randomUUID(),
			});
			turnArtifactTypes.push("scarcity");
			funnel = { ...funnel, scarcityDispatched: true };
		}
	}

	// PASSO 5 — o formulário que cria a proposta REAL. Era o buraco do fecho: no
	// runtime LangGraph nenhum nó o emitia e a tool `present_contract_form` está
	// fora do toolset (de propósito — ordem de funil é código). Resultado ao
	// vivo: o cliente dizia "bora fechar", o agente respondia "só preciso de uns
	// dados rápidos" e NADA aparecia na tela. A identidade já foi coletada no
	// gate `identify`, então o card vem como CONFIRMAÇÃO (CPF mascarado — o
	// número completo nunca volta pro browser).
	if (
		gateDoTurno === "contract" &&
		!funnel.contractFormDispatched &&
		artifactAllowed(guardCtx, "contract_form")
	) {
		const identity = await loadIdentity(state.conversationId).catch(() => null);
		events.push({ type: "text-boundary" });
		events.push({
			type: "artifact",
			artifactType: "contract_form",
			payload: enrichContractFormPayload(
				{
					conversationId: state.conversationId,
					// FIX-413 — o formulário lê a COTA DO CONTRATO, nunca a cota em
					// FOCO. `recommendedAdministradora` é escrita por resolução de
					// texto (é ela que faz a conversa acompanhar o cliente), e era
					// exatamente por ler esse campo aqui que dez revisões
					// independentes acharam a mesma classe de defeito: uma frase mal
					// interpretada amarrava o contrato na marca errada.
					//
					// Sem ação estruturada o formulário sai SEM administradora — o
					// cliente escolhe — em vez de sair amarrado no palpite do parser.
					// Ausente é melhor que errado, a mesma regra que o `avgBidValue`
					// já segue (FIX-375).
					...(funnel.contractOffer?.administradora
						? { administradora: funnel.contractOffer.administradora }
						: {}),
				},
				identity,
			),
			toolCallId: crypto.randomUUID(),
		});
		turnArtifactTypes.push("contract_form");
		funnel = { ...funnel, contractFormDispatched: true };
	}

	// NÃO emite aqui. Quem entrega "gate"/"artifact" ao cliente é o `persist`,
	// DEPOIS de `persistMeta` — os adapters releem a meta fresca do banco pra
	// montar o card (`reloadMeta`, web/adapter.ts:308). Emitir antes da escrita
	// fazia `gatePartData("credit", metaVelha)` cair no `if (!category) return
	// null` e NENHUM card aparecia na tela. Ordem é contrato, não detalhe.
	void config;
	// O gate `experience` foi perguntado NESTE turno — não pergunta de novo. Ver
	// a nota em `nextGate`: era o único gate opcional sem guarda de idempotência,
	// e reaparecia turno após turno enquanto a resposta não viesse.
	//
	// ⚠️ SÓ EM TURNO DO CLIENTE (D9, conversa da Rute, 19/08/2026). O estado final
	// dela tinha `experienceDispatched = true` e a pergunta não aparece em lugar
	// nenhum da transcrição: o portão foi queimado num turno gerado por INSTRUÇÃO
	// DO SISTEMA (clique que virou directive), em pleno fechamento. Uso único
	// gasto sem ninguém ter perguntado nada — o dado que ajuda a vender some para
	// sempre. Turno do cliente consome normal: ali a pergunta foi de fato feita a
	// ele.
	if (gateDoTurno === "experience" && !funnel.experienceDispatched && state.isUserTurn) {
		funnel = { ...funnel, experienceDispatched: true };
	}
	// Marca que o card do nome já cedeu a vez — no próximo turno ele sai de
	// qualquer jeito, mesmo que o modelo pergunte outra coisa de novo. É o
	// limite que impede o adiamento de virar funil refém do modelo (FIX-379).
	if (cardDeNomeAtropelaAFala && !funnel.nameCardAdiado) {
		funnel = { ...funnel, nameCardAdiado: true };
	}
	return { funnel, events };
}
