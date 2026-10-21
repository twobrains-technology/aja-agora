import { describe, expect, it } from "vitest";
import { carregarSkills, limparCacheDeSkills, parseSkillBruto, skillsParaPrompt } from "./index";

describe("skills do vendedor", () => {
	it("lê as duas SKILL.md do disco, com nome e descrição", () => {
		limparCacheDeSkills();
		const skills = carregarSkills();
		expect(skills.map((s) => s.name)).toEqual(["buscar-cartas", "proposta-com-dados-do-cliente"]);
		expect(skills[0].description).toMatch(/sem pedir nenhum dado pessoal/);
		expect(skills[1].body).toMatch(/LGPD/);
	});

	it("o bloco do system leva o corpo das duas (é o que o modelo obedece)", () => {
		limparCacheDeSkills();
		const bloco = skillsParaPrompt();
		expect(bloco).toContain("buscar_cartas");
		expect(bloco).toContain("fazer_proposta");
		expect(bloco).toContain("<skill name=");
	});

	it("frontmatter sem name/description é erro alto — nunca skill muda", () => {
		expect(() => parseSkillBruto("---\nname: x\n---\ncorpo")).toThrow();
		expect(() => parseSkillBruto("sem frontmatter")).toThrow();
	});
});
