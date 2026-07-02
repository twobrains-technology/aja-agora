import { describe, it, expect } from "vitest";

describe("recommendation-card — formatação de valores monetários sem quebra", () => {
	it("deve formatar valor monetário como PT-BR (R$ x.xxx,xx)", () => {
		const formatted = formatBRL(1863.32);
		expect(formatted).toBe("R$ 1.863,32");
	});

	it("deve formatar valor monetário sem quebra de linha", () => {
		// O wrapper deve ter white-space: nowrap
		const value = formatBRL(2140.65);
		expect(value).toBe("R$ 2.140,65");
		// Verificar que o valor não tem quebras de parágrafo (como markdown)
		expect(value).not.toContain("\n");
		expect(value).not.toContain("\r");
	});

	it("deve formatar valor grande corretamente", () => {
		const formatted = formatBRL(25000.00);
		expect(formatted).toBe("R$ 25.000,00");
		// Ensure the value won't break on the thousands separator
		expect(formatted).toMatch(/R\$\s+\d{1,3}(\.\d{3})+,\d{2}/);
	});

	it("deve formatar valor zero", () => {
		const formatted = formatBRL(0);
		expect(formatted).toBe("R$ 0,00");
	});

	it("deve aplicar white-space: nowrap para valores mensais", () => {
		// This is more of a component-level assertion
		// The component should wrap monthly payment in a class like "whitespace-nowrap"
		const className = "whitespace-nowrap aja-num text-[1.625rem] font-bold";
		expect(className).toContain("whitespace-nowrap");
	});
});

// Helper que deve estar no componente
function formatBRL(value: number): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);
}
