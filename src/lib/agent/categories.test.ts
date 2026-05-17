import { describe, it, expect } from "vitest";
import { CATEGORY_META } from "./categories";
import type { Category } from "./personas";

describe("Category type + CATEGORY_META (bug #01 — adicionar moto)", () => {
	it("Category aceita 'moto' como literal válido", () => {
		const c: Category = "moto";
		expect(c).toBe("moto");
	});

	it("Category aceita os 4 valores: imovel, auto, moto, servicos", () => {
		// Type-only check; the array existence proves typecheck passed
		const all: Category[] = ["imovel", "auto", "moto", "servicos"];
		expect(all).toEqual(["imovel", "auto", "moto", "servicos"]);
	});

	it("CATEGORY_META tem entry para 'moto' com label 'Moto'", () => {
		expect(CATEGORY_META.moto).toBeDefined();
		expect(CATEGORY_META.moto.label).toMatch(/^moto$/i);
	});

	it("CATEGORY_META preserva entries existentes (imovel, auto, servicos)", () => {
		expect(CATEGORY_META.imovel.label).toMatch(/im[óo]vel/i);
		expect(CATEGORY_META.auto.label).toMatch(/autom[óo]vel|carro/i);
		expect(CATEGORY_META.servicos.label).toMatch(/servi[çc]os?/i);
	});
});
