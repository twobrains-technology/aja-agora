import type { UIMessageStreamWriter } from "ai";
import { db } from "@/db";
import { artifacts as artifactsTable } from "@/db/schema";
import { recordStageReached } from "@/lib/admin/lead-stage-tracker";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import { buildSearchSummaryDirective } from "@/lib/agent/orchestrator/directives";
import { planTransition } from "@/lib/agent/orchestrator/transition";
import type { Category, Persona } from "@/lib/agent/personas";
import {
	type Bounds,
	CREDIT_BOUNDS,
	TIMEFRAME_OPTIONS as TIMEFRAME_CONFIG,
} from "@/lib/agent/qualify-config";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";
import {
	type LeituraDoDesbloqueio,
	leituraDoDesbloqueio,
} from "@/lib/chat/telefone-ab-do-servidor";
import type { ArtifactType } from "@/lib/chat/types";
import type {
	AjaUIMessage,
	ArtifactPartData,
	GatePartOption,
	SliderField,
	ToolStatusPartData,
} from "@/lib/chat/ui-message";
import { WELCOME_OPTIONS } from "@/lib/chat/welcome-options";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { getTraceForWriter } from "@/lib/telemetry/turn-trace";
import { simulatorNow } from "@/lib/utils/simulator-clock";

type Writer = UIMessageStreamWriter<AjaUIMessage>;

const _creditSlider = (category: Category, valorJaDito?: number): SliderField => {
	const b: Bounds = CREDIT_BOUNDS[category];
	// A agulha nasce ANCORADA no valor que o cliente já disse ("quero um carro de
	// 260 mil"). Antes vinha sempre no default da categoria (R$ 80 mil pra auto):
	// quem já tinha dito o preço via a agulha apontando pra outro número e, se
	// tocasse nela por engano, o valor que ele mesmo declarou era substituído pelo
	// default — a busca inteira saía na faixa errada (visto ao vivo, 2026-07-21).
	// Clampado à faixa da categoria, senão o slider nasce fora do próprio range.
	const ancora =
		typeof valorJaDito === "number" && Number.isFinite(valorJaDito)
			? Math.min(Math.max(valorJaDito, b.min), b.max)
			: b.default;
	// FIX-2: label amigável — o id interno continua "credit" (contrato da API).
	return { id: "credit", label: "Valor do bem", format: "currency", ...b, default: ancora };
};

// FIX-115: termSlider removido do adapter — o prazo saiu da entrada (FIX-103) e a
// agulha simples do valor (kind "slider") não coleta prazo/parcela. O componente
// por intenção ("Planeje sua conquista") foi aposentado pela jornada canônica.

const _TIMEFRAME_OPTIONS: GatePartOption[] = TIMEFRAME_CONFIG.map((t) => ({
	value: t.token,
	label: t.title,
}));

/** Atalhos do "por que agora" (gate `desire`), por categoria. São ATALHOS, não
 * um formulário: o campo de texto segue aberto e quem quiser contar a história
 * inteira digita. O clique manda o rótulo como mensagem normal — o motivo entra
 * pelo mesmo caminho de sempre (analyzer sobre texto livre). */
const _DESIRE_MOTIVE_OPTIONS: Partial<Record<Category, GatePartOption[]>> = {
	auto: [
		{ value: "primeiro", label: "É meu primeiro carro" },
		{ value: "troca", label: "Vou trocar o que tenho" },
		{ value: "trabalho", label: "Preciso pra trabalhar" },
		{ value: "familia", label: "A família cresceu" },
	],
	moto: [
		{ value: "primeira", label: "É minha primeira moto" },
		{ value: "troca", label: "Vou trocar a que tenho" },
		{ value: "trabalho", label: "Preciso pra trabalhar" },
		{ value: "economia", label: "Pra economizar no dia a dia" },
	],
	imovel: [
		{ value: "primeiro", label: "É meu primeiro imóvel" },
		{ value: "sair-aluguel", label: "Quero sair do aluguel" },
		{ value: "investimento", label: "É investimento" },
		{ value: "familia", label: "A família cresceu" },
	],
};

/** FIX-246 (rodada 3, Fable r2 — causa-raiz do veredito 4/10): emite um card
 * SERVER-SIDE determinístico direto no stream — sem depender de o LLM chamar
 * `present_X` (0 emissões ao vivo no veredito, a tool nem existe mais no
 * toolset). Espelha `pipeGatePrompt` (texto opcional + escrita direta), mas
 * persiste como artifact vinculado a uma mensagem do assistente (mesmo padrão
 * de `pipeAndSaveClosingItems` em route.ts) pra sobreviver no histórico/admin. */
export async function pipeServerArtifact(args: {
	conversationId: string;
	artifactType: ArtifactType;
	payload: Record<string, unknown>;
	persona: Persona | null;
	writer: Writer;
}): Promise<void> {
	const { conversationId, artifactType, payload, persona, writer } = args;
	writer.write({
		type: "data-artifact",
		id: crypto.randomUUID(),
		data: { type: artifactType, payload } as unknown as ArtifactPartData,
	});
	const messageId = await saveMessage(
		conversationId,
		"assistant",
		`[card: ${artifactType}]`,
		"web",
		persona,
	);
	await db.insert(artifactsTable).values({
		messageId,
		type: artifactType,
		payload,
		createdAt: simulatorNow(),
	});
}

// FIX-130 (D21): 3 categorias de entrada — Imóvel, Automóvel, Moto — vêm da
// FONTE ÚNICA client-safe. O evento `welcome-categories` (backend) e o
// `EmptyState` do chat (`message-list.tsx`) importam a MESMA lista, pra não
// voltarem a divergir (o FIX-121 corrigiu só esta cópia e a do message-list
// ficou com a 4ª categoria "Outros"). Importada no topo; re-exportada aqui
// pra manter a superfície pública do adapter (consumida por adapter.test.ts).
export { WELCOME_OPTIONS };

export async function pipeOrchestratorToWriter(
	events: AsyncIterable<TurnEvent>,
	writer: Writer,
	conversationId: string,
): Promise<{ emittedVisible: boolean }> {
	let textId: string | null = null;
	// FIX-189: o turno emitiu ALGO visível e persistente (texto/artifact/gate/
	// transição/welcome/handoff)? O tool-call é chip transitório — NÃO conta. Usado
	// pelo dispatch de descoberta pra detectar a pendura (turno só-chip) e recuperar.
	let emittedVisible = false;

	// ── bloco-telefone-ab (FIX-395/396/397) ──────────────────────────────────────
	//
	// O teste A/B do telefone, decidido UMA vez por turno e só quando um artifact
	// de reveal chega — no caso comum (sem teste ativo, ou telefone já conhecido)
	// sequer toca o banco.
	let estadoDoTurno: LeituraDoDesbloqueio | null | undefined;
	const _cardDoTelefoneEmitido = false;
	const _desbloqueioLazy = async (): Promise<LeituraDoDesbloqueio | null> => {
		if (estadoDoTurno === undefined) {
			estadoDoTurno = await leituraDoDesbloqueio(conversationId).catch((err) => {
				// Best-effort, como toda a atribuição: o teste nunca derruba a venda.
				console.error("[telefone-ab] falha ao ler o desbloqueio do telefone:", err);
				return null;
			});
		}
		return estadoDoTurno;
	};

	const ensureTextStarted = (): string => {
		if (!textId) {
			textId = crypto.randomUUID();
			writer.write({ type: "text-start", id: textId });
		}
		return textId;
	};

	const closeTextIfOpen = (): void => {
		if (textId) {
			writer.write({ type: "text-end", id: textId });
			textId = null;
		}
	};

	// BATIMENTO. Entre o início do turno e a primeira palavra do modelo a stream
	// fica em silêncio absoluto — e desde que a busca passou a rodar ANTES da
	// fala, esse silêncio chega a 30s+. Proxy nenhum aguenta: o OrbStack corta
	// com EOF e o cliente leva 502 no meio da conversa (aconteceu no clique de
	// "Seguir com ITAÚ", o botão de fechar negócio). Um data-part transitório a
	// cada 8s mantém a conexão viva; a UI ignora `data-heartbeat`.
	const batimento = setInterval(() => {
		try {
			// Reusa o part de tool "transiente" que a UI já sabe descartar — nenhum
			// tipo novo no protocolo só pra manter a conexão viva.
			writer.write({
				type: "data-tool",
				id: crypto.randomUUID(),
				data: { tool: "keepalive" } as unknown as ToolStatusPartData,
				transient: true,
			});
		} catch {
			// stream já fechada — o clearInterval do finally cuida do resto
		}
	}, 8000);

	try {
		for await (const ev of events) {
			switch (ev.type) {
				case "text-delta":
					if (ev.text) emittedVisible = true;
					writer.write({ type: "text-delta", id: ensureTextStarted(), delta: ev.text });
					break;

				case "lead-collection-prompt": {
					// Bloco de texto isolado e FECHADO — um único id que abre, recebe o
					// delta e fecha. (Antes: um text-start órfão com id aleatório + outro
					// id do ensureTextStarted pro delta → 2 starts, 1 end no stream.)
					closeTextIfOpen();
					emittedVisible = true;
					const id = crypto.randomUUID();
					writer.write({ type: "text-start", id });
					writer.write({ type: "text-delta", id, delta: ev.text });
					writer.write({ type: "text-end", id });
					break;
				}

				case "artifact": {
					closeTextIfOpen();
					emittedVisible = true;
					// A TRAVA A/B DO TELEFONE SAIU (2026-10-20). Ela segurava o card da
					// prateleira até o cliente dar o número — experimento de funil, e o
					// vendedor livre mostra a carta antes de pedir qualquer dado. O
					// desbloqueio (`telefone_do_desbloqueio`) morre junto.
					writer.write({
						type: "data-artifact",
						id: ev.toolCallId,
						data: { type: ev.artifactType, payload: ev.payload } as unknown as ArtifactPartData,
					});
					break;
				}

				case "welcome-categories":
					closeTextIfOpen();
					emittedVisible = true;
					writer.write({
						type: "data-welcome",
						id: crypto.randomUUID(),
						data: { options: WELCOME_OPTIONS },
					});
					break;

				case "handoff":
					closeTextIfOpen();
					emittedVisible = true;
					writer.write({
						type: "data-handoff",
						id: crypto.randomUUID(),
						data: { reason: ev.reason },
					});
					break;

				case "lead-stage":
					await recordStageReached(
						conversationId,
						ev.stage as "engajado" | "qualificado" | "em_negociacao",
					);
					break;

				case "tool-call":
					closeTextIfOpen();
					writer.write({
						type: "data-tool",
						id: ev.toolCallId,
						data: { tool: ev.toolName },
					});
					break;

				case "suppression":
					// FIX-250 (rodada 3, Fable r2, N7): suppression NUNCA vira UI part
					// (não é pro usuário ver) — mas precisa chegar no turn-trace, senão
					// `suppressed` fica sempre [] no canal web (gap de observabilidade,
					// Lei 5). getTraceForWriter recupera o trace pelo writer já
					// instrumentado por route.ts, sem mudar nenhuma assinatura.
					getTraceForWriter(writer)?.addSuppression(ev.artifactType);
					break;

				case "usage":
					getTraceForWriter(writer)?.setCache(ev.cacheRead, ev.cacheWrite);
					break;

				// Telemetria pura, mesmo padrão de `suppression`/`usage`: nunca vira
				// UI part, mas precisa chegar ao trace. Sem este case, o score
				// `primeira_resposta_com_numero` só existiria no WhatsApp — e a
				// mudança que ele mede (a agulha com a parcela estimada no primeiro
				// turno) é WEB-ONLY. O sinal nasceria cego para o canal inteiro que
				// ele foi feito para medir.
				case "turno-do-cliente":
					getTraceForWriter(writer)?.setTurnoDoCliente(ev.indice);
					break;

				// FIX-269 (rodada 7, veredito Fable r6, nit de observabilidade): o
				// finishReason REAL do orquestrador (ex.: "tool-error-recovered")
				// nunca chegava ao trace no canal web — este case era agrupado como
				// no-op puro (era FIX-24), então route.ts sempre aplicava o default
				// "ok" por cima, mascarando turnos CONTIDOS como se fossem normais.
				// Mesmo padrão de suppression/usage: getTraceForWriter recupera o
				// trace pelo writer já instrumentado, sem mudar assinatura nenhuma.
				case "finish":
					getTraceForWriter(writer)?.setFinish(ev.reason);
					break;

				case "meta-update":
					// FIX-24: telemetria interna — consumida pelo turn-trace, não
					// vira UI part. No-op no funil de SSE da web.
					break;

				case "text-boundary":
					// FIX-268: força o fechamento do balão de texto aberto — sem
					// isso, 2 directives seguidos sem artifact/gate no meio colam o
					// texto num balão só ("1 balão = 1 ideia" violado).
					closeTextIfOpen();
					break;
			}
		}

		// FIX-433 (D3): o card do telefone do braço B sai JUNTO do primeiro card
		// de oferta (dentro do loop) — não há mais o fecho de turno daqui, que
		// deixava a oferta legível até a última linha do turno.
	} finally {
		clearInterval(batimento);
	}

	closeTextIfOpen();
	return { emittedVisible };
}

export async function pipeUserTurn(args: {
	conversationId: string;
	userText: string;
	contactName: string | null;
	writer: Writer;
	userKey?: string | null;
	/**
	 * FIX-368: este turno é a primeira mensagem do usuário desde que retomou
	 * a conversa (sinalizado pelo cliente — ver `theater-chat.tsx`). Repassado
	 * até `resolveAgent` pra disparar o reconhecimento da reserva já feita.
	 */
	isResumeGreeting?: boolean;
}): Promise<void> {
	const { conversationId, userText, contactName, writer, userKey, isResumeGreeting } = args;
	const events = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName,
		skipLeadCollection: true,
		userKey,
		isResumeGreeting,
	});
	await pipeOrchestratorToWriter(events, writer, conversationId);
}

export async function pipeDirectiveTurn(args: {
	conversationId: string;
	directive: string;
	contactName: string | null;
	writer: Writer;
	userKey?: string | null;
	/** FIX-254 (rodada 4, veredito Fable FINAL §N-C): quando o CHAMADOR já vai
	 * emitir o gate (card + pergunta) explicitamente logo em seguida (ex.:
	 * embedded_bid no clique do gate lance), suprime o disparo AUTOMÁTICO de
	 * `nextGateToFire` deste turno de directive — sem isso, os dois caminhos
	 * emitem a MESMA educação+chips (double-dispatch: route.ts:1058-1072). */
	suppressGate?: boolean;
	/** FIX-319 (rodada 10, onda 4 — veredito Sonnet, P0): directive PURAMENTE
	 * narrativo (ex.: scarcity/decision_prompt) — `"none"` proíbe QUALQUER
	 * tool-call neste turno em nível de API (nunca regra-no-prompt). Ver
	 * `TurnInput.forceToolChoice` (orchestrator/types.ts). */
	forceToolChoice?: "none";
}): Promise<{ emittedVisible: boolean }> {
	const { conversationId, directive, contactName, writer, userKey, suppressGate, forceToolChoice } =
		args;
	const events = runTurn({
		channel: "web",
		conversationId,
		userText: directive,
		isUserTurn: false,
		contactName,
		skipAnalyzer: true,
		skipLeadCollection: true,
		userKey,
		suppressGateEvent: suppressGate,
		forceToolChoice,
	});
	return pipeOrchestratorToWriter(events, writer, conversationId);
}

export async function pipeTransitionTurn(args: {
	conversationId: string;
	fromPersona: Persona;
	toCategory: Category;
	expertiseHint?: string | null;
	contactName: string | null;
	writer: Writer;
	userKey?: string | null;
}): Promise<void> {
	const { conversationId, fromPersona, toCategory, expertiseHint, contactName, writer, userKey } =
		args;
	const plan = await planTransition({
		conversationId,
		fromPersona,
		toCategory,
		expertiseHint,
	});
	if (plan.kind === "abort") {
		const id = crypto.randomUUID();
		writer.write({ type: "text-start", id });
		writer.write({ type: "text-delta", id, delta: plan.apologyText });
		writer.write({ type: "text-end", id });
		return;
	}
	writer.write({
		type: "data-transition",
		id: crypto.randomUUID(),
		data: {
			toPersona: plan.toPersona,
			toPersonaName: plan.toPersonaName,
			toCategory: plan.toCategory,
			bridgeText: plan.bridgeText,
		},
	});
	await pipeDirectiveTurn({
		conversationId,
		directive: plan.directive,
		contactName,
		writer,
		userKey,
	});
}

export async function pipeSearchSummaryTurn(args: {
	conversationId: string;
	contactName: string | null;
	writer: Writer;
	userKey?: string | null;
}): Promise<void> {
	const { conversationId, contactName, writer, userKey } = args;
	const refreshed = await reloadMeta(conversationId);
	if (refreshed.searchDispatched) return;
	// Sem categoria não há o que resumir. O tripwire de identidade morreu junto
	// com o gate `identify`: a busca rápida usa a identidade da casa, então o
	// cliente nunca precisa dar CPF para ver carta.

	const category = refreshed.currentCategory;
	if (!category) return;
	const directive = buildSearchSummaryDirective({ category, meta: refreshed });
	const { emittedVisible } = await pipeDirectiveTurn({
		conversationId,
		directive,
		contactName,
		writer,
		userKey,
	});
	// FIX-291 (b): `searchDispatched` só é marcado DEPOIS de confirmar que a
	// descoberta de fato completou (`revealCompleted`, setado pelo runner só com
	// artifacts REAIS na tela — runner.ts). Antes, o marcador saía PREEMPTIVO
	// (antes desta chamada) — uma busca que falhasse (teto agregado do FIX-291a
	// estourado, erro duro etc.) travava searchDispatched=true PRA SEMPRE, e o
	// curto-circuito desta função + o de orchestrator/index.ts
	// ("search-already-dispatched") nunca mais permitiam retentar a busca num
	// turno seguinte — mesmo sem jamais ter mostrado dado real ao usuário.
	const postSearch = await reloadMeta(conversationId);
	if (postSearch.revealCompleted) {
		await persistMeta(conversationId, { ...postSearch, searchDispatched: true });
	} else {
		console.log(
			`[discovery-degraded] guard: busca falhou/degradou — searchDispatched NAO marcado, retry liberado num turno seguinte (conv=${conversationId})`,
		);
	}
	// FIX-189 (pendura): a descoberta é disparada pelo caminho de AÇÃO (resposta a
	// gate), que NÃO roda o guard de turno-mudo do route (só o turno de texto-livre
	// roda). Se o turno de descoberta fechou sem nada visível (só o chip "Buscando
	// grupos"), o reveal nunca chegaria e o usuário teria de cutucar. Emite o
	// fallback determinístico — nunca frase de refresh técnico (respeita FIX-190).
	if (!emittedVisible) {
		const persona = refreshed.currentPersona ?? null;
		console.log(
			`[discovery-mute] guard: descoberta fechou sem reveal — fallback determinístico (conv=${conversationId})`,
		);
		const id = crypto.randomUUID();
		writer.write({ type: "text-start", id });
		writer.write({ type: "text-delta", id, delta: EMPTY_TURN_FALLBACK });
		writer.write({ type: "text-end", id });
		await saveMessage(conversationId, "assistant", EMPTY_TURN_FALLBACK, "web", persona);
	}
}
