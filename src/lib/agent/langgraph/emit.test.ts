// FIX-357 — `projectToMeta` não pode ser "diff cego": prova o CONJUNTO
// EXPLÍCITO de campos que o funnel projeta, e que campos do meta legado
// (fora do slice desta fundação) sobrevivem intactos no merge.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { metaUpdateEvent, projectToMeta, TURN_EVENT_TYPES } from "./emit";
import type { AgentGraphStateType, FunnelState } from "./state";

const baseMeta: ConversationMetadata = {
	currentPersona: "concierge",
	// campo FORA do slice desta fundação — tem que sobreviver ao merge.
	whatsappOptinShown: true,
	contractClosed: false,
	qualifyAnswers: {
		// campo de QualifyAnswers fora do slice — também tem que sobreviver.
		// (FIX-360 trouxe hasLance/lanceValue/prazoMeses/lanceEmbutido* PRA
		// DENTRO do slice — monthlySavings/fgtsValue seguem fora.)
		monthlySavings: 4_000,
		fgtsValue: 12_000,
	},
};

const funnel: FunnelState = {
	currentPersona: "auto",
	currentCategory: "auto",
	desireAsked: true,
	qualifyAnswers: {
		creditMin: 45_000,
		creditMax: 90_000,
		desiredItem: "um Corolla",
		motivation: "carro vive na oficina",
	},
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	recommendedAdministradora: "CANOPUS",
	recommendedOffer: {
		administradora: "CANOPUS",
		category: "auto",
		creditValue: 90_000,
		termMonths: 72,
		monthlyPayment: 812,
		groupId: "grupo-real-abc",
	},
	decisionDispatched: false,
};

function fakeState(overrides?: Partial<AgentGraphStateType>): AgentGraphStateType {
	return {
		messages: [],
		conversationId: "conv-1",
		channel: "web",
		contactName: null,
		isUserTurn: true,
		userText: "oi",
		baseMeta,
		intent: undefined,
		gate: undefined,
		funnel,
		events: [],
		...overrides,
	} as AgentGraphStateType;
}

describe("FIX-357 — projectToMeta: conjunto explícito, não diff cego", () => {
	it("projeta os campos do funnel por cima do baseMeta", () => {
		const projected = projectToMeta(fakeState());

		expect(projected.currentPersona).toBe("auto");
		expect(projected.currentCategory).toBe("auto");
		expect(projected.identityCollected).toBe(true);
		expect(projected.searchDispatched).toBe(true);
		expect(projected.revealCompleted).toBe(true);
		expect(projected.recommendedAdministradora).toBe("CANOPUS");
		expect(projected.recommendedOffer).toEqual(funnel.recommendedOffer);
		expect(projected.qualifyAnswers?.creditMax).toBe(90_000);
		expect(projected.qualifyAnswers?.desiredItem).toBe("um Corolla");
	});

	it("NUNCA apaga campos do meta legado fora do slice desta fundação", () => {
		const projected = projectToMeta(fakeState());

		expect(projected.whatsappOptinShown).toBe(true);
		expect(projected.contractClosed).toBe(false);
		// QualifyAnswers fora do slice (monthlySavings/fgtsValue) sobrevive junto.
		expect(projected.qualifyAnswers?.monthlySavings).toBe(4_000);
		expect(projected.qualifyAnswers?.fgtsValue).toBe(12_000);
	});

	it("metaUpdateEvent embrulha a mesma projeção no formato TurnEvent", () => {
		const ev = metaUpdateEvent(fakeState());
		expect(ev.type).toBe("meta-update");
		expect(ev.meta).toEqual(projectToMeta(fakeState()));
	});
});

describe("FIX-357 — contrato dos 14 TurnEvent", () => {
	it("documenta exatamente os 14 tipos que os adapters consomem", () => {
		expect(TURN_EVENT_TYPES).toHaveLength(14);
		expect(new Set(TURN_EVENT_TYPES).size).toBe(14);
	});
});
