// FIX-230 — paridade WhatsApp do card scarcity (guard repo-wide exige
// mapper pra TODA tool em PRESENTATION_TOOLS).

import { describe, expect, it } from "vitest";
import { scarcityToWhatsApp } from "./formatter";

describe("scarcityToWhatsApp", () => {
	it("mostra 'restam apenas N' sem total nem razão", () => {
		const wa = scarcityToWhatsApp({ groupCode: "g1", administradora: "X", availableSlots: 3 });
		expect(wa).not.toBeNull();
		expect(wa?.type).toBe("text");
		const text = (wa as { text: string }).text;
		expect(text).toMatch(/restam apenas 3/i);
		expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
		expect(text).not.toMatch(/total/i);
	});

	it("sem availableSlots válido, não envia nada (retorna null)", () => {
		expect(scarcityToWhatsApp({})).toBeNull();
		expect(scarcityToWhatsApp({ availableSlots: undefined })).toBeNull();
	});
});
