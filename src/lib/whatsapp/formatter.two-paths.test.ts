// FIX-229 — paridade WhatsApp do card two_paths (guard repo-wide exige
// mapper pra TODA tool em PRESENTATION_TOOLS).

import { describe, expect, it } from "vitest";
import { twoPathsToWhatsApp } from "./formatter";

describe("twoPathsToWhatsApp", () => {
	it("apresenta os 2 caminhos como botões, sem % de chance/probabilidade", () => {
		const wa = twoPathsToWhatsApp({ monthlyPayment: 812, administradora: "CANOPUS" });
		expect(wa.type).toBe("interactive");
		const text = JSON.stringify(wa);
		expect(text).not.toMatch(/\d+%\s*(de\s*)?chance/i);
		expect(text).not.toMatch(/probabilidade/i);
		expect(text).toMatch(/sorteio/i);
		expect(text).toMatch(/lance/i);
	});

	it("os 2 botões têm título dentro do limite de 20 chars do WhatsApp", () => {
		const wa = twoPathsToWhatsApp({ monthlyPayment: 812 });
		if (wa.type === "interactive" && wa.interactive?.type === "button") {
			for (const btn of wa.interactive.action?.buttons ?? []) {
				expect((btn.reply?.title ?? "").length).toBeLessThanOrEqual(20);
			}
		}
	});
});
