// FIX-228 — paridade WhatsApp do card embedded_bid (guard repo-wide exige
// mapper pra TODA tool em PRESENTATION_TOOLS, ver
// tests/regression/agent-trajectory.test.ts BUG-WHATSAPP-DROP).

import { describe, expect, it } from "vitest";
import { embeddedBidToWhatsApp } from "./formatter";

describe("embeddedBidToWhatsApp", () => {
	it("SEMPRE diz que o crédito recebido diminui, mesmo sem disclaimer no payload", () => {
		const wa = embeddedBidToWhatsApp({
			maxEmbutidoPct: 30,
			creditValue: 120_000,
			embeddedBidValue: 36_000,
			netCredit: 84_000,
		});
		expect(wa.type).toBe("text");
		expect((wa as { text: string }).text).toMatch(/cr[ée]dito recebido diminui/i);
	});

	it("mostra o crédito líquido real formatado em BRL", () => {
		const wa = embeddedBidToWhatsApp({
			embeddedBidValue: 36_000,
			netCredit: 84_000,
		});
		expect((wa as { text: string }).text).toMatch(/84\.000/);
	});
});
