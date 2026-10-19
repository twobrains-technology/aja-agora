// O TURNO NO PI — o driver que substitui o grafo.
//
// A ordem é a mesma que o LangGraph executava, porque ela é contrato do produto,
// não do framework:
//
//   capture → analyze → route → advance → (discovery) → FALA (pi) → emit-card → persist
//
// O que muda é quem conduz a fala: antes um nó `converse` com laço manual de
// tool; agora uma sessão do pi por beat, com as mesmas tools de negócio e o
// mesmo filtro de texto. O resto — gate, cards determinísticos, persistência —
// continua sendo código do produto, chamado em sequência.
//
// Sobre DURABILIDADE: o histórico vem do banco a cada turno e hidrata a sessão
// (régua (c) do parecer do spike). É o mesmo comportamento do `MemorySaver`
// anterior: nada pior, nada de I/O de sessão do harness.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { EphemeralTextFilter } from "@/lib/agent/orchestrator/sanitizer";
import type { TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import { buildConsorcioTools } from "@/lib/agent/tools/ai-sdk";
import { advanceFunnelNode } from "@/lib/agent/turn/advance";
import { type AnalyzeFn, createAnalyzeNode } from "@/lib/agent/turn/analyze";
import { captureAnswerNode } from "@/lib/agent/turn/capture";
import { montarContextoDoTurno } from "@/lib/agent/turn/contexto";
import { type BuscaGrupos, createDiscoveryNode } from "@/lib/agent/turn/discovery";
import { emitCardNode } from "@/lib/agent/turn/emit-card";
import { type EstadoDoTurno, estadoInicialDoTurno } from "@/lib/agent/turn/estado";
import { artifactAllowed } from "@/lib/agent/turn/guarded-artifact";
import { persistNode } from "@/lib/agent/turn/persist";
import { projectToMeta } from "@/lib/agent/turn/projecao";
import { routeNode, routeToDiscovery } from "@/lib/agent/turn/route";
import { TOOLS_QUE_REVELAM_OFERTA } from "@/lib/agent/turn/tools-que-revelam";
import { WHAT_IF_TOOL_NAMES } from "@/lib/agent/turn/toolset";
import { leituraDoDesbloqueio } from "@/lib/chat/telefone-ab-do-servidor";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { metaOf } from "@/lib/conversation/meta";
import { executarBeat, type ResultadoDeTool } from "./converse";
import { toPiTools } from "./tools";

/** Aplica um partial de nó no estado — o mesmo que o canal de `Annotation`
 * fazia, sem reducer escondido: campo presente substitui, campo ausente fica. */
function aplicar(estado: EstadoDoTurno, update: Partial<EstadoDoTurno>): EstadoDoTurno {
	const novo: EstadoDoTurno = { ...estado, ...update };
	// `events` é o único campo ACUMULATIVO: cada nó devolve o que produziu.
	if (update.events) novo.events = [...estado.events, ...update.events];
	else novo.events = estado.events;
	return novo;
}

/** Conteúdo de um resultado de tool do pi → valor de negócio. O wrapper de
 * `pi/tools.ts` devolve `{ content: [{type:"text", text: JSON}], details: {} }`. */
function valorDoResultado(resultado: unknown): unknown {
	const r = resultado as { content?: Array<{ text?: string }>; details?: unknown } | undefined;
	const texto = r?.content?.[0]?.text;
	if (typeof texto === "string") {
		try {
			return JSON.parse(texto);
		} catch {
			return texto;
		}
	}
	return r?.details ?? resultado;
}

export function createRunTurnPi(deps?: {
	/** Injetável para teste: provedor OpenAI-completions falso (roteiro). */
	provider?: { id: string; baseUrl: string; apiKey: string; model: string };
	/** Fronteira LLM do `analyze` — trocada por roteiro nos cenários. */
	analyze?: AnalyzeFn;
	/** Fronteira externa da busca (Bevi) — trocada nos cenários. */
	busca?: BuscaGrupos;
}): (input: TurnInput) => AsyncGenerator<TurnEvent> {
	// Os nós são criados UMA vez: quem injeta fronteira passa aqui.
	const noDeAnalyze = createAnalyzeNode(deps?.analyze);
	const noDeDescoberta = createDiscoveryNode(deps?.busca);
	return async function* runTurnPiImpl(input: TurnInput): AsyncGenerator<TurnEvent> {
		const { conversationId, channel, userText, isUserTurn, contactName, isResumeGreeting } = input;
		if (!conversationId) throw new Error("[pi] conversationId is required");

		// ── Estado do turno, do banco ──
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const baseMeta = metaOf(conv);
		const historico = (await loadConversationHistory(conversationId)).map((m) => ({
			role: m.role,
			content: m.content,
		}));

		let estado = estadoInicialDoTurno({
			conversationId,
			channel,
			contactName: contactName ?? conv?.contactName ?? null,
			isUserTurn,
			userText,
			isResumeGreeting,
			baseMeta,
			historico,
		});

		// ── Fila de eventos: os passos empurram, o generator drena ao vivo ──
		const fila: TurnEvent[] = [];
		let acordar: (() => void) | null = null;
		const emitir = (evento: TurnEvent) => {
			fila.push(evento);
			acordar?.();
			acordar = null;
		};

		const executar = async () => {
			// 1. captura determinística (nome)
			estado = aplicar(estado, captureAnswerNode(estado));

			// 2. leitura da mensagem (analyzer)
			estado = aplicar(estado, await noDeAnalyze(estado));

			// 3. rota (gate do card deste turno)
			estado = aplicar(estado, routeNode(estado));

			// 4. marcadores de dispatch/rapport
			estado = aplicar(estado, await advanceFunnelNode(estado, emitir));

			// 5. busca (quando o funil está pronto — antes de o modelo falar)
			if (routeToDiscovery(estado) === "discovery") {
				estado = aplicar(estado, await noDeDescoberta(estado, emitir));
			}

			// 6. A FALA — sessão do pi
			const desbloqueio =
				estado.channel === "web"
					? await leituraDoDesbloqueio(estado.conversationId).catch(() => null)
					: null;
			const desbloqueioPendente = desbloqueio !== null && desbloqueio.estado !== "livre";
			const nomesDasTools: readonly string[] = desbloqueioPendente
				? WHAT_IF_TOOL_NAMES.filter((nome) => !TOOLS_QUE_REVELAM_OFERTA.has(nome))
				: WHAT_IF_TOOL_NAMES;

			const toolsDeNegocio = buildConsorcioTools({
				conversationId: estado.conversationId,
				channel: estado.channel,
				userText: estado.isUserTurn ? estado.userText : null,
				hasLance: estado.funnel.qualifyAnswers?.hasLance === "yes",
				metaDoTurno: projectToMeta(estado),
				artifactsDoTurno: estado.events
					.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
					.map((ev) => ({ type: ev.artifactType, payload: ev.payload })),
				allowedToolNames: nomesDasTools,
				turnoDoCliente: { texto: estado.userText ?? "", intent: estado.intent },
			});

			const contexto = await montarContextoDoTurno({
				state: estado,
				nomesDeTools: nomesDasTools,
				desbloqueio,
				desbloqueioPendente,
			});

			// O filtro precisa do contexto de FATOS (guards de verdade).
			const ctxDeFatos = () => {
				const reais = [
					estado.funnel.recommendedAdministradora,
					estado.funnel.recommendedOffer?.administradora,
					estado.funnel.pendingRecommendationCard?.administradora,
				].filter((a): a is string => typeof a === "string" && a.length > 0);
				return {
					hasReceivedDocuments: (estado.baseMeta.documentSlotsSent?.length ?? 0) > 0,
					hasSearchToolCall: false,
					hasProposal:
						contexto.dossie !== null && contexto.dossie !== undefined
							? contexto.dossie.simulacoes.length > 0
							: estado.baseMeta.contractClosed === true,
					contractClosed: estado.baseMeta.contractClosed === true,
					channel: estado.channel,
					recoConsentPending: estado.funnel.recoConsentAnswered !== true,
					shownAdministradoras: reais,
				};
			};
			const filtro = new EphemeralTextFilter(ctxDeFatos);

			const resultados: ResultadoDeTool[] = [];
			const beat = await executarBeat({
				system: contexto.systemBeat1,
				turnMessage: contexto.turnMessage,
				historico: estado.historico,
				tools: toPiTools(toolsDeNegocio as never, {
					conversationId: estado.conversationId,
					so: nomesDasTools,
				}),
				aoDelta: (delta) => {
					const limpo = filtro.push(delta);
					if (limpo) emitir({ type: "text-delta", text: limpo });
				},
				aoToolCall: (chamada) =>
					emitir({
						type: "tool-call",
						toolName: chamada.nome,
						input: (chamada.input ?? {}) as Record<string, unknown>,
						toolCallId: chamada.toolCallId,
					}),
				aoResultado: (r) => resultados.push(r),
				provider: deps?.provider,
			});
			const cauda = filtro.flushPending();
			if (cauda) emitir({ type: "text-delta", text: cauda });

			// ── O que as tools de APRESENTAÇÃO trouxeram vira card ──
			// Convênio do produto (`present_<tipo>` → artifactType), e o guard roda
			// antes de o card existir: card que contradiz a âncora não chega na tela.
			const guardCtx = {
				meta: projectToMeta(estado),
				userIntent: estado.intent ?? "neutral",
				isUserTurn: estado.isUserTurn,
				channel: estado.channel,
				discoveryCount: null,
				conversationId: estado.conversationId,
				turnArtifactTypes: estado.events
					.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
					.map((ev) => ev.artifactType),
			} as const;
			for (const chamada of beat.chamadas) {
				if (!chamada.nome.startsWith("present_")) continue;
				const resultado = resultados.find((r) => r.toolCallId === chamada.toolCallId);
				if (!resultado) continue;
				const artifactType = chamada.nome.replace("present_", "");
				if (!artifactAllowed(guardCtx, artifactType as never)) continue;
				const payload = valorDoResultado(resultado.resultado);
				estado = aplicar(estado, {
					events: [
						{
							type: "artifact",
							artifactType: artifactType as never,
							payload: payload as never,
							toolCallId: chamada.toolCallId,
						},
					],
				});
			}

			// `suggest_handoff` prometido tem que existir no estado — senão o
			// cliente fica esperando atendente que nunca vem.
			if (beat.chamadas.some((c) => c.nome === "suggest_handoff")) {
				estado = aplicar(estado, { funnel: { ...estado.funnel, handoffSuggested: true } });
			}

			// `modelAskedQuestion` é FATO do turno, e o sinal é do SANITIZER
			// (`hasHeldQuestion`: a pergunta que de fato ocupa a vez), nunca um regex
			// de "?" — o regex conta "Oi! Tudo bem?" como pergunta do funil e o card
			// do nome cede a vez para uma saudação.
			const perguntou = filtro.hasHeldQuestion();
			estado = aplicar(estado, {
				modelAskedQuestion: perguntou,
				pedidoDeNomeExplicito: perguntou && /(seu|teu)\s+(primeiro\s+)?nome/i.test(beat.texto),
			});

			// 7. cards determinísticos
			estado = aplicar(estado, await emitCardNode(estado, emitir));

			// 8. persistência (+ entrega de gate/artifact, depois de gravar a meta)
			estado = aplicar(estado, await persistNode(estado, emitir));
		};

		let fechado = false;
		let erro: unknown = null;
		const promessa = executar()
			.catch((e) => {
				erro = e;
			})
			.finally(() => {
				fechado = true;
				acordar?.();
				acordar = null;
			});
		void promessa;

		while (!fechado || fila.length > 0) {
			if (fila.length === 0) {
				await new Promise<void>((ok) => {
					acordar = ok;
				});
				continue;
			}
			yield fila.shift() as TurnEvent;
		}

		if (erro) throw erro;
		yield { type: "finish", reason: "complete" };
	};
}

export const runTurnPi = createRunTurnPi();
