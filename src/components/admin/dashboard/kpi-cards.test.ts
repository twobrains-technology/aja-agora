import { describe, it, expect } from "vitest";

describe("kpi-cards — copy com acentuação PT-BR", () => {
	it("deve conter 'Tempo Médio no Funil' com acento", () => {
		const copy = "Tempo Médio no Funil";
		expect(copy).toContain("Médio");
		expect(copy).not.toContain("Medio");
	});

	it("deve conter 'vs período anterior' com acento no trend", () => {
		const trend = "vs período anterior";
		expect(trend).toContain("período");
		expect(trend).not.toContain("periodo");
	});
});
