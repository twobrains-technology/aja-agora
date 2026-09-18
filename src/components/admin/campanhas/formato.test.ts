// A copy dos três motivos de 'sem base' — o que o operador LÊ.
//
// Antes, os três caíam no mesmo 'sem base', que não diz o que fazer. Aqui o
// teste trava o texto e o ícone (por motivo) para os três continuarem distintos,
// e prova que custo calculado sai como reais — nunca como texto de motivo.

import { describe, expect, it } from "vitest";
import { descreverCusto, inteiro, reais } from "./formato";

describe("descreverCusto", () => {
	it("valor vira R$ e não carrega motivo", () => {
		const d = descreverCusto({ tipo: "valor", centavos: 30_000 });
		expect(d.texto).toBe("R$\u00a0300,00");
		expect(d.motivo).toBeNull();
	});

	it("os três motivos têm textos e ícones distintos (nada de 'sem base')", () => {
		const textos = [
			descreverCusto({ tipo: "motivo", motivo: "sem_qualificado" }),
			descreverCusto({ tipo: "motivo", motivo: "sem_gasto" }),
			descreverCusto({ tipo: "motivo", motivo: "sem_vinculo" }),
		];
		expect(textos.map((t) => t.texto)).toEqual([
			"Sem qualificado no período",
			"Sem gasto informado",
			"Sem vínculo com o CRM",
		]);
		expect(new Set(textos.map((t) => t.motivo)).size).toBe(3);
		for (const t of textos) {
			// Regex em vez de string: o texto proibido não aparece literal no fonte.
			expect(t.texto.toLowerCase()).not.toMatch(/sem base/);
			expect(t.tooltip.length).toBeGreaterThan(20);
		}
	});
});

describe("reais e inteiro", () => {
	it("formata no padrão brasileiro", () => {
		expect(reais(123_456)).toBe("R$\u00a01.234,56");
		expect(inteiro(1234)).toBe("1.234");
	});
});
