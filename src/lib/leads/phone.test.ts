import { describe, expect, it } from "vitest";
import { normalizePhoneBR } from "./phone";

describe("normalizePhoneBR", () => {
	it("aceita 11 dígitos (DDD + 9 inicial + 8 dígitos)", () => {
		expect(normalizePhoneBR("11987654321")).toBe("11987654321");
	});

	it("aceita 10 dígitos (DDD + 8 dígitos, fixo)", () => {
		expect(normalizePhoneBR("1133334444")).toBe("1133334444");
	});

	it("remove código do país 55", () => {
		expect(normalizePhoneBR("5511987654321")).toBe("11987654321");
	});

	it("remove formatação com parênteses", () => {
		expect(normalizePhoneBR("(11) 98765-4321")).toBe("11987654321");
	});

	it("remove formatação com +55 e espaços", () => {
		expect(normalizePhoneBR("+55 11 98765 4321")).toBe("11987654321");
	});

	it("rejeita telefone sem DDD", () => {
		expect(normalizePhoneBR("987654321")).toBeNull();
	});

	it("rejeita string vazia", () => {
		expect(normalizePhoneBR("")).toBeNull();
	});

	it("rejeita só letras", () => {
		expect(normalizePhoneBR("abc")).toBeNull();
	});

	it("rejeita DDD inválido (começa com 0)", () => {
		expect(normalizePhoneBR("01987654321")).toBeNull();
	});

	it("rejeita 12 dígitos sem código país", () => {
		expect(normalizePhoneBR("119876543210")).toBeNull();
	});
});
