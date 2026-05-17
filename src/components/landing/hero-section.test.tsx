import { describe, it, expect } from "vitest";
import { GOALS } from "./hero-section";

describe("HeroSection.GOALS — chips de categoria (bugs #01 #02)", () => {
	it("inclui chip 'Imóvel'", () => {
		const imovel = GOALS.find((g) => g.id === "imovel");
		expect(imovel).toBeDefined();
		expect(imovel?.label).toMatch(/im[óo]vel/i);
	});

	it("inclui chip 'Carro' (auto)", () => {
		const auto = GOALS.find((g) => g.id === "auto");
		expect(auto).toBeDefined();
		expect(auto?.label).toMatch(/carro/i);
	});

	it("inclui chip 'Moto' (#01 — categoria nova)", () => {
		const moto = GOALS.find((g) => g.id === "moto");
		expect(moto).toBeDefined();
		expect(moto?.label).toMatch(/^moto$/i);
	});

	it("NÃO inclui chip 'Serviços' (#02 — removido da landing)", () => {
		const servicos = GOALS.find((g) => g.id === "servicos");
		expect(servicos).toBeUndefined();
	});

	it("são exatamente 3 chips (Imóvel/Carro/Moto)", () => {
		expect(GOALS.length).toBe(3);
		const ids = GOALS.map((g) => g.id).sort();
		expect(ids).toEqual(["auto", "imovel", "moto"]);
	});

	it("chip Moto tem mensagem coerente", () => {
		const moto = GOALS.find((g) => g.id === "moto");
		expect(moto?.message).toMatch(/moto/i);
		expect(moto?.message).toMatch(/cons[óo]rcio/i);
	});
});
