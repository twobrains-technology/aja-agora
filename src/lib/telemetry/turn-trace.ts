// src/lib/telemetry/turn-trace.ts
//
// FIX-21 — Observabilidade de trajetória POR TURNO.
//
// Cenário: debugar uma conversa real hoje = grep manual no log do container
// atrás de `[reveal-loop]`, `[gate-skip]`, `[cache]`, `[handoff]` espalhados.
// Não existe uma visão por turno: qual gate disparou, quais tools rodaram, o que
// foi emitido, quanto demorou (SLA <3s do CLAUDE.md). Os dados JÁ transitam — o
// orquestrador emite `TurnEvent`s tipados — mas ninguém agrega. Este módulo é o
// acumulador que fecha UM registro por turno e o despeja num sink (log
// estruturado JSON, 1 linha/turno; trocável por tabela Drizzle depois).
//
// Restrição de desenho (bloco H, disjunção com bloco G): a instrumentação NÃO
// toca runner.ts. Ela "escuta" os dois funis de consumo de TurnEvents:
//   • Web (route.ts): proxy do UIMessageStreamWriter — observa as UI parts
//     escritas (`instrumentWriter` + `recordUIPart`).
//   • WhatsApp (adapter.ts): tap passthrough sobre o stream de TurnEvents
//     (`traceTurnEvents` + `recordTurnEvent`).
//
// FIX-24: supressões de guard ([reveal-loop], [post-closure], [contract-gate],
// [single-option], [whatsapp-optin]) e as métricas de cache (cacheCreation/
// cacheRead da Anthropic) também viram TurnEvents dedicados ('suppression' e
// 'usage') emitidos pelo runner. Os `console.log` originais FICAM (cassettes e
// grep de produção dependem deles) — os eventos são adição, não substituição.
// Sem esses eventos no stream (turno legado), os campos seguem [] / null.

import type { UIMessage, UIMessageStreamWriter } from "ai";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

export type TurnTraceChannel = "web" | "whatsapp";

/** Registro fechado de UM turno — a unidade de observabilidade. */
export type TurnTraceRecord = {
	/** Correlação no log (1 turno = 1 traceId). */
	traceId: string;
	conversationId: string;
	channel: TurnTraceChannel;
	/** Persona ativa no turno. Web: conhecida no entry point. WhatsApp/transições:
	 *  capturada via evento (`transition`/`meta-update`). null = não observada. */
	persona: string | null;
	/** Gate disparado neste turno (experience, identify, simulator-offer…). */
	gate: string | null;
	/** Tools chamadas, na ordem. */
	toolsCalled: string[];
	toolCount: number;
	/** Artifacts emitidos (após guards), na ordem. */
	artifactsEmitted: string[];
	artifactCount: number;
	/** Artifacts suprimidos por guard neste turno (FIX-24), na ordem. */
	suppressed: string[];
	/** Tokens lidos do cache da Anthropic (providerMetadata) — FIX-24. */
	cacheRead: number | null;
	/** Tokens gravados no cache da Anthropic — FIX-24. */
	cacheWrite: number | null;
	/** Soma do texto streamado (proxy de tamanho da resposta). */
	textChars: number;
	/** Handoff sinalizado neste turno. */
	handoff: boolean;
	/** Persona destino quando o turno foi uma transição (senão null). */
	transitionedTo: string | null;
	/** Estágio de lead alcançado no turno (engajado/qualificado). */
	leadStage: string | null;
	/** Latência wall-clock do turno em ms (start → finalize). */
	durationMs: number;
	/** Razão de término reportada pelo orquestrador (ok, handoff, search-…). */
	finishReason: string | null;
	/** Epoch ms do início do turno (ordenação na ingestão). */
	startedAt: number;
};

export type TurnTraceContext = {
	conversationId: string;
	channel: TurnTraceChannel;
	/** Persona conhecida no início do turno (web tem; whatsapp normalmente não). */
	persona?: string | null;
};

/** Dependências injetáveis — relógio/id/sink. Defaults reais; testes stubam. */
export type TurnTraceDeps = {
	now: () => number;
	newId: () => string;
	sink: (record: TurnTraceRecord) => void;
};

/** Sink padrão: log estruturado, 1 linha JSON por turno, prefixo estável pra
 *  grep/ingest. Trocar por uma tabela Drizzle `turn_traces` é substituir só
 *  isto — nenhum caller muda. */
export function emitTurnTrace(record: TurnTraceRecord): void {
	console.log(`[turn-trace] ${JSON.stringify(record)}`);
}

const defaultDeps: TurnTraceDeps = {
	now: () => Date.now(),
	newId: () => crypto.randomUUID(),
	sink: emitTurnTrace,
};

/** Acumulador de um turno. Recebe sinais granulares (de TurnEvents ou de UI
 *  parts) e fecha o registro em `finalize()`. `finalize` é idempotente e nunca
 *  propaga erro do sink — telemetria não pode derrubar o turno do usuário. */
export class TurnTrace {
	private readonly startedAt: number;
	private readonly traceId: string;
	private persona: string | null;
	private gate: string | null = null;
	private readonly tools: string[] = [];
	private readonly artifacts: string[] = [];
	private readonly suppressed: string[] = [];
	private cacheRead: number | null = null;
	private cacheWrite: number | null = null;
	private textChars = 0;
	private handoff = false;
	private transitionedTo: string | null = null;
	private leadStage: string | null = null;
	private finishReason: string | null = null;
	private finalized = false;

	constructor(
		private readonly ctx: TurnTraceContext,
		private readonly deps: TurnTraceDeps = defaultDeps,
	) {
		this.startedAt = deps.now();
		this.traceId = deps.newId();
		this.persona = ctx.persona ?? null;
	}

	addText(chars: number): void {
		if (chars > 0) this.textChars += chars;
	}
	addTool(name: string): void {
		this.tools.push(name);
	}
	addArtifact(type: string): void {
		this.artifacts.push(type);
	}
	setGate(gate: string): void {
		this.gate = gate;
	}
	setPersona(persona: string): void {
		this.persona = persona;
	}
	setTransition(toPersona: string): void {
		this.transitionedTo = toPersona;
		this.persona = toPersona;
	}
	markHandoff(): void {
		this.handoff = true;
	}
	setLeadStage(stage: string): void {
		this.leadStage = stage;
	}
	setFinish(reason: string): void {
		this.finishReason = reason;
	}
	/** FIX-269 (rodada 7, veredito Fable r6, nit de observabilidade): permite ao
	 * chamador saber se um finishReason REAL já chegou (via TurnEvent "finish"
	 * do orquestrador) antes de aplicar um default — sem isto, o default "ok"
	 * do canal web sobrescrevia cegamente razões como "tool-error-recovered",
	 * mascarando turnos CONTIDOS como se fossem normais. */
	hasFinish(): boolean {
		return this.finishReason !== null;
	}
	/** FIX-24: registra um artifact suprimido por guard neste turno. */
	addSuppression(artifactType: string): void {
		this.suppressed.push(artifactType);
	}
	/** FIX-24: grava as métricas de cache da Anthropic (último report do turno). */
	setCache(read: number, write: number): void {
		this.cacheRead = read;
		this.cacheWrite = write;
	}

	toRecord(): TurnTraceRecord {
		return {
			traceId: this.traceId,
			conversationId: this.ctx.conversationId,
			channel: this.ctx.channel,
			persona: this.persona,
			gate: this.gate,
			toolsCalled: [...this.tools],
			toolCount: this.tools.length,
			artifactsEmitted: [...this.artifacts],
			artifactCount: this.artifacts.length,
			suppressed: [...this.suppressed],
			cacheRead: this.cacheRead,
			cacheWrite: this.cacheWrite,
			textChars: this.textChars,
			handoff: this.handoff,
			transitionedTo: this.transitionedTo,
			leadStage: this.leadStage,
			durationMs: Math.max(0, this.deps.now() - this.startedAt),
			finishReason: this.finishReason,
			startedAt: this.startedAt,
		};
	}

	finalize(): TurnTraceRecord {
		const record = this.toRecord();
		if (!this.finalized) {
			this.finalized = true;
			try {
				this.deps.sink(record);
			} catch {
				// Telemetria NUNCA derruba o turno — sink que falha é engolido.
			}
		}
		return record;
	}
}

/** Mapeia um TurnEvent → mutações no trace (fonte canônica: WhatsApp). */
export function recordTurnEvent(trace: TurnTrace, ev: TurnEvent): void {
	switch (ev.type) {
		case "text-delta":
			trace.addText(ev.text.length);
			break;
		case "tool-call":
			trace.addTool(ev.toolName);
			break;
		case "artifact":
			trace.addArtifact(ev.artifactType);
			break;
		case "gate":
			trace.setGate(ev.gate);
			break;
		case "transition":
			trace.setTransition(ev.toPersona);
			break;
		case "handoff":
			trace.markHandoff();
			break;
		case "lead-stage":
			trace.setLeadStage(ev.stage);
			break;
		case "meta-update":
			if (ev.meta?.currentPersona) trace.setPersona(ev.meta.currentPersona);
			break;
		case "suppression":
			trace.addSuppression(ev.artifactType);
			break;
		case "usage":
			trace.setCache(ev.cacheRead, ev.cacheWrite);
			break;
		case "finish":
			trace.setFinish(ev.reason);
			break;
		case "welcome-categories":
		case "lead-collection-prompt":
		// FIX-268: boundary de render (fecha o balão de texto aberto) — não
		// carrega dado de observabilidade, no-op no trace.
		case "text-boundary":
			break;
	}
}

/** Mapeia uma UI part escrita no writer → mutações no trace (fonte: web SSE).
 *  Defensivo: parts malformadas são ignoradas, nunca lançam (não pode quebrar o
 *  stream do usuário). As chaves espelham o que `pipeOrchestratorToWriter` e os
 *  handlers do route escrevem (data-tool/data-artifact/data-gate/…). */
export function recordUIPart(
	trace: TurnTrace,
	part: { type?: string; [k: string]: unknown },
): void {
	const type = part?.type;
	if (!type) return;
	switch (type) {
		case "text-delta": {
			const delta = (part as { delta?: unknown }).delta;
			if (typeof delta === "string") trace.addText(delta.length);
			return;
		}
		case "data-tool": {
			const tool = (part as { data?: { tool?: unknown } }).data?.tool;
			if (typeof tool === "string") trace.addTool(tool);
			return;
		}
		case "data-artifact": {
			const artifactType = (part as { data?: { type?: unknown } }).data?.type;
			if (typeof artifactType === "string") trace.addArtifact(artifactType);
			return;
		}
		case "data-gate": {
			const gate = (part as { data?: { gate?: unknown } }).data?.gate;
			if (typeof gate === "string") trace.setGate(gate);
			return;
		}
		case "data-transition": {
			const toPersona = (part as { data?: { toPersona?: unknown } }).data?.toPersona;
			if (typeof toPersona === "string") trace.setTransition(toPersona);
			return;
		}
		case "data-handoff": {
			trace.markHandoff();
			return;
		}
		default:
			return;
	}
}

/** Tap PASSTHROUGH sobre um stream de TurnEvents (funil de consumo do WhatsApp).
 *  Re-emite cada evento intacto (nunca engole nem reordena) enquanto alimenta o
 *  trace; fecha o registro no `finally` — inclusive se o consumidor abandona
 *  cedo ou um erro propaga. */
export async function* traceTurnEvents(
	events: AsyncIterable<TurnEvent>,
	ctx: TurnTraceContext,
	deps?: TurnTraceDeps,
): AsyncGenerator<TurnEvent> {
	const trace = new TurnTrace(ctx, deps);
	try {
		for await (const ev of events) {
			try {
				recordTurnEvent(trace, ev);
			} catch {
				// nunca pode impedir o passthrough do evento
			}
			yield ev;
		}
	} finally {
		trace.finalize();
	}
}

// FIX-250 (rodada 3, Fable r2, N7 — observabilidade, Lei 5): "suppression"/
// "usage" são TurnEvents que NUNCA viram UI part no canal web (no-op de
// propósito em `pipeOrchestratorToWriter` — não são pra chegar ao usuário) —
// `recordUIPart`/`instrumentWriter` sozinhos nunca os enxergam, e
// `trace.suppressed` ficava SEMPRE `[]` na web (achado ao vivo: supressão do
// guard `premature-decision` não registrada). Side-channel: quem consome o
// stream bruto de TurnEvents (`pipeOrchestratorToWriter`) recupera o MESMO
// trace pelo writer instrumentado e alimenta suppression/usage direto, sem
// precisar mudar a assinatura de nenhuma função pipeXxx em route.ts.
const writerTraces = new WeakMap<object, TurnTrace>();

/** Recupera o `TurnTrace` registrado por `instrumentWriter` pra este writer
 * (o mesmo objeto instrumentado que circula pelas funções pipeXxx). undefined
 * quando o writer não foi instrumentado — nunca lança. */
export function getTraceForWriter(writer: unknown): TurnTrace | undefined {
	if (writer === null || (typeof writer !== "object" && typeof writer !== "function")) {
		return undefined;
	}
	return writerTraces.get(writer as object);
}

/** Tap por PROXY do writer (funil de consumo da web SSE). Forwarda TODA chamada
 *  ao writer real (passthrough byte-idêntico) e, em `write`, espelha a UI part
 *  no trace. Use com um `TurnTrace` cujo `finalize()` é chamado ao fim do
 *  `execute` do stream. */
export function instrumentWriter<M extends UIMessage>(
	writer: UIMessageStreamWriter<M>,
	trace: TurnTrace,
): UIMessageStreamWriter<M> {
	const proxy = new Proxy(writer, {
		get(target, prop, receiver) {
			if (prop === "write") {
				return (part: Parameters<UIMessageStreamWriter<M>["write"]>[0]) => {
					try {
						recordUIPart(trace, part as { type?: string });
					} catch {
						// telemetria nunca quebra o stream
					}
					return target.write(part);
				};
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	writerTraces.set(proxy, trace);
	return proxy;
}
