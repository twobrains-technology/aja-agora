import { describe, expect, it } from "vitest";
import { clientePedeFechar, decidirRota } from "./rota-do-humano";

describe("clientePedeFechar", () => {
	it.each(["bora fechar", "quero fechar", "quero contratar", "Quero Fechar!"])("%s → true", (t) => {
		expect(clientePedeFechar(t)).toBe(true);
	});

	it.each([
		"e se eu não for contemplado?",
		"quero falar com uma pessoa",
		"qual a taxa?",
		"",
		null,
		undefined,
	])("%s → false", (t) => {
		expect(clientePedeFechar(t)).toBe(false);
	});
});

describe("decidirRota", () => {
	it("sem proposta e sem pedido de fechar → fila", () => {
		expect(decidirRota({ temProposta: false, pediuFechar: false })).toBe("fila");
	});
	it("com proposta → mesa", () => {
		expect(decidirRota({ temProposta: true, pediuFechar: false })).toBe("mesa");
	});
	it("pediu fechar → mesa", () => {
		expect(decidirRota({ temProposta: false, pediuFechar: true })).toBe("mesa");
	});
});
