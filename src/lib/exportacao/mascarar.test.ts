import { describe, expect, it } from "vitest";
import { mascararEmail, mascararNome, mascararTelefone } from "./mascarar";

describe("mascarar telefone", () => {
	it("deixa os 5 primeiros e os 4 últimos dígitos", () => {
		expect(mascararTelefone("+5562988887777")).toBe("55629***7777");
		expect(mascararTelefone("+5511999998888")).toBe("55119***8888");
	});

	it("telefone curto demais vira só a máscara, nunca o número cru", () => {
		expect(mascararTelefone("12345678")).toBe("***");
	});

	it("sem dígito nenhum é ausência, não string vazia", () => {
		expect(mascararTelefone(null)).toBeNull();
		expect(mascararTelefone("")).toBeNull();
		expect(mascararTelefone("+")).toBeNull();
	});
});

describe("mascarar e-mail", () => {
	it("preserva a primeira letra e o domínio", () => {
		expect(mascararEmail("maria@dominio.com")).toBe("m***@dominio.com");
	});

	it("texto sem @ ainda esconde o corpo", () => {
		expect(mascararEmail("maria")).toBe("m***");
	});

	it("ausência é null", () => {
		expect(mascararEmail(null)).toBeNull();
		expect(mascararEmail("   ")).toBeNull();
	});
});

describe("mascarar nome", () => {
	it("só o primeiro nome", () => {
		expect(mascararNome("Maria Graciete Souza")).toBe("Maria");
	});

	it("ausência é null", () => {
		expect(mascararNome(null)).toBeNull();
		expect(mascararNome("  ")).toBeNull();
	});
});
