// Camada 1 (unit, puro) — FIX-42: normalização e consolidação de identificadores.
// As partes que tocam DB (find-or-create, merge) são cobertas pelo integration
// test (resolve.integration.test.ts).

import { describe, expect, it } from "vitest";
import {
	type Contact,
	consolidateIdentifiers,
	hasIdentifier,
	normalizeContactInput,
} from "./resolve";

describe("normalizeContactInput", () => {
	it("normaliza telefone BR (remove 55, máscara, espaços)", () => {
		expect(normalizeContactInput({ phone: "+55 (62) 99999-6793" }).phone).toBe("62999996793");
	});

	it("telefone inválido → null", () => {
		expect(normalizeContactInput({ phone: "123" }).phone).toBeNull();
	});

	it("CPF aceita só 11 dígitos (limpa máscara)", () => {
		expect(normalizeContactInput({ cpf: "529.982.247-25" }).cpf).toBe("52998224725");
		expect(normalizeContactInput({ cpf: "529982247" }).cpf).toBeNull();
	});

	it("e-mail vira lowercase + trim", () => {
		expect(normalizeContactInput({ email: "  Foo@Bar.COM " }).email).toBe("foo@bar.com");
	});

	it("nome trimado; vazio → null", () => {
		expect(normalizeContactInput({ name: "  Helena " }).name).toBe("Helena");
		expect(normalizeContactInput({ name: "   " }).name).toBeNull();
	});
});

describe("hasIdentifier", () => {
	it("true se phone OU cpf OU email; false só com nome", () => {
		expect(hasIdentifier(normalizeContactInput({ phone: "62999996793" }))).toBe(true);
		expect(hasIdentifier(normalizeContactInput({ name: "Helena" }))).toBe(false);
	});
});

describe("consolidateIdentifiers", () => {
	const base: Contact = {
		id: "p",
		phone: null,
		cpf: null,
		email: null,
		name: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	it("preenche o que falta no primário a partir do input", () => {
		const primary = { ...base, phone: "62999996793" };
		const merged = consolidateIdentifiers(
			primary,
			[],
			normalizeContactInput({ cpf: "529.982.247-25" }),
		);
		expect(merged.phone).toBe("62999996793"); // mantém o do primário
		expect(merged.cpf).toBe("52998224725"); // adiciona o do input
	});

	it("primário tem prioridade sobre secundário no mesmo campo", () => {
		const primary = { ...base, email: "primary@x.com" };
		const other = { ...base, id: "o", email: "other@x.com", phone: "62999996793" };
		const merged = consolidateIdentifiers(primary, [other], normalizeContactInput({}));
		expect(merged.email).toBe("primary@x.com"); // primário ganha
		expect(merged.phone).toBe("62999996793"); // herda do secundário onde o primário é nulo
	});
});
