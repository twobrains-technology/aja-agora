import { describe, expect, it } from "vitest";
import { PROCESS_STEPS } from "./process";

// Pós-rebranding: o stepper de 5 passos virou os 3 passos da marca (handoff).
// As keywords educativas foram re-ancoradas nas descrições (ver copy.test.ts).
describe("Process — 3 passos da marca, com benefícios re-ancorados", () => {
	it("tem 3 passos na ordem certa", () => {
		expect(PROCESS_STEPS.length).toBe(3);
		const titles = PROCESS_STEPS.map((s) => s.title);
		expect(titles[0]).toMatch(/conta o sonho|sonho/i);
		expect(titles[1]).toMatch(/compara/i);
		// FIX-59 (revisão 2): passo 3 "Seguimos juntos" virou mensagem de privacidade.
		expect(titles[2]).toMatch(/privacidade/i);
	});

	it("cada passo tem ícone lucide", () => {
		for (const step of PROCESS_STEPS) {
			expect(step.icon, `passo '${step.title}' sem ícone`).toBeDefined();
		}
	});

	it("passos numerados 1-3", () => {
		expect(PROCESS_STEPS.map((s) => s.step)).toEqual(["1", "2", "3"]);
	});

	it("copy re-ancora palavras-chave de benefício do consórcio", () => {
		const all = PROCESS_STEPS.flatMap((s) => [s.title, s.description]).join(" ");
		expect(all).toMatch(/sem juros/i);
		expect(all).toMatch(/parcela/i);
		expect(all).toMatch(/lance/i);
		expect(all).toMatch(/contempla/i);
		expect(all).toMatch(/assembleia/i);
	});

	it("copy NÃO menciona 'IA' nem 'agente inteligente'", () => {
		const all = PROCESS_STEPS.flatMap((s) => [s.title, s.description]).join(" ");
		expect(all).not.toMatch(/\bIA\b/);
		expect(all).not.toMatch(/agente inteligente/i);
		expect(all).not.toMatch(/intelig[êe]ncia artificial/i);
	});
});
