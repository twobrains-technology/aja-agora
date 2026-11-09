import { describe, expect, it } from "vitest";
import { falaDeInteresseNaCarta } from "./fala-de-interesse";

describe("falaDeInteresseNaCarta", () => {
	it("usa valor redondo em mil e o prazo da carta", () => {
		expect(
			falaDeInteresseNaCarta({ administradora: "CANOPUS", creditValue: 240_000, termMonths: 116 }),
		).toBe("Me interessei na CANOPUS de R$ 240 mil, prazo de 116 meses");
	});
	it("valor quebrado vai em BRL pt-BR", () => {
		const t = falaDeInteresseNaCarta({
			administradora: "Itaú",
			creditValue: 240_452,
			termMonths: 47,
		});
		expect(t).toContain("R$");
		expect(t).toContain("240.452");
		expect(t).not.toMatch(/simul/i);
	});
	it("sem valor ou prazo, omite o trecho", () => {
		expect(falaDeInteresseNaCarta({ administradora: "Canopus" })).toBe("Me interessei na Canopus");
	});
});
