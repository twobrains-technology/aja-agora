import { describe, expect, it } from "vitest";
import { WELCOME_OPTIONS } from "./adapter";

describe("WELCOME_OPTIONS (bug #02: moto ausente nos cards da landing)", () => {
	it("inclui 'moto' como uma das categorias do welcome", () => {
		const values = WELCOME_OPTIONS.map((o) => o.value);
		expect(values).toContain("moto");
	});

	it("tem exatamente 4 categorias: imovel, auto, moto, servicos", () => {
		const values = WELCOME_OPTIONS.map((o) => o.value).sort();
		expect(values).toEqual(["auto", "imovel", "moto", "servicos"]);
	});

	it("'moto' tem label exibido como 'Moto'", () => {
		const moto = WELCOME_OPTIONS.find((o) => o.value === "moto");
		expect(moto?.label).toBe("Moto");
	});
});
