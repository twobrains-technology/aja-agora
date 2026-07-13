import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

// Gate "lance-value" — docx passo 2 (linha 21-22): se o usuário TEM reserva
// pra lance ("sim"), perguntar "Qual valor aproximado?". Antes do fix, o valor
// era derivado SILENCIOSAMENTE como 30% do crédito (route.ts) — o usuário
// nunca informava quanto pretendia dar. Auditoria 2026-06-04: MISSING.
// FIX-215 (Refino Ata 2026-07-04): a conversa de lance (e portanto lance-value)
// só entra em jogo PÓS-reveal — `base()` já simula esse estado por padrão.

function base(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		currentCategory: "auto",
		experiencePrev: "first",
		qualifyConsented: true,
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		qualifyAnswers: { creditMax: 100_000, prazoMeses: 12 },
		...over,
	};
}

describe("nextGate — gate lance-value (docx: 'Qual valor aproximado?'; pós-reveal, FIX-215)", () => {
	it("hasLance=yes SEM lanceValue → gate lance-value (antes do lance-embutido)", () => {
		const meta = base();
		meta.qualifyAnswers = { ...meta.qualifyAnswers, hasLance: "yes" };
		expect(nextGate(meta)).toBe("lance-value");
	});

	it("hasLance=yes COM lanceValue → segue pro lance-embutido", () => {
		const meta = base();
		meta.qualifyAnswers = { ...meta.qualifyAnswers, hasLance: "yes", lanceValue: 30_000 };
		expect(nextGate(meta)).toBe("lance-embutido");
	});

	it("hasLance=no/maybe NÃO pergunta valor de lance", () => {
		const noMeta = base();
		noMeta.qualifyAnswers = { ...noMeta.qualifyAnswers, hasLance: "no" };
		expect(nextGate(noMeta)).not.toBe("lance-value");

		const maybeMeta = base();
		maybeMeta.qualifyAnswers = { ...maybeMeta.qualifyAnswers, hasLance: "maybe" };
		expect(nextGate(maybeMeta)).not.toBe("lance-value");
	});

	it("fluxo completo yes: lance → lance-value → lance-embutido → simulator-offer", () => {
		const meta = base();
		meta.qualifyAnswers = { ...meta.qualifyAnswers, hasLance: "yes" };
		expect(nextGate(meta)).toBe("lance-value");

		meta.qualifyAnswers.lanceValue = 25_000;
		expect(nextGate(meta)).toBe("lance-embutido");

		meta.qualifyAnswers.lanceEmbutido = true;
		expect(nextGate(meta)).toBe("simulator-offer");
	});

	it("FIX-215: SEM revealCompleted, hasLance=yes NÃO pede lance-value (funil ainda pré-reveal)", () => {
		const meta = base({ searchDispatched: false, revealCompleted: false });
		meta.qualifyAnswers = { ...meta.qualifyAnswers, hasLance: "yes" };
		expect(nextGate(meta)).toBe("search");
	});
});
