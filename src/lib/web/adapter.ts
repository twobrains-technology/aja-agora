import type { UIMessageStreamWriter } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import { buildSearchSummaryDirective } from "@/lib/agent/orchestrator/directives";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { planTransition } from "@/lib/agent/orchestrator/transition";
import type { Category, Persona } from "@/lib/agent/personas";
import type { Gate } from "@/lib/agent/qualify-state";
import type {
	AjaUIMessage,
	GatePartData,
	GatePartOption,
	SliderField,
	TransitionPartData,
} from "@/lib/chat/ui-message";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";

type Writer = UIMessageStreamWriter<AjaUIMessage>;

const CREDIT_SLIDER_BY_CATEGORY: Record<Category, SliderField> = {
	imovel: {
		id: "credit",
		label: "Crédito",
		min: 100_000,
		max: 2_000_000,
		step: 50_000,
		default: 400_000,
		format: "currency",
	},
	auto: {
		id: "credit",
		label: "Crédito",
		min: 20_000,
		max: 300_000,
		step: 10_000,
		default: 80_000,
		format: "currency",
	},
	servicos: {
		id: "credit",
		label: "Crédito",
		min: 10_000,
		max: 500_000,
		step: 10_000,
		default: 60_000,
		format: "currency",
	},
};

const MONTHLY_SLIDER_BY_CATEGORY: Record<Category, SliderField> = {
	imovel: {
		id: "monthlyBudget",
		label: "Parcela mensal",
		min: 1_000,
		max: 15_000,
		step: 500,
		default: 3_000,
		format: "currency",
	},
	auto: {
		id: "monthlyBudget",
		label: "Parcela mensal",
		min: 300,
		max: 3_000,
		step: 100,
		default: 800,
		format: "currency",
	},
	servicos: {
		id: "monthlyBudget",
		label: "Parcela mensal",
		min: 200,
		max: 2_000,
		step: 100,
		default: 500,
		format: "currency",
	},
};

const TIMEFRAME_OPTIONS: GatePartOption[] = [
	{ value: "0", label: "Já! (com lance)" },
	{ value: "24", label: "1 a 2 anos" },
	{ value: "60", label: "3 a 5 anos" },
	{ value: "120", label: "Sem pressa" },
];

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
				fields: [CREDIT_SLIDER_BY_CATEGORY[category], MONTHLY_SLIDER_BY_CATEGORY[category]],
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
		case "doubts-wait":
		case "search":
			return null;
	}
}

async function applyLeadStage(
	conversationId: string,
	stage: "engajado" | "qualificado",
): Promise<void> {
	try {
		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, conversationId),
		});
		if (lead) {
			await transitionLeadStage(lead.id, stage, { type: "system" }, { onlyAdvance: true });
		}
	} catch (err) {
		console.error("[web-adapter] auto-transition failed:", err);
	}
}

const WELCOME_OPTIONS: GatePartOption[] = [
	{ value: "imovel", label: "Imóvel" },
	{ value: "auto", label: "Automóvel" },
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
					data: { type: ev.artifactType, payload: ev.payload },
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
				await applyLeadStage(conversationId, ev.stage as "engajado" | "qualificado");
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
}): Promise<void> {
	const { conversationId, userText, contactName, writer } = args;
	const events = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName,
		skipLeadCollection: true,
	});
	await pipeOrchestratorToWriter(events, writer, conversationId);
}

export async function pipeDirectiveTurn(args: {
	conversationId: string;
	directive: string;
	contactName: string | null;
	writer: Writer;
}): Promise<void> {
	const { conversationId, directive, contactName, writer } = args;
	const events = runTurn({
		channel: "web",
		conversationId,
		userText: directive,
		isUserTurn: false,
		contactName,
		skipAnalyzer: true,
		skipLeadCollection: true,
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
}): Promise<void> {
	const { conversationId, fromPersona, toCategory, expertiseHint, contactName, writer } = args;
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
	});
}

export async function pipeSearchSummaryTurn(args: {
	conversationId: string;
	contactName: string | null;
	writer: Writer;
}): Promise<void> {
	const { conversationId, contactName, writer } = args;
	const refreshed = await reloadMeta(conversationId);
	if (refreshed.searchDispatched) return;
	const category = refreshed.currentCategory;
	if (!category) return;
	await persistMeta(conversationId, { ...refreshed, searchDispatched: true });
	const directive = buildSearchSummaryDirective({ category, meta: refreshed });
	await pipeDirectiveTurn({ conversationId, directive, contactName, writer });
}
