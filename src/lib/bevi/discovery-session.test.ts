import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { discoverySessionForConversation, prefsFromMeta } from "./discovery-session";

describe("prefsFromMeta — preferências de simulação a partir da qualificação", () => {
	it("opt-in de lance embutido vira embeddedPercentage '30'", () => {
		const meta: ConversationMetadata = {
			qualifyAnswers: { lanceEmbutido: true, lanceEmbutidoPercent: 30 },
		};
		expect(prefsFromMeta(meta).embeddedPercentage).toBe("30");
	});

	it("sem opt-in, embeddedPercentage é omitido (sem default escondido)", () => {
		const meta: ConversationMetadata = { qualifyAnswers: { lanceEmbutido: false } };
		expect(prefsFromMeta(meta).embeddedPercentage).toBeUndefined();
	});

	it("objetivo investimento (sem pressa) vira INVESTMENT; resto FAST_APPROVAL", () => {
		expect(prefsFromMeta({ qualifyAnswers: { objetivo: "investimento" } }).objective).toBe(
			"INVESTMENT",
		);
		expect(prefsFromMeta({ qualifyAnswers: { objetivo: "contemplacao_rapida" } }).objective).toBe(
			"FAST_APPROVAL",
		);
		expect(prefsFromMeta({}).objective).toBe("FAST_APPROVAL");
	});
});

describe("discoverySessionForConversation — provider por conversa", () => {
	it("getIdentity delega pro loader cifrado da conversa", async () => {
		const session = discoverySessionForConversation("conv-1", {
			loadIdentityImpl: async (id) =>
				id === "conv-1" ? { cpf: "52998224725", celular: "62999887766" } : null,
			reloadMetaImpl: async () => ({}),
		});
		expect(await session.getIdentity()).toEqual({ cpf: "52998224725", celular: "62999887766" });
	});

	it("getSimulationPrefs lê o meta atual da conversa", async () => {
		const session = discoverySessionForConversation("conv-1", {
			loadIdentityImpl: async () => null,
			reloadMetaImpl: async () => ({
				qualifyAnswers: { lanceEmbutido: true, lanceEmbutidoPercent: 50, objetivo: "investimento" },
			}),
		});
		expect(await session.getSimulationPrefs()).toEqual({
			embeddedPercentage: "50",
			objective: "INVESTMENT",
		});
	});
});
