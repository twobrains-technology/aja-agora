import { describe, expect, it } from "vitest";
import rates from "./rates.json";

describe("rates.json (bug #02: moto ausente nas rates)", () => {
	it("contém entradas com category='moto'", () => {
		const motoRates = rates.filter((r) => r.category === "moto");
		expect(motoRates.length).toBeGreaterThan(0);
	});

	it("tem rate de moto pras 3 administradoras que ofertam grupos moto (Bradesco, Estrela, Alianca)", () => {
		const motoAdmins = new Set(rates.filter((r) => r.category === "moto").map((r) => r.administradora));
		expect(motoAdmins).toContain("Bradesco Consorcios");
		expect(motoAdmins).toContain("Consorcio Estrela");
		expect(motoAdmins).toContain("Grupo Alianca");
	});

	it("rate de moto tem adminFee razoável (entre 10% e 25%)", () => {
		const motoRates = rates.filter((r) => r.category === "moto");
		for (const r of motoRates) {
			expect(r.adminFeePercent).toBeGreaterThanOrEqual(10);
			expect(r.adminFeePercent).toBeLessThanOrEqual(25);
		}
	});
});
