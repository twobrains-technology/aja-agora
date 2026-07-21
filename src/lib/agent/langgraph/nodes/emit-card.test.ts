// FIX-360/361 — nó `emitCard`: cards da coreografia emitidos server-side
// determinísticos (topic_picker, embedded_bid, scarcity, two_paths,
// decision_prompt) — nunca dependentes de tool-call do LLM. Unitário, sem
// DB/modelo.
import { describe, expect, it } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { AgentGraphStateType, FunnelState } from "../state";
import { emitCardNode } from "./emit-card";

const BASE_FUNNEL: FunnelState = {
	currentPersona: "auto",
	currentCategory: "auto",
	desireAsked: true,
	qualifyAnswers: {},
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
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

function artifactTypes(events: TurnEvent[]): string[] {
	return events
		.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
		.map((ev) => ev.artifactType);
}

describe("FIX-360 — emitCardNode: topic_picker (novato, emissão única)", () => {
	it("experiencePrev='first' + ainda não avançou pro reco-consent → emite topic_picker 1x", () => {
		const state = fakeState({
			funnel: { ...BASE_FUNNEL, experiencePrev: "first" },
		});
		const result = emitCardNode(state);
		expect(artifactTypes(result.events ?? [])).toContain("topic_picker");
		expect(result.funnel?.topicPickerDispatched).toBe(true);
	});

	it("já dispatched → NÃO emite de novo", () => {
		const state = fakeState({
			funnel: { ...BASE_FUNNEL, experiencePrev: "first", topicPickerDispatched: true },
		});
		const result = emitCardNode(state);
		expect(artifactTypes(result.events ?? [])).not.toContain("topic_picker");
	});

	it("mesmo turno em que reco-consent também dispara (experience→reco-consent no mesmo turno) → ainda emite (só topicPickerDispatched guarda idempotência)", () => {
		const state = fakeState({
			funnel: { ...BASE_FUNNEL, experiencePrev: "first", recoConsentDispatched: true },
		});
		const result = emitCardNode(state);
		expect(artifactTypes(result.events ?? [])).toContain("topic_picker");
	});

	it("experiencePrev='returning' → nunca emite (só novato)", () => {
		const state = fakeState({
			funnel: { ...BASE_FUNNEL, experiencePrev: "returning" },
		});
		const result = emitCardNode(state);
		expect(artifactTypes(result.events ?? [])).not.toContain("topic_picker");
	});
});

describe("FIX-360 — emitCardNode: embedded_bid (educação + opt-in)", () => {
	it("gate lance-embutido, sem resposta ainda → emite embedded_bid", () => {
		const state = fakeState({
			gate: "lance-embutido",
			funnel: { ...BASE_FUNNEL, qualifyAnswers: { hasLance: "yes" } },
		});
		const result = emitCardNode(state);
		expect(artifactTypes(result.events ?? [])).toContain("embedded_bid");
	});

	it("lanceEmbutido já resolvido (advance já consumiu a resposta) → NÃO re-emite (sem loop, FIX-260)", () => {
		const state = fakeState({
			gate: "lance-embutido",
			funnel: { ...BASE_FUNNEL, qualifyAnswers: { hasLance: "yes", lanceEmbutido: true } },
		});
		const result = emitCardNode(state);
		expect(artifactTypes(result.events ?? [])).not.toContain("embedded_bid");
	});
});

describe("FIX-360 — emitCardNode: decision (scarcity → decision_prompt | two_paths)", () => {
	const offer: ConversationMetadata["recommendedOffer"] = {
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		termMonths: 72,
		monthlyPayment: 812,
		groupId: "grupo-real-abc",
	};

	it("caminho normal: emite scarcity ANTES do decision_prompt", () => {
		const state = fakeState({
			gate: "decision",
			funnel: {
				...BASE_FUNNEL,
				recommendedAdministradora: "CANOPUS",
				recommendedOffer: offer,
				qualifyAnswers: { hasLance: "no" },
			},
		});
		const result = emitCardNode(state);
		const types = artifactTypes(result.events ?? []);
		expect(types.indexOf("scarcity")).toBeGreaterThanOrEqual(0);
		expect(types.indexOf("decision_prompt")).toBeGreaterThan(types.indexOf("scarcity"));
		expect(types).not.toContain("two_paths");
		expect(result.funnel?.decisionDispatched).toBe(true);
	});

	it("hasLance='so_parcela': emite two_paths, NUNCA scarcity nem decision_prompt", () => {
		const state = fakeState({
			gate: "decision",
			funnel: {
				...BASE_FUNNEL,
				recommendedAdministradora: "CANOPUS",
				recommendedOffer: offer,
				qualifyAnswers: { hasLance: "so_parcela" },
			},
		});
		const result = emitCardNode(state);
		const types = artifactTypes(result.events ?? []);
		expect(types).toContain("two_paths");
		expect(types).not.toContain("scarcity");
		expect(types).not.toContain("decision_prompt");
	});

	it("sem groupId ancorado → scarcity nunca fabrica (pula direto pro decision_prompt)", () => {
		const state = fakeState({
			gate: "decision",
			funnel: {
				...BASE_FUNNEL,
				recommendedAdministradora: "CANOPUS",
				recommendedOffer: undefined,
				qualifyAnswers: { hasLance: "no" },
			},
		});
		const result = emitCardNode(state);
		const types = artifactTypes(result.events ?? []);
		expect(types).not.toContain("scarcity");
		expect(types).toContain("decision_prompt");
	});

	it("decisionDispatched já true → idempotente, não re-emite", () => {
		const state = fakeState({
			gate: "decision",
			funnel: {
				...BASE_FUNNEL,
				decisionDispatched: true,
				recommendedAdministradora: "CANOPUS",
				recommendedOffer: offer,
				qualifyAnswers: { hasLance: "no" },
			},
		});
		const result = emitCardNode(state);
		const types = artifactTypes(result.events ?? []);
		expect(types).not.toContain("decision_prompt");
		expect(types).not.toContain("scarcity");
	});
});
