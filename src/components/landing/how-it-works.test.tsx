import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS_COPY, STEPS } from "./how-it-works";

describe("HowItWorks — landing foco em benefícios (bugs #03 #19)", () => {
	it("tem 5 steps na ordem certa", () => {
		expect(STEPS.length).toBe(5);
		const titles = STEPS.map((s) => s.title);
		expect(titles[0]).toMatch(/escolha|plano/i);
		expect(titles[1]).toMatch(/simula/i);
		expect(titles[2]).toMatch(/grupo/i);
		expect(titles[3]).toMatch(/contempla/i);
		expect(titles[4]).toMatch(/realiz|objetivo/i);
	});

	it("cada step tem ícone lucide (#19)", () => {
		for (const step of STEPS) {
			expect(step.icon, `step '${step.title}' sem ícone`).toBeDefined();
		}
	});

	it("steps numerados 01-05 (#19)", () => {
		const numbers = STEPS.map((s) => s.step);
		expect(numbers).toEqual(["01", "02", "03", "04", "05"]);
	});

	it("copy contém palavras-chave de BENEFÍCIO do consórcio (#03)", () => {
		const all = [
			HOW_IT_WORKS_COPY.subtitle,
			HOW_IT_WORKS_COPY.description,
			...STEPS.flatMap((s) => [s.title, s.description]),
		].join(" ");
		expect(all).toMatch(/sem juros/i);
		expect(all).toMatch(/parcela/i);
		expect(all).toMatch(/lance/i);
		expect(all).toMatch(/contempla/i);
	});

	it("copy NÃO menciona 'IA', '100% IA' ou 'agente inteligente' (#03)", () => {
		const all = [
			HOW_IT_WORKS_COPY.subtitle,
			HOW_IT_WORKS_COPY.description,
			...STEPS.flatMap((s) => [s.title, s.description]),
		].join(" ");
		expect(all).not.toMatch(/100\s*%\s*IA/i);
		expect(all).not.toMatch(/agente inteligente/i);
		expect(all).not.toMatch(/intelig[êe]ncia artificial/i);
		expect(all).not.toMatch(/\bIA\b/);
	});
});
