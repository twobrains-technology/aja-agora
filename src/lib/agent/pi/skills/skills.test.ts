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

	// O aviso da LGPD saiu de vez (decisão do dono, 27/10 — print 1532-formulario-fixo):
	// a skill da proposta não recita aviso nem espera "sim". O que ela passou a mandar é o
	// que o vendedor precisa: dado de qualquer fala, e o WhatsApp pedido quando a pessoa
	// sinaliza que vai sair.
	it("a skill da proposta não pede aviso nem aceite; manda capturar do jeito que vier", () => {
		limparCacheDeSkills();
		const texto = skillsParaPrompt();
		expect(texto).not.toMatch(/avise com estas palavras/i);
		expect(texto).not.toMatch(/s[óo] continue depois de um sim/i);
		expect(texto).toMatch(/em qualquer ordem e em qualquer turno/i);
		expect(texto).toMatch(/whatsapp_optin/);
	});

	it("buscar-cartas manda comentar só a recomendada, sem relistar o card", () => {
		const texto = skillsParaPrompt();
		expect(texto).toMatch(/JÁ\s+ESTÃO NA TELA/);
		expect(texto).toMatch(/2 a\s+3 frases/);
	});
});
