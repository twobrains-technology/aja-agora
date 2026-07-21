// FIX-360 — nó `advance`: transições de rapport (motivo/espelho) e os
// marcadores de dispatch/resposta dos gates pós-reveal que `nextGate`/
// `decideShowGate` (reusados em route.ts) LEEM mas não escrevem. Unitário,
// sem DB/modelo — só o predicado + a mutação de estado.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { AgentGraphStateType, FunnelState } from "../state";
import { advanceFunnelNode, detectYesNoText } from "./advance";

const BASE_FUNNEL: FunnelState = {
	currentPersona: "auto",
	currentCategory: "auto",
	desireAsked: true,
	qualifyAnswers: {},
	identityCollected: false,
	searchDispatched: false,
	revealCompleted: false,
	decisionDispatched: false,
};

function fakeState(overrides?: Partial<AgentGraphStateType>): AgentGraphStateType {
	const baseMeta: ConversationMetadata = { currentPersona: "auto", currentCategory: "auto" };
	return {
		messages: [],
		conversationId: "00000000-0000-4000-8000-000000000123",
		channel: "web",
		contactName: null,
		isUserTurn: true,
		userText: "",
		baseMeta,
		intent: "neutral",
		gate: undefined,
		funnel: BASE_FUNNEL,
		events: [],
		...overrides,
	} as AgentGraphStateType;
}

describe("FIX-360 — advanceFunnelNode: turno de servidor é no-op", () => {
	it("isUserTurn=false não muda nada", () => {
		const result = advanceFunnelNode(fakeState({ isUserTurn: false }));
		expect(result).toEqual({});
	});
});

describe("FIX-360 — advanceFunnelNode: rapport (motivo → espelho)", () => {
	it("desire respondido, sem motivo ainda, motivationAsked ausente → marca motivationAsked", () => {
		const state = fakeState({
			funnel: { ...BASE_FUNNEL, desireAnswered: true },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.motivationAsked).toBe(true);
		expect(result.funnel?.motivationMirrored).toBeUndefined();
	});

	it("motivo já perguntado + motivation capturado + ainda não espelhado → marca motivationMirrored", () => {
		const state = fakeState({
			funnel: {
				...BASE_FUNNEL,
				desireAnswered: true,
				motivationAsked: true,
				qualifyAnswers: { motivation: "carro vive na oficina" },
			},
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.motivationMirrored).toBe(true);
	});

	it("nunca marca os dois beats no mesmo turno", () => {
		const state = fakeState({
			funnel: { ...BASE_FUNNEL, desireAnswered: true },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.motivationAsked).toBe(true);
		expect(result.funnel?.motivationMirrored).toBeFalsy();
	});
});

describe("FIX-360 — advanceFunnelNode: reco-consent (dispatch → resposta)", () => {
	it("1ª vez que o gate aparece → marca recoConsentDispatched (não responde ainda)", () => {
		const state = fakeState({
			gate: "reco-consent",
			userText: "sim, mostra ai",
			funnel: { ...BASE_FUNNEL, revealCompleted: true },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.recoConsentDispatched).toBe(true);
		expect(result.funnel?.recoConsentAnswered).toBeUndefined();
	});

	it("já dispatched + resposta afirmativa por texto → marca recoConsentAnswered", () => {
		const state = fakeState({
			gate: "reco-consent",
			userText: "bora, quero ver",
			funnel: { ...BASE_FUNNEL, revealCompleted: true, recoConsentDispatched: true },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.recoConsentAnswered).toBe(true);
	});

	it("já dispatched + intent de dúvida → NÃO marca resposta (deixa o agente conversar)", () => {
		const state = fakeState({
			gate: "reco-consent",
			userText: "o que é isso exatamente?",
			intent: "asking_question",
			funnel: { ...BASE_FUNNEL, revealCompleted: true, recoConsentDispatched: true },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.recoConsentAnswered).toBeUndefined();
	});
});

describe("FIX-360 — advanceFunnelNode: simulator-offer (dispatch na emissão)", () => {
	it("gate ativo, ainda não dispatched → marca simulatorOfferDispatched", () => {
		const state = fakeState({
			gate: "simulator-offer",
			userText: "quero sim",
			funnel: { ...BASE_FUNNEL, revealCompleted: true },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.simulatorOfferDispatched).toBe(true);
	});

	it("já dispatched → idempotente (nextGate/qualify-state.ts nunca lê simulatorOfferAnswered)", () => {
		const state = fakeState({
			gate: "simulator-offer",
			userText: "de novo",
			funnel: { ...BASE_FUNNEL, revealCompleted: true, simulatorOfferDispatched: true },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.simulatorOfferDispatched).toBe(true);
	});
});

describe("FIX-360 — advanceFunnelNode: lance-embutido (educação + opt-in por texto)", () => {
	it("resposta afirmativa → lanceEmbutido=true + percent default (30)", () => {
		const state = fakeState({
			gate: "lance-embutido",
			userText: "sim, quero",
			funnel: { ...BASE_FUNNEL, revealCompleted: true, qualifyAnswers: { hasLance: "yes" } },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.qualifyAnswers.lanceEmbutido).toBe(true);
		expect(result.funnel?.qualifyAnswers.lanceEmbutidoPercent).toBe(30);
	});

	it("resposta negativa → lanceEmbutido=false, sem percent", () => {
		const state = fakeState({
			gate: "lance-embutido",
			userText: "não, obrigado",
			funnel: { ...BASE_FUNNEL, revealCompleted: true, qualifyAnswers: { hasLance: "yes" } },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.qualifyAnswers.lanceEmbutido).toBe(false);
		expect(result.funnel?.qualifyAnswers.lanceEmbutidoPercent).toBeUndefined();
	});

	it("resposta ambígua (pergunta) → NÃO resolve (fica pendente, sem loop)", () => {
		const state = fakeState({
			gate: "lance-embutido",
			userText: "como assim, o que é isso?",
			intent: "confused",
			funnel: { ...BASE_FUNNEL, revealCompleted: true, qualifyAnswers: { hasLance: "yes" } },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.qualifyAnswers.lanceEmbutido).toBeUndefined();
	});
});

describe("FIX-360 — advanceFunnelNode: lance-value (backstop determinístico, nunca derivado)", () => {
	it("valor explícito no texto ('50 mil') vira lanceValue", () => {
		const state = fakeState({
			gate: "lance-value",
			userText: "uns 50 mil",
			funnel: { ...BASE_FUNNEL, revealCompleted: true, qualifyAnswers: { hasLance: "yes" } },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.qualifyAnswers.lanceValue).toBe(50_000);
	});

	it("texto sem número claro → não seta lanceValue (nunca inventa)", () => {
		const state = fakeState({
			gate: "lance-value",
			userText: "não sei bem quanto",
			funnel: { ...BASE_FUNNEL, revealCompleted: true, qualifyAnswers: { hasLance: "yes" } },
		});
		const result = advanceFunnelNode(state);
		expect(result.funnel?.qualifyAnswers.lanceValue).toBeUndefined();
	});
});

describe("FIX-360 — detectYesNoText: filtro de intent + marcadores", () => {
	it("pergunta/dúvida/confuso/off-topic/quer-mais-opções nunca contam como resposta", () => {
		expect(detectYesNoText("sim", "asking_question")).toBeNull();
		expect(detectYesNoText("sim", "expressing_doubt")).toBeNull();
		expect(detectYesNoText("sim", "confused")).toBeNull();
		expect(detectYesNoText("sim", "off_topic")).toBeNull();
		expect(detectYesNoText("sim", "wants_more_options")).toBeNull();
	});

	it("não > sim quando os dois aparecem (nunca, mas prova a ordem de checagem)", () => {
		expect(detectYesNoText("não, não quero", "neutral")).toBe(false);
	});
});
