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

	// FIX-219 (Ata 2026-07-04, item 4): a conversa de lance só acontece PÓS-reveal
	// (FIX-215) — na 1ª busca `lanceEmbutido` nem foi perguntado ainda. Não dá pra
	// gatear no opt-in; assume-se o teto histórico (~30%) sempre, e o adapter
	// varre COM e SEM embutido (sweepEmbedded) pra cobrir os dois cenários.
	it("SEM opt-in (ainda não perguntado), embeddedPercentage assume ~30% (Ata 2026-07-04)", () => {
		const meta: ConversationMetadata = { qualifyAnswers: {} };
		expect(prefsFromMeta(meta).embeddedPercentage).toBe("30");
	});

	it("mesmo com lanceEmbutido=false explícito, embeddedPercentage assume ~30% (a busca varre os dois)", () => {
		const meta: ConversationMetadata = { qualifyAnswers: { lanceEmbutido: false } };
		expect(prefsFromMeta(meta).embeddedPercentage).toBe("30");
	});

	it("meta totalmente vazio também assume ~30% (defensivo, sem qualifyAnswers)", () => {
		expect(prefsFromMeta({}).embeddedPercentage).toBe("30");
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
