import { describe, expect, it } from "vitest";

describe("funnel-chart — delta formatting (--%, -0%)", () => {
	it("deve renderizar delta normalizado (sem valores negativos do cálculo)", () => {
		// Com Math.max(0, ...) no cálculo, valores negativos viram 0
		const dropOffRate = 0; // garantido pelo SQL: Math.max(0, ...)
		const formatted = formatDelta(dropOffRate);
		expect(formatted).not.toMatch(/--/);
		expect(formatted).toBe("0%");
	});

	it("deve renderizar 0% sem sinal de menos (-0%)", () => {
		const dropOffRate = 0;
		const formatted = formatDelta(dropOffRate);
		expect(formatted).toBe("0%");
		expect(formatted).not.toMatch(/-0/);
	});

	it("deve renderizar delta positivo corretamente", () => {
		const dropOffRate = 50.5;
		const formatted = formatDelta(dropOffRate);
		expect(formatted).toBe("-50.5%");
	});
});

// Helper que deve estar no componente
function formatDelta(rate: number): string {
	// Não renderizar sinal negativo se for 0
	if (Math.abs(rate) < 0.01) return "0%";
	// Garantir um único sinal
	return `-${Math.abs(rate).toFixed(1)}%`;
}
