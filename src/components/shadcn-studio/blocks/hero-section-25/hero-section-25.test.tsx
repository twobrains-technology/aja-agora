import { describe, expect, it } from "vitest";
import { GOALS } from "./hero-section-25";

describe("HeroSection25 GOALS (bug #02 round 3: landing widget sem moto)", () => {
	it("inclui categoria 'moto' (decisão Bruna v1 #20 — moto substitui Serviços nos chips da landing)", () => {
		const ids = GOALS.map((g) => g.id);
		expect(ids).toContain("moto");
	});

	it("não tem mais 'servicos' nos cards da landing (substituído por moto)", () => {
		const ids = GOALS.map((g) => g.id);
		expect(ids).not.toContain("servicos");
	});

	it("tem exatamente 3 cards: imovel, auto, moto", () => {
		const ids = GOALS.map((g) => g.id).sort();
		expect(ids).toEqual(["auto", "imovel", "moto"]);
	});

	it("moto tem label 'Moto' e message coerente sobre moto (não cai em fallback genérico)", () => {
		const moto = GOALS.find((g) => g.id === "moto");
		expect(moto?.label).toBe("Moto");
		expect(moto?.message.toLowerCase()).toMatch(/\bmoto\b/);
		expect(moto?.message.toLowerCase()).not.toMatch(/\bservi[çc]os?\b/);
	});
});
