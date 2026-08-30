// Nó `persist` — ÚLTIMO nó do grafo. Escreve `messages`/`artifacts`/`meta`
// no shape que a UI/admin/mesa leem — reusa `saveMessage`/`persistMeta`
// tal-e-qual o runtime Vercel (mesmas tabelas, mesmo formato de linha).
//
// ORDEM importa (fix MÉDIA-7 do crítico): `persistMeta` roda ANTES de
// qualquer evento "gate"/"artifact" ser DRENADO pro chamador — os dois
// channel adapters fazem `reloadMeta(conversationId)` fresco do banco no
// handler de "gate" (web/adapter.ts:308), então a escrita tem que existir
// antes do evento sair. Por isso NENHUM nó anterior a este (`discovery`,
// `emitCard`) empurra "artifact"/"gate" via `config.writer` — só
// `text-delta`/`tool-call` (sem dependência de leitura fresca do banco)
// streamam ao vivo. `run-turn.ts` drena os demais tipos de
// `state.events` do ESTADO FINAL do grafo (depois deste nó já ter rodado),
// nunca do stream ao vivo — garantia por TOPOLOGIA, não por timing.

import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations as conversationsTable } from "@/db/schema";
import { turnoEntregouConducao } from "@/lib/agent/conducao";
import { pendingGateAfterTurn } from "@/lib/agent/gate-reengage";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { shouldMarkDoubtsAddressed } from "@/lib/agent/qualify-state";
import { registrarCardEnviado } from "@/lib/conversation/cards";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta } from "@/lib/conversation/meta";
import { registrarEstadoDoFunil } from "@/lib/observability/langfuse/busca-scores";
import { registrarConducao } from "@/lib/observability/langfuse/conducao-scores";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { projectToMeta } from "../emit";
import { pausaDeConversa, RITMO } from "../ritmo";
import type { AgentGraphStateType } from "../state";

/** Texto com cara de directive interno (nunca é o cliente digitando). */
export function pareceDirectiveDeServidor(texto: string): boolean {
	if (texto.length < 400) return false;
	return /\bFLUXO\b|\bFIX-\d+|present_[a-z_]+|simulate_quota|search_groups|NÃO chame|tool-call/i.test(
		texto,
	);
}

export async function persistNode(
	state: AgentGraphStateType,
	config?: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
	const { conversationId, channel, isUserTurn, userText } = state;
	let funnel = state.funnel;
	const persona = funnel.currentPersona;

	// FIX-360 — `doubtsAddressed`: o beat de dúvidas (`experiencePrev ===
	// "doubts"`) resolveu neste turno quando NENHUM artifact saiu (puramente
	// conversacional) e o usuário de fato respondeu. Calculado por ÚLTIMO
	// (precisa do turno inteiro: `state.events` já tem tudo que `converse`/
	// `discovery`/`emitCard` produziram) — só afeta `nextGate` em turnos
	// FUTUROS, nunca o gate já decidido neste.
	// `desireAsked` — marcado na EMISSÃO (mesmo padrão de
	// `consentOffered`/`simulatorOfferDispatched`, e o que o runtime Vercel faz
	// em orchestrator/index.ts:1290). NINGUÉM marcava isto no grafo: `nextGate`
	// batia em `if (!meta.desireAsked) return "desire"` PARA SEMPRE, o funil
	// congelava no `desire` (que não tem card) e nunca chegava em credit →
	// identify → search. Nenhum card, nenhuma busca, nenhuma oferta: a venda
	// inteira morria depois do nome. Marcado AQUI, no último nó, pra só valer
	// nos turnos SEGUINTES — marcar antes do `routeFinal` faria o card do
	// próximo gate atropelar a pergunta do `desire` no mesmo balão.
	if (state.gate === "desire" && !funnel.desireAsked) {
		funnel = { ...funnel, desireAsked: true };
	}

	const producedArtifact = state.events.some((ev) => ev.type === "artifact");
	if (
		shouldMarkDoubtsAddressed({
			meta: { experiencePrev: funnel.experiencePrev, doubtsAddressed: funnel.doubtsAddressed },
			producedArtifact,
			userReplied: isUserTurn,
		})
	) {
		funnel = { ...funnel, doubtsAddressed: true };
	}

	// Salva o turno do usuário e a fala completa do modelo (reconstruída dos
	// text-delta acumulados por `converse` — mesma reconstrução que
	// `runner.ts` faz com `fullResponse`) ANTES dos cards, espelhando a ordem
	// de leitura da UI (texto, depois artifact).
	// Nunca grave prompt de servidor como fala do cliente. `isUserTurn` já é a
	// governança primária; isto é a 2ª linha, porque o custo do furo é altíssimo:
	// o texto contaminado volta em `loadConversationHistory` e o MODELO passa a
	// ler o próprio prompt como se o cliente tivesse dito. Directive tem
	// assinatura reconhecível (tamanho + vocabulário interno) e nunca é digitado.
	if (isUserTurn && userText && !pareceDirectiveDeServidor(userText)) {
		await saveMessage(conversationId, "user", userText, channel);
	}
	// Um turno pode render MAIS DE UM balão (o reveal fala, mostra os cards e
	// volta a falar) — `text-boundary` é a fronteira. Salvar tudo concatenado
	// fazia a retomada devolver os dois balões colados num só.
	const balloes: string[] = [""];
	for (const ev of state.events) {
		if (ev.type === "text-boundary") balloes.push("");
		else if (ev.type === "text-delta") balloes[balloes.length - 1] += ev.text;
	}
	for (const texto of balloes) {
		if (texto.trim().length > 0) {
			await saveMessage(conversationId, "assistant", texto, channel, persona);
		}
	}

	// CARD NENHUM CONTRADIZ A COTA ANCORADA.
	//
	// O hero é montado na descoberta, pelo ranking. Quando o cliente escolhe outra
	// cota no MESMO turno, o card já estava na fila: a fala dizia "essa é a sua
	// cota, R$ 1.289 em 116 meses" e logo acima ficava um card de outra
	// administradora, R$ 3.203, com o botão "Tenho interesse" ativo — um clique
	// ali levava pra cota que ele não escolheu (visto ao vivo no web).
	//
	// Compara com `recommendedOffer` (a âncora ATUAL) e não com `escolha`: a
	// âncora é o que discovery e `escolher_cota` mantêm em dia, então uma busca
	// nova continua podendo apresentar seu próprio hero.
	const ancora = funnel.recommendedOffer?.administradora;
	const contradizAncora = (ev: TurnEvent): boolean => {
		if (ev.type !== "artifact") return false;
		if (ev.artifactType !== "recommendation_card" && ev.artifactType !== "simulation_result") {
			return false;
		}
		if (!ancora) return false;
		const doCard = (ev.payload as { administradora?: unknown } | null)?.administradora;
		return typeof doCard === "string" && doCard.toLowerCase() !== ancora.toLowerCase();
	};

	for (const ev of state.events) {
		if (ev.type !== "artifact") continue;
		if (contradizAncora(ev)) {
			console.log(
				`[persist] card de ${(ev.payload as { administradora?: string })?.administradora} descartado — a cota ancorada é ${ancora}`,
			);
			continue;
		}
		// Mesmo padrão de `emitServerCard` (orchestrator/index.ts): 1 message
		// marcador `[card: tipo]` por artifact, pra o log do admin nunca perder
		// o turno mesmo quando não há texto (BUG-ADMIN-MESSAGE-MISSING).
		//
		// O corpo saiu daqui para `conversation/cards.ts` em 16/08/2026, quando
		// se descobriu que os handlers de clique do WhatsApp mandavam card sem
		// registrar nada — e a conversa auditada depois parecia ter um turno a
		// menos. Um lugar só, para as duas pontas não divergirem de novo.
		await registrarCardEnviado({
			conversationId,
			tipo: ev.artifactType,
			payload: ev.payload,
			channel,
			personaId: persona,
		});
	}

	// ── O índice deste turno do cliente ─────────────────────────────────────
	//
	// `funnel.turnosDoCliente` é o contador; o índice do turno corrente é o valor
	// de ANTES do incremento. O evento correspondente só é empurrado lá embaixo,
	// junto dos outros — mas o INCREMENTO tem que acontecer aqui, acima do
	// `projectToMeta`, senão o contador não entra no metadata e cada turno relê
	// zero do banco (o teste `cenario-o-indice-do-turno-e-exato` fixa isso: com o
	// incremento embaixo, os três turnos anunciavam `[0], [0], [0]`).
	//
	// A primeira versão contava `state.messages.filter(human).length - 1`. Não
	// funciona: `run-turn.ts` monta `messages` por dois caminhos (banco no
	// primeiro turno, checkpointer + `resume` nos seguintes) e a fala corrente
	// entra em momentos diferentes em cada um. Numa conversa real de três falas,
	// o smoke de 30/08/2026 registrou 0 → 1 → 3.
	//
	// Aqui e não no `route.ts`: este nó roda nos DOIS canais, e o sink do
	// TurnTrace — que é quem publica o score — é o único ponto por onde web e
	// WhatsApp passam. A primeira versão contava por query dentro do route, o
	// que deixava o WhatsApp de fora e punha um COUNT no caminho quente.
	//
	// Turno de SERVIDOR não conta: directive e retomada não são fala do cliente,
	// e gastariam o índice 0 — que é o que `primeira_resposta_com_numero` lê.
	let indiceDoTurno: number | null = null;
	if (isUserTurn) {
		indiceDoTurno = funnel.turnosDoCliente ?? 0;
		funnel = { ...funnel, turnosDoCliente: indiceDoTurno + 1 };
	}

	const projetado = projectToMeta({ ...state, funnel });

	// FIX-207 (watchdog) — o marcador que o worker `gate-reengage-poll` procura.
	// Ele era escrito SÓ no runtime Vercel (orchestrator/index.ts), e o dispatcher
	// desvia pro grafo antes daquele bloco: sob `AI_RUNTIME=langgraph` nenhum
	// caminho gravava `pendingGateSince`, então o `WHERE ... IS NOT NULL` do worker
	// nunca casava. Quem abandonava a conversa num gate pendente jamais era
	// cobrado de volta — e sem erro em log nenhum, porque não havia escrita pra
	// falhar. Mora AQUI e não no `FunnelState` de propósito: nada em `nextGate`/
	// `tool-policy` lê esses campos, só o worker; entrar no slice seria dar-lhes
	// uma autoridade sobre o fluxo que eles não têm.
	const meta = { ...projetado };

	// O TURNO CONDUZIU, OU SÓ FALOU?
	//
	// Uma pergunta, dois consumidores: o marcador de pendência (logo abaixo) e o
	// score `conducao_entregue`. A definição é compartilhada (`@/lib/agent/
	// conducao`) e o INSUMO também — esta mesma const alimenta os dois. Se cada
	// um lesse os eventos por conta própria, o painel poderia dizer "conduziu"
	// enquanto o watchdog achasse o contrário, e ninguém notaria.
	const flagsDeConducao = {
		isUserTurn,
		perguntaEntregue: state.modelAskedQuestion === true,
		handoff: state.events.some((ev) => ev.type === "handoff") || funnel.handoffSuggested === true,
		// `contractClosed`, NÃO `contractFormDispatched`: com o formulário na tela e
		// o cliente ainda sem preencher, conduzir importa mais que nunca.
		contractClosed: projetado.contractClosed === true,
	};
	const conduziu = turnoEntregouConducao(state.events, flagsDeConducao);

	// `gateFired` deixa de perguntar pela ROTA (`Boolean(state.gate)` — "o funil
	// CALCULOU um gate") e passa a perguntar pela ENTREGA. Calcular não é
	// entregar: no turno do reveal o gate é suprimido de propósito, e quando a
	// âncora também não sai o cliente fica sem nada a responder — sem que
	// pendência nenhuma fosse gravada (sessão `ff8f2080`). `null` (turno de
	// servidor, contrato fechado) conta como entregue: ali não se cobra ninguém.
	const pendingGate = pendingGateAfterTurn({
		meta: projetado,
		gateFired: conduziu !== false,
		isUserTurn,
		hasContactName: Boolean(state.contactName),
	});
	if (pendingGate) {
		// Reseta o relógio a cada turno de usuário que deixa o funil pendente.
		meta.pendingGateSince = simulatorNow().getTime();
		meta.pendingGate = pendingGate;
	} else {
		delete meta.pendingGateSince;
		delete meta.pendingGate;
	}
	// O CLIENTE VOLTOU A FALAR → o contador de retomadas zera.
	//
	// Sem isto, o teto de 2 seria por CONVERSA e não por período de silêncio: uma
	// pessoa que sumiu duas vezes lá no começo e voltou nunca mais seria puxada de
	// volta, mesmo travando na véspera de assinar. Só turno REAL do cliente conta
	// (`userText`) — a própria retomada é `isUserTurn: false` e não se auto-perdoa.
	if (isUserTurn && userText) delete meta.retomada;
	// O último ponto antes de o estado virar verdade no banco — é aqui que se
	// pergunta se ele é aritmeticamente possível. Em 13/08 um par `creditMin:
	// 18000` com `creditMax: 6424` foi gravado e usado numa busca sem que nada
	// acusasse; agora todo turno responde a essa pergunta no trace.
	registrarEstadoDoFunil({
		creditMin: meta.qualifyAnswers?.creditMin,
		creditMax: meta.qualifyAnswers?.creditMax,
		alvo: meta.qualifyAnswers?.alvoDeBusca,
	});
	await persistMeta(conversationId, meta);

	// O NOME CAPTURADO PRECISA SOBREVIVER AO TURNO.
	//
	// O nó `capture` extrai o nome do texto e devolve `{ contactName }` — mas isso
	// vive só no canal do grafo, e `run-turn.ts` re-hidrata `contactName` da COLUNA
	// do banco a cada turno. Como só a tool `save_contact_name` escrevia essa
	// coluna, bastava o modelo não chamá-la pra o nome evaporar: no turno seguinte
	// `nextGate` via `hasContactName: false` e pedia o nome DE NOVO, a quem tinha
	// acabado de dizer. Visto ao vivo em produção.
	//
	// É a mesma família dos outros sumiços de estado, numa terceira variante: nem
	// escrita fora do grafo, nem campo fora da projeção — um canal do grafo que
	// ninguém persistia. Por isso mora aqui, junto do resto da persistência.
	//
	// Isto também é o que permite parar de depender da regra-no-prompt: capturar o
	// nome é invariante verificável, e invariante verificável é código.
	// `isNull` na cláusula: grava só quando a coluna ainda está vazia. Uma
	// instrução, idempotente, sem reescrever a cada turno e sem atropelar um nome
	// que a tool (ou o usuário, pelo card) já tenha confirmado.
	if (state.contactName) {
		await db
			.update(conversationsTable)
			.set({ contactName: state.contactName, updatedAt: simulatorNow() })
			.where(
				and(eq(conversationsTable.id, conversationId), isNull(conversationsTable.contactName)),
			);
	}

	const events: TurnEvent[] = [];

	// QUAL TURNO É ESTE — a posição, não o conteúdo.
	//
	// Alimenta o score `primeira_resposta_com_numero`, que é como se saberá,
	// daqui a duas semanas, se a mudança do primeiro turno funcionou. A conta é
	// sobre `state.messages`, que o grafo já tem em mãos: quantas falas do
	if (indiceDoTurno !== null) events.push({ type: "turno-do-cliente", indice: indiceDoTurno });
	// Proxy determinístico de `lead-stage` (TODO rodada-1: paridade fina com
	// `LEAD_STAGE_BY_TOOL`, runner.ts — hoje disparado por tool específica, não
	// por transição de funil). `recordStageReached` (chamado pelos adapters,
	// intactos) é forward-only e idempotente — reemitir a cada turno é seguro.
	// "ENGAJADO" DEIXOU DE DEPENDER DE `desireAsked` (30/08/2026).
	//
	// O proxy era o gate `desire` ter sido perguntado. Isso funcionava enquanto
	// todo mundo passava por ele; desde que a categoria dispensa a abertura
	// (`nextGate`), 90% das entradas medidas pulam o `desire` inteiro — e o
	// degrau `engajado` do funil sumiria junto, para todo mundo que entra por
	// chip.
	//
	// Seria a pior classe de erro de medição: o painel construído neste mesmo
	// trabalho passaria a mostrar uma QUEDA de conversão que é, na verdade, a
	// própria mudança de instrumentação. A evidência de que é grande está no
	// dado do dia: `novo → engajado` = 44 contra `engajado → qualificado` = 32.
	//
	// A âncora nova é o fato que a mudança não move: o cliente disse o que quer.
	// Ter categoria definida OU ter passado pelo `desire` são as duas formas de
	// chegar lá, e as duas significam a mesma coisa para o negócio — a conversa
	// saiu do "oi" e virou assunto.
	if (funnel.desireAsked || funnel.currentCategory) {
		events.push({ type: "lead-stage", stage: "engajado" });
	}
	if (funnel.identityCollected) events.push({ type: "lead-stage", stage: "qualificado" });
	// A negociação começa AQUI, não na mesa: o cliente já viu os grupos reais
	// (`revealCompleted`) e voltou a falar sobre eles — está negociando, e o
	// kanban tem que mostrar isso durante a conversa. Exige um turno de USUÁRIO
	// pós-reveal de propósito: só ter recebido os cards não é negociar.
	if (funnel.revealCompleted && state.isUserTurn) {
		events.push({ type: "lead-stage", stage: "em_negociacao" });
	}
	events.push({ type: "meta-update", meta });
	events.push({ type: "finish", reason: "ok" });

	// Mesmo veredito que decidiu a pendência lá em cima, agora virando score —
	// mesma função, mesmo insumo, nenhuma chance de divergirem.
	registrarConducao({ ...flagsDeConducao, eventos: state.events, gateAtivo: state.gate ?? null });

	// AO VIVO, e SÓ AQUI. O grafo pausa no `human` logo depois deste nó, então o
	// `values` final nunca chega ao `run-turn.ts` — tudo que não sair pelo writer
	// se perde. Mas "gate"/"artifact" só podem sair DEPOIS do `persistMeta` acima:
	// os adapters releem a meta fresca do banco pra montar o card, e emitir antes
	// da escrita fazia `gatePartData` ler meta velha e devolver `null` (nenhum card
	// na tela). `text-delta`/`tool-call` já saíram ao vivo no `converse`.
	const JA_EMITIDOS: ReadonlySet<TurnEvent["type"]> = new Set([
		"text-delta",
		"tool-call",
		"text-boundary",
	]);
	// Cards que o `converse` já jogou na tela ENTRE os dois balões do reveal —
	// reemitir aqui duplicaria a lista inteira embaixo da segunda fala.
	const jaNaTela = new Set(state.streamedArtifactIds ?? []);
	for (const ev of state.events) {
		if (JA_EMITIDOS.has(ev.type)) continue;
		if (ev.type === "artifact" && jaNaTela.has(ev.toolCallId)) continue;
		// Mesmo descarte da gravação acima: o card que contradiz a âncora não pode
		// ir pra tela nem pelo banco nem ao vivo — é o botão "Tenho interesse" da
		// cota errada que o cliente clicaria.
		if (contradizAncora(ev)) continue;
		// Respiro entre os blocos: fala do agente, card e chips caindo no mesmo
		// instante viravam um bloco só, ilegível (visto ao vivo, 2026-07-30).
		if (ev.type === "artifact") await pausaDeConversa(RITMO.falaParaCard);
		else if (ev.type === "gate") await pausaDeConversa(RITMO.antesDosChips);
		config?.writer?.(ev);
	}
	for (const ev of events) config?.writer?.(ev);

	return { funnel, events };
}
