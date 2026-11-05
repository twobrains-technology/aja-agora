import { describe, expect, it } from "vitest";
import { matchesKnownNumber } from "./numeros-falados";

describe("matchesKnownNumber · diferença de valores de tool", () => {
	it("aceita a diferença entre duas parcelas da tela (R$ 42,53)", () => {
		const known = new Set([1176.39, 1218.92]);
		expect(matchesKnownNumber(42.53, known)).toBe(true);
	});
	it("continua recusando número sem conta que o explique", () => {
		const known = new Set([1176.39, 1218.92]);
		expect(matchesKnownNumber(300000, known)).toBe(false);
		expect(matchesKnownNumber(57.1, known)).toBe(false);
	});
});
