import type { UIMessageStreamWriter } from "ai";
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
import type { Gate } from "@/lib/agent/qualify-state";
import type {
	AjaUIMessage,
	ArtifactPartData,
	GatePartData,
	GatePartOption,
	SliderField,
	TransitionPartData,
} from "@/lib/chat/ui-message";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { saveMessage } from "@/lib/conversation/messages";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";
import { WELCOME_OPTIONS } from "@/lib/chat/welcome-options";

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

/** Monta o card de um gate a partir do meta da conversa. PURO (exportado pra
 * Camada 1 validar a copy do docx sem DB). */
export function gatePartData(gate: Gate, meta: ConversationMetadata): GatePartData | null {
	switch (gate) {
		case "name":
			// FIX-17: card do nome com input focado (passo 1). A pergunta já saiu no
			// texto do agente (gateQuestion('name')=null), o card só complementa.
			return { kind: "name", gate: "name" };
		case "desire":
			// FIX-233: gate não bloqueante, sem card — as duas perguntas (bem
			// específico + motivo) são conversa livre; o texto sai no directive.
			return null;
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
		case "consent":
			return {
				kind: "chips",
				gate: "consent",
				options:
					// docx passo 2: após a explicação de primeira vez, o botão é
					// LITERALMENTE "Entendi, pode continuar".
					meta.experiencePrev === "first"
						? [
								{ value: "yes", label: "Entendi, pode continuar" },
								{ value: "more", label: "Entender mais antes" },
							]
						: [
								{ value: "yes", label: "Bora!" },
								{ value: "more", label: "Entender mais antes" },
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
					{ value: "yes", label: "Sim, tenho reserva" },
					{ value: "maybe", label: "Talvez, depende" },
					{ value: "no", label: "Por enquanto não" },
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
}): Promise<void> {
	const { conversationId, gate, writer } = args;
	const meta = await reloadMeta(conversationId);
	const data = gatePartData(gate, meta);
	if (!data) return;
	const question = gateQuestion(gate, meta.currentCategory);
	if (question) {
		const id = crypto.randomUUID();
		writer.write({ type: "text-start", id });
		writer.write({ type: "text-delta", id, delta: question });
		writer.write({ type: "text-end", id });
	}
	writer.write({ type: "data-gate", id: crypto.randomUUID(), data });
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
				if (data) {
					emittedVisible = true;
					const question = gateQuestion(ev.gate, meta.currentCategory);
					if (question) {
						const id = crypto.randomUUID();
						writer.write({ type: "text-start", id });
						writer.write({ type: "text-delta", id, delta: question });
						writer.write({ type: "text-end", id });
					}
					writer.write({
						type: "data-gate",
						id: crypto.randomUUID(),
						data,
					});
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

			case "meta-update":
			case "suppression":
			case "usage":
			case "finish":
				// FIX-24: telemetria interna — consumida pelo turn-trace, não
				// vira UI part. No-op no funil de SSE da web.
				break;
		}
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
}): Promise<{ emittedVisible: boolean }> {
	const { conversationId, directive, contactName, writer, userKey } = args;
	const events = runTurn({
		channel: "web",
		conversationId,
		userText: directive,
		isUserTurn: false,
		contactName,
		skipAnalyzer: true,
		skipLeadCollection: true,
		userKey,
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
	await persistMeta(conversationId, { ...refreshed, searchDispatched: true });
	const directive = buildSearchSummaryDirective({ category, meta: refreshed });
	const { emittedVisible } = await pipeDirectiveTurn({
		conversationId,
		directive,
		contactName,
		writer,
		userKey,
	});
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
