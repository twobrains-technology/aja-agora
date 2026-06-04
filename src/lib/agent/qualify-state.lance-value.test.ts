import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

// Gate "lance-value" — docx passo 2 (linha 21-22): se o usuário TEM reserva
// pra lance ("sim"), perguntar "Qual valor aproximado?". Antes do fix, o valor
// era derivado SILENCIOSAMENTE como 30% do crédito (route.ts) — o usuário
// nunca informava quanto pretendia dar. Auditoria 2026-06-04: MISSING.

function base(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentCategory: "auto",
		experiencePrev: "first",
		qualifyConsented: true,
		identityCollected: true,
		qualifyAnswers: { creditMax: 100_000, prazoMeses: 12 },
		...over,
	};
}

describe("nextGate — gate lance-value (docx: 'Qual valor aproximado?')", () => {
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

	it("fluxo completo yes: lance → lance-value → lance-embutido → search", () => {
		const meta = base();
		meta.qualifyAnswers = { ...meta.qualifyAnswers, hasLance: "yes" };
		expect(nextGate(meta)).toBe("lance-value");

		meta.qualifyAnswers.lanceValue = 25_000;
		expect(nextGate(meta)).toBe("lance-embutido");

		meta.qualifyAnswers.lanceEmbutido = true;
		expect(nextGate(meta)).toBe("search");
	});
});
