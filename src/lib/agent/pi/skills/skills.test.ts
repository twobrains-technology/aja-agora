import { describe, expect, it } from "vitest";
import { carregarSkills, limparCacheDeSkills, parseSkillBruto, skillsParaPrompt } from "./index";

describe("skills do vendedor", () => {
	it("lê as três SKILL.md do disco, com nome e descrição", () => {
		limparCacheDeSkills();
		const skills = carregarSkills();
		expect(skills.map((s) => s.name)).toEqual([
			"buscar-cartas",
			"proposta-com-dados-do-cliente",
			"perguntar-com-opcoes",
		]);
		expect(skills[0].description).toMatch(/sem pedir nenhum dado pessoal/);
		expect(skills[1].body).toMatch(/LGPD/);
		expect(skills[2].description).toMatch(/card/i);
		// A `description` é o gatilho de uso. O parser local lê `name:`/`description:`
		// de UMA linha: em bloco escalar (`description: >-`) ele devolve literalmente
		// ">-" e a skill perde o gatilho em silêncio — por isso a asserção.
		expect(skills[2].description).not.toBe(">-");
	});

	it("o bloco do system leva o corpo das três (é o que o modelo obedece)", () => {
		limparCacheDeSkills();
		const bloco = skillsParaPrompt();
		expect(bloco).toContain("buscar_cartas");
		expect(bloco).toContain("fazer_proposta");
		expect(bloco).toContain('<skill name="perguntar-com-opcoes">');
		expect(bloco).toContain("mostrar_card");
		expect(bloco).toContain("<skill name=");
	});

	it("frontmatter sem name/description é erro alto — nunca skill muda", () => {
		expect(() => parseSkillBruto("---\nname: x\n---\ncorpo")).toThrow();
		expect(() => parseSkillBruto("sem frontmatter")).toThrow();
	});

	it("buscar-cartas manda comentar só a recomendada, sem relistar o card", () => {
		const texto = skillsParaPrompt();
		expect(texto).toMatch(/JÁ\s+ESTÃO NA TELA/);
		expect(texto).toMatch(/2 a\s+3 frases/);
	});
});
