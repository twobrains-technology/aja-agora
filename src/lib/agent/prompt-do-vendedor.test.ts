import { describe, expect, it } from "vitest";
import { limparCacheDeSkills, skillsParaPrompt } from "./pi/skills";
import { PROMPT_DO_VENDEDOR } from "./prompt-do-vendedor";

describe("semente do vendedor — o que a dona do produto cobrou em 14 e 15/10", () => {
	it("diz para perguntar antes de simular, e não só sair mostrando grupo", () => {
		expect(PROMPT_DO_VENDEDOR).toMatch(/pergunta antes de simular/i);
	});

	it("sabe que existe o card de escolha e o nomeia pelo nome da tool", () => {
		expect(PROMPT_DO_VENDEDOR).toContain("mostrar_card");
		expect(PROMPT_DO_VENDEDOR).toMatch(/opções na tela/i);
	});

	it("exige uma pergunta por mensagem e opção na tela, não no texto", () => {
		expect(PROMPT_DO_VENDEDOR).toMatch(/uma pergunta por mensagem/i);
		expect(PROMPT_DO_VENDEDOR).toMatch(/sem listar as alternativas em texto/i);
	});

	it("não é lista de frase proibida: conduta não vira trava de fala", () => {
		const proibidas = [/nunca diga/i, /não use a palavra/i, /proibido dizer/i];
		for (const padrao of proibidas) {
			expect(PROMPT_DO_VENDEDOR).not.toMatch(padrao);
		}
	});

	it("conduta + skills ficam abaixo de 20.000 caracteres (guardrail de contexto)", () => {
		limparCacheDeSkills();
		const skills = skillsParaPrompt();
		const total = PROMPT_DO_VENDEDOR.length + skills.length;
		console.log(
			`[prompt] conduta ${PROMPT_DO_VENDEDOR.length} + skills ${skills.length} = ${total} caracteres`,
		);
		expect(total).toBeLessThan(20_000);
	});
});
