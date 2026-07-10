// FIX-268 (rodada 7, veredito Fable r6, residual D4): o chip "Sim" do gate
// `lance` na web dizia "Sim, tenho reserva" — mesma palavra sensível varrida
// da pergunta (gate-questions.ts) e do resto do fechamento (FIX-234/FIX-256).
import { describe, expect, it } from "vitest";
import { gatePartData } from "./adapter";

describe("FIX-268 — chips do gate lance (web) não usam 'reserva'", () => {
	it("nenhuma option do chip 'lance' contém a palavra 'reserva'", () => {
		const data = gatePartData("lance", {} as never);
		expect(data).not.toBeNull();
		expect(data?.kind).toBe("chips");
		if (data?.kind === "chips") {
			expect(data.options.length).toBeGreaterThan(0);
			for (const opt of data.options) {
				expect(opt.label.toLowerCase()).not.toMatch(/\breserva/);
			}
		}
	});
});
