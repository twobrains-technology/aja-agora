import type { UIMessageStreamWriter } from "ai";
import { recordStageReached } from "@/lib/admin/lead-stage-tracker";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import { buildSearchSummaryDirective } from "@/lib/agent/orchestrator/directives";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { planTransition } from "@/lib/agent/orchestrator/transition";
import type { Category, Persona } from "@/lib/agent/personas";
import {
	type Bounds,
	CREDIT_BOUNDS,
	LANCE_EMBUTIDO_OPTIONS,
	lanceValueOptions,
	MONTHLY_BOUNDS,
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

type Writer = UIMessageStreamWriter<AjaUIMessage>;

const creditSlider = (category: Category): SliderField => {
	const b: Bounds = CREDIT_BOUNDS[category];
	return { id: "credit", label: "Crédito", format: "currency", ...b };
};

const monthlySlider = (category: Category): SliderField => {
	const b: Bounds = MONTHLY_BOUNDS[category];
	return { id: "monthlyBudget", label: "Parcela mensal", format: "currency", ...b };
};

const TIMEFRAME_OPTIONS: GatePartOption[] = TIMEFRAME_CONFIG.map((t) => ({
	value: t.token,
	label: t.title,
}));

async function gatePartData(gate: Gate, conversationId: string): Promise<GatePartData | null> {
	const meta = await reloadMeta(conversationId);
	switch (gate) {
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
				options: [
					{ value: "yes", label: "Bora!" },
					{ value: "more", label: "Entender mais antes" },
				],
			};
		case "credit": {
			const category = meta.currentCategory;
			if (!category) return null;
			return {
				kind: "slider",
				gate: "credit",
				category,
				fields: [creditSlider(category), monthlySlider(category)],
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
	const data = await gatePartData(gate, conversationId);
	if (!data) return;
	const meta = await reloadMeta(conversationId);
	const question = gateQuestion(gate, meta.currentCategory);
	if (question) {
		const id = crypto.randomUUID();
		writer.write({ type: "text-start", id });
		writer.write({ type: "text-delta", id, delta: question });
		writer.write({ type: "text-end", id });
	}
	writer.write({ type: "data-gate", id: crypto.randomUUID(), data });
}

export const WELCOME_OPTIONS: GatePartOption[] = [
	{ value: "imovel", label: "Imóvel" },
	{ value: "auto", label: "Automóvel" },
	{ value: "moto", label: "Moto" },
	{ value: "servicos", label: "Outros" },
];

export async function pipeOrchestratorToWriter(
	events: AsyncIterable<TurnEvent>,
	writer: Writer,
	conversationId: string,
): Promise<void> {
	let textId: string | null = null;

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
				writer.write({ type: "text-delta", id: ensureTextStarted(), delta: ev.text });
				break;

			case "lead-collection-prompt":
				closeTextIfOpen();
				writer.write({ type: "text-start", id: crypto.randomUUID() });
				writer.write({
					type: "text-delta",
					id: ensureTextStarted(),
					delta: ev.text,
				});
				closeTextIfOpen();
				break;

			case "artifact":
				closeTextIfOpen();
				writer.write({
					type: "data-artifact",
					id: ev.toolCallId,
					data: { type: ev.artifactType, payload: ev.payload } as unknown as ArtifactPartData,
				});
				break;

			case "gate": {
				closeTextIfOpen();
				const data = await gatePartData(ev.gate, conversationId);
				if (data) {
					const meta = await reloadMeta(conversationId);
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
				writer.write({
					type: "data-welcome",
					id: crypto.randomUUID(),
					data: { options: WELCOME_OPTIONS },
				});
				break;

			case "handoff":
				closeTextIfOpen();
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
			case "finish":
				break;
		}
	}

	closeTextIfOpen();
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
}): Promise<void> {
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
	await pipeOrchestratorToWriter(events, writer, conversationId);
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
	await pipeDirectiveTurn({ conversationId, directive, contactName, writer, userKey });
}
