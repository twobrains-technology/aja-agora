import type { UIMessageStreamWriter } from "ai";
import { db } from "@/db";
import { artifacts as artifactsTable } from "@/db/schema";
import { recordStageReached } from "@/lib/admin/lead-stage-tracker";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import { buildSearchSummaryDirective } from "@/lib/agent/orchestrator/directives";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { planTransition } from "@/lib/agent/orchestrator/transition";
import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import {
	type Bounds,
	CREDIT_BOUNDS,
	LANCE_EMBUTIDO_OPTIONS,
	lanceValueOptions,
	TIMEFRAME_OPTIONS as TIMEFRAME_CONFIG,
} from "@/lib/agent/qualify-config";
import { type Gate, shouldAskMotive } from "@/lib/agent/qualify-state";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";
import type { ArtifactType } from "@/lib/chat/types";
import type {
	AjaUIMessage,
	ArtifactPartData,
	GatePartData,
	GatePartOption,
	SliderField,
	ToolStatusPartData,
	TransitionPartData,
} from "@/lib/chat/ui-message";
import { WELCOME_OPTIONS } from "@/lib/chat/welcome-options";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { getTraceForWriter } from "@/lib/telemetry/turn-trace";
import { simulatorNow } from "@/lib/utils/simulator-clock";

type Writer = UIMessageStreamWriter<AjaUIMessage>;

const creditSlider = (category: Category): SliderField => {
	const b: Bounds = CREDIT_BOUNDS[category];
	// FIX-2: label amigável — o id interno continua "credit" (contrato da API).
	return { id: "credit", label: "Valor do bem", format: "currency", ...b };
};

// FIX-115: termSlider removido do adapter — o prazo saiu da entrada (FIX-103) e a
// agulha simples do valor (kind "slider") não coleta prazo/parcela. O componente
// por intenção ("Planeje sua conquista") foi aposentado pela jornada canônica.

const TIMEFRAME_OPTIONS: GatePartOption[] = TIMEFRAME_CONFIG.map((t) => ({
	value: t.token,
	label: t.title,
}));

/** Atalhos do "por que agora" (gate `desire`), por categoria. São ATALHOS, não
 * um formulário: o campo de texto segue aberto e quem quiser contar a história
 * inteira digita. O clique manda o rótulo como mensagem normal — o motivo entra
 * pelo mesmo caminho de sempre (analyzer sobre texto livre). */
const DESIRE_MOTIVE_OPTIONS: Partial<Record<Category, GatePartOption[]>> = {
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

/** Monta o card de um gate a partir do meta da conversa. PURO (exportado pra
 * Camada 1 validar a copy do docx sem DB). */
export function gatePartData(gate: Gate, meta: ConversationMetadata): GatePartData | null {
	switch (gate) {
		case "name":
			// FIX-17: card do nome com input focado (passo 1). A pergunta já saiu no
			// texto do agente (gateQuestion('name')=null), o card só complementa.
			return { kind: "name", gate: "name" };
		case "desire": {
			// Gate FANTASMA até 2026-07-21: devolvia `null` e o `desire` ficava sem
			// nenhum pixel na tela. Toda pergunta do funil oferece resposta em um
			// toque — o motivo ("por que agora") são os atalhos mais comuns por
			// categoria; quem quiser contar a história inteira continua digitando.
			// O chip manda o rótulo como TEXTO comum (o analyzer extrai `motivation`
			// do texto livre, igual a digitar) — nenhum handler novo no servidor.
			// Os atalhos são do MOTIVO ("por que agora"), não do bem — só aparecem no
			// turno em que o agente pergunta o motivo. No turno do bem ("qual carro?")
			// não há card: a resposta é aberta.
			if (!shouldAskMotive(meta)) return null;
			const opcoes = DESIRE_MOTIVE_OPTIONS[meta.currentCategory ?? "auto"];
			if (!opcoes) return null;
			return { kind: "chips", gate: "desire", options: opcoes };
		}
		case "experience":
			return {
				kind: "chips",
				gate: "experience",
				options: [
					{ value: "first", label: "É a primeira vez" },
					{ value: "returning", label: "Já conheço" },
					{ value: "doubts", label: "Tenho dúvidas" },
				],
			};
		case "credit": {
			const category = meta.currentCategory;
			if (!category) return null;
			// FIX-115 (Kairo, PROD 2026-06-30): AGULHA SIMPLES do valor do bem — um
			// único slider de R$ 1.000 em R$ 1.000. Substitui o picker complexo por
			// intenção ("Planeje sua conquista"), que a jornada canônica aposentou na
			// revisão FIX-104 ("componente COMPLEXO saiu; na web um slider simples
			// pode apoiar"). O valor segue por CONVERSA: a agulha, sem onSubmit, manda
			// o valor como TEXTO no chat (parseAssetValue faz o backstop no funil).
			// Prazo/parcela saíram da entrada (FIX-103/104) — a agulha não os coleta.
			return {
				kind: "slider",
				gate: "credit",
				category,
				fields: [creditSlider(category)],
			};
		}
		case "timeframe": {
			const category = meta.currentCategory;
			if (!category) return null;
			return {
				kind: "chips",
				gate: "timeframe",
				options: TIMEFRAME_OPTIONS,
			};
		}
		case "lance":
			return {
				kind: "chips",
				gate: "lance",
				options: [
					// FIX-268 (rodada 7, veredito Fable r6, residual D4): "reserva"
					// varrido — mesma disciplina do FIX-234/FIX-256.
					{ value: "yes", label: "Sim, tenho como dar" },
					{ value: "maybe", label: "Talvez, depende" },
					{ value: "no", label: "Por enquanto não" },
					// FIX-236 (Fable r1, P0): 3ª saída — quem não quer comprometer nada além
					// da parcela vai direto pro card `two_paths` (dois caminhos), pulando a
					// educação de embutido/agulha (rota em route.ts + orchestrator/index.ts).
					{ value: "so_parcela", label: "Só a parcela, sem lance" },
				],
			};
		case "lance-value": {
			// docx passo 2: "Qual valor aproximado?" — faixas relativas ao crédito.
			const creditMax = meta.qualifyAnswers?.creditMax;
			if (!creditMax) return null;
			return {
				kind: "chips",
				gate: "lance-value",
				options: lanceValueOptions(creditMax).map((o) => ({
					value: o.token,
					label: o.title,
					desc: o.desc,
				})),
			};
		}
		case "lance-embutido":
			return {
				kind: "chips",
				gate: "lance-embutido",
				options: LANCE_EMBUTIDO_OPTIONS.map((o) => ({ value: o.token, label: o.title })),
			};
		case "identify":
			// D1: form CPF + celular + LGPD antes da busca (a Bevi exige pra simular).
			return { kind: "identity", gate: "identify", prefilledPhone: null };
		case "simulator-offer":
			// docx passo 4: oferta do simulador na sequência do reveal.
			return {
				kind: "chips",
				gate: "simulator-offer",
				options: [
					{ value: "yes", label: "Quero ver!" },
					{ value: "no", label: "Agora não" },
				],
			};
		case "reco-consent":
			// Micro-compromisso mais importante do funil — e até 2026-07-21 era o
			// ÚNICO sim/não sem botão de "sim": o cliente tinha que DIGITAR pra
			// aceitar ver a recomendação. Atrito puro. Os chips mandam o rótulo como
			// texto normal (mesmo caminho de sempre, `detectYesNoText` resolve).
			return {
				kind: "chips",
				gate: "reco-consent",
				options: [
					{ value: "sim", label: "Sim, quero ver" },
					{ value: "nao", label: "Agora não" },
				],
			};
		case "doubts-wait":
		case "search":
		case "decision":
			return null;
	}
}

/** Emite a pergunta + card de um gate DIRETO no stream (sem turno de LLM).
 * Usado pelos handlers determinísticos do route (ex.: pós-lance → identify). */
export async function pipeGatePrompt(args: {
	conversationId: string;
	gate: Gate;
	writer: Writer;
	/** O modelo já fez esta pergunta com as palavras dele → o card só mostra o
	 * input, sem repetir a pergunta canônica. */
	modelAsked?: boolean;
}): Promise<void> {
	const { conversationId, gate, writer, modelAsked } = args;
	const meta = await reloadMeta(conversationId);
	const data = gatePartData(gate, meta);
	// FIX-245: creditValue (carta real, pós-reveal) substitui o exemplo genérico
	// de "R$ 100 mil" na educação de lance embutido.
	// FIX-255 (rodada 4, veredito Fable FINAL §N-D): copy por canal — "web" pra
	// não herdar a frase "eu já pego aqui do WhatsApp" (gate identify).
	//
	// DESAMARRA (2026-07-13): quando o MODELO já perguntou (`modelAsked`), o card
	// NÃO repete a pergunta canônica — emite só o input. Antes, a pergunta do
	// modelo era descartada pra esta aqui sair sempre igual; era a origem do "o
	// agente responde sempre a mesma coisa".
	const question = modelAsked
		? null
		: gateQuestion(
				gate,
				meta.currentCategory,
				meta.recommendedOffer?.creditValue,
				"web",
				meta.qualifyAnswers?.creditMentionedAtDesire,
				meta.qualifyAnswers?.desiredItem,
			);
	// FIX-238 (Fable r1, gap P1 #5): a pergunta e o card são INDEPENDENTES —
	// gates não-bloqueantes sem card (ex.: "desire", FIX-233) ainda têm pergunta a
	// emitir. Antes, `if (!data) return` matava a pergunta junto com o card ausente,
	// virando turno morto ("Prazer, Madalena!" e nada mais).
	if (!data && !question) return;
	if (question) {
		const id = crypto.randomUUID();
		writer.write({ type: "text-start", id });
		writer.write({ type: "text-delta", id, delta: question });
		writer.write({ type: "text-end", id });
	}
	if (data) {
		writer.write({ type: "data-gate", id: crypto.randomUUID(), data });
	}
}

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

			case "artifact":
				closeTextIfOpen();
				emittedVisible = true;
				writer.write({
					type: "data-artifact",
					id: ev.toolCallId,
					data: { type: ev.artifactType, payload: ev.payload } as unknown as ArtifactPartData,
				});
				break;

			case "gate": {
				closeTextIfOpen();
				const meta = await reloadMeta(conversationId);
				const data = gatePartData(ev.gate, meta);
				// FIX-245: carta real (pós-reveal) no lugar do exemplo genérico "R$ 100 mil".
				// FIX-255: copy por canal (web nunca herda a frase do WhatsApp).
				//
				// DESAMARRA (2026-07-13): se o MODELO já perguntou (`ev.modelAsked`), o
				// card cala a pergunta canônica e mostra só o input. Antes era o
				// contrário — a pergunta do modelo era descartada pra esta sair sempre
				// idêntica, o que fazia o agente repetir a mesma frase pra sempre.
				const question = ev.modelAsked
					? null
					: gateQuestion(
							ev.gate,
							meta.currentCategory,
							meta.recommendedOffer?.creditValue,
							"web",
							meta.qualifyAnswers?.creditMentionedAtDesire,
							meta.qualifyAnswers?.desiredItem,
						);
				// FIX-238: idem pipeGatePrompt — pergunta e card são independentes.
				if (data || question) {
					emittedVisible = true;
					if (question) {
						const id = crypto.randomUUID();
						writer.write({ type: "text-start", id });
						writer.write({ type: "text-delta", id, delta: question });
						writer.write({ type: "text-end", id });
					}
					if (data) {
						writer.write({
							type: "data-gate",
							id: crypto.randomUUID(),
							data,
						});
					}
				}
				break;
			}

			case "transition": {
				closeTextIfOpen();
				emittedVisible = true;
				const data: TransitionPartData = {
					toPersona: ev.toPersona,
					toPersonaName: ev.toPersonaName,
					toCategory: ev.toCategory,
					bridgeText: ev.bridgeText,
				};
				writer.write({
					type: "data-transition",
					id: crypto.randomUUID(),
					data,
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
				await recordStageReached(conversationId, ev.stage as "engajado" | "qualificado");
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
}): Promise<void> {
	const { conversationId, userText, contactName, writer, userKey } = args;
	const events = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName,
		skipLeadCollection: true,
		userKey,
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
	// Tripwire D1: a busca real exige identidade (a Bevi não simula sem CPF).
	// Sem identityCollected, o caminho certo é o gate "identify" — nunca buscar.
	if (!refreshed.identityCollected) {
		await pipeGatePrompt({ conversationId, gate: "identify", writer });
		return;
	}
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
