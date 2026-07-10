// FIX-268 (rodada 7, veredito Fable r6, residual D4): mesmo residual de
// "reserva" do gate `lance`, espelhado nos botões do WhatsApp (LANCE_OPTIONS).
import { describe, expect, it } from "vitest";
import { lanceQuestionToWhatsApp } from "./formatter";

describe("FIX-268 — pergunta/botões do gate lance (WhatsApp) não usam 'reserva'", () => {
	it("nem o corpo da mensagem nem os títulos dos botões contêm 'reserva'", () => {
		const res = lanceQuestionToWhatsApp();
		expect(res.interactive?.body?.text?.toLowerCase()).not.toMatch(/\breserva/);
		const buttons = res.interactive?.action?.buttons ?? [];
		expect(buttons.length).toBeGreaterThan(0);
		for (const b of buttons) {
			expect(b.reply.title?.toLowerCase()).not.toMatch(/\breserva/);
		}
	});
});
