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
import { db } from "@/db";
import { artifacts as artifactsTable } from "@/db/schema";
import { pendingGateAfterTurn } from "@/lib/agent/gate-reengage";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { shouldMarkDoubtsAddressed } from "@/lib/agent/qualify-state";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta } from "@/lib/conversation/meta";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { projectToMeta } from "../emit";
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

	for (const ev of state.events) {
		if (ev.type !== "artifact") continue;
		// Mesmo padrão de `emitServerCard` (orchestrator/index.ts): 1 message
		// marcador `[card: tipo]` por artifact, pra o log do admin nunca perder
		// o turno mesmo quando não há texto (BUG-ADMIN-MESSAGE-MISSING).
		const messageId = await saveMessage(
			conversationId,
			"assistant",
			`[card: ${ev.artifactType}]`,
			channel,
			persona,
		);
		await db.insert(artifactsTable).values({
			messageId,
			type: ev.artifactType,
			payload: ev.payload,
			createdAt: simulatorNow(),
		});
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
	const pendingGate = pendingGateAfterTurn({
		meta: projetado,
		gateFired: Boolean(state.gate),
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
	await persistMeta(conversationId, meta);

	const events: TurnEvent[] = [];
	// Proxy determinístico de `lead-stage` (TODO rodada-1: paridade fina com
	// `LEAD_STAGE_BY_TOOL`, runner.ts — hoje disparado por tool específica, não
	// por transição de funil). `recordStageReached` (chamado pelos adapters,
	// intactos) é forward-only e idempotente — reemitir a cada turno é seguro.
	if (funnel.desireAsked) events.push({ type: "lead-stage", stage: "engajado" });
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
		config?.writer?.(ev);
	}
	for (const ev of events) config?.writer?.(ev);

	return { funnel, events };
}
