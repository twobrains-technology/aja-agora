import { describe, expect, it } from "vitest";
import { limparCacheDeSkills, skillsParaPrompt } from "./pi/skills";
import { PROMPT_DO_VENDEDOR } from "./prompt-do-vendedor";

describe("semente do vendedor — o que a dona do produto cobrou em 14 e 15/10", () => {
	/** A conduta é texto quebrado em linhas: a frase procurada pode estar partida nelas. */
	const diz = (padrao: RegExp) => padrao.test(PROMPT_DO_VENDEDOR.replace(/\s+/g, " "));

	it("diz para perguntar antes de simular, e não só sair mostrando grupo", () => {
		expect(PROMPT_DO_VENDEDOR).toMatch(/pergunta o mínimo antes de mostrar/i);
	});

	it("sabe que existe o card de escolha e o nomeia pelo nome da tool", () => {
		expect(PROMPT_DO_VENDEDOR).toContain("mostrar_card");
		expect(PROMPT_DO_VENDEDOR).toMatch(/opções na tela/i);
	});

	it("o nome é a PRIMEIRA pergunta, antes de qualquer oferta (ordem do dono, 27/10)", () => {
		// Ordem literal do dono: *"o nome, um vendedor a primeira coisa que ele pergunta eh o
		// nome"*. A conduta abria entregando oferta e o nome ficava para depois (ou nunca).
		expect(diz(/a primeira coisa é o nome/i)).toBe(true);
		expect(diz(/antes de qualquer oferta/i)).toBe(true);
		expect(diz(/antes de tudo, como você se chama\?/i)).toBe(true);
	});

	it("o nome se pergunta antes da busca de cartas, não depois da oferta", () => {
		// O texto é lido em ordem: a regra do nome tem de vir ANTES da instrução de buscar e
		// mostrar carta, que é o que o modelo fazia primeiro.
		const inicioDaConduta = PROMPT_DO_VENDEDOR.indexOf("Como um bom vendedor de consórcio age");
		const nome = PROMPT_DO_VENDEDOR.indexOf("A primeira coisa é o nome");
		const busca = PROMPT_DO_VENDEDOR.indexOf("Pergunta o mínimo antes de mostrar");
		expect(nome).toBeGreaterThan(inicioDaConduta);
		expect(busca).toBeGreaterThan(nome);
	});

	it("o nome é perguntado UMA vez e nunca trava a venda", () => {
		expect(diz(/no máximo uma vez/i)).toBe(true);
		expect(diz(/o nome nunca trava a venda/i)).toBe(true);
		// O texto antigo dizia que o nome era OPCIONAL: com a ordem do dono, era a instrução
		// contraditória que fazia o modelo nunca perguntar.
		expect(diz(/o nome é opcional/i)).toBe(false);
	});

	it("tipo de bem + valor basta para buscar: parcela nunca é pré-requisito", () => {
		expect(PROMPT_DO_VENDEDOR).toMatch(/nunca peça a parcela ou o prazo como condição/i);
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

	it("proíbe o vocativo inventado (o 'Obrigado, Cliente.' da conversa 1a4927bd)", () => {
		// Conversa web `1a4927bd-78a9-4fa0-9510-9550a7b583c5` (27/10/2026 20:50:20), com
		// `contact_name` NULO: o modelo inventou o vocativo "Cliente" para preencher a lacuna
		// do nome. O fato não vem do servidor — a fala é que tem de aprender a ficar sem nome.
		expect(PROMPT_DO_VENDEDOR).toMatch(/não invente vocativo/i);
		for (const rotulo of ["Cliente", "Comprador", "Interessado"]) {
			expect(PROMPT_DO_VENDEDOR, rotulo).toContain(rotulo);
		}
	});

	it("manda falar em BOLHAS curtas, como quem digita no chat", () => {
		// Ordem do dono, 27/10/2026: *"fale de forma mais humanizada, com conversa picada, no
		// sentido igual um humano fala no chat"*. Nos prints 07/08 o turno saía num bloco só.
		expect(diz(/bolhas curtas/i)).toBe(true);
		expect(diz(/2 ou 3 bolhas/i)).toBe(true);
		expect(diz(/nunca mande um parágrafo com mais de três linhas/i)).toBe(true);
	});

	it("proíbe markdown e listão no texto de conversa", () => {
		expect(diz(/nada de markdown/i)).toBe(true);
		// O `**` do print 07 (`**Lance livre:**`) é o que o dono viu como bloco de documento.
		expect(diz(/sem \*\*/)).toBe(true);
		expect(diz(/sem travessão/i)).toBe(true);
	});

	it("pede voz de vendedora brasileira e proíbe narrar o card", () => {
		expect(diz(/vendedora brasileira/i)).toBe(true);
		expect(diz(/não anuncie o card/i)).toBe(true);
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

	it("proíbe comparar prazo/parcela de cabeça (print 13: 96 meses ditos como 'mais curto' que 94)", () => {
		expect(PROMPT_DO_VENDEDOR).toMatch(/94 meses é prazo\s+MENOR que 96/i);
		expect(PROMPT_DO_VENDEDOR).toMatch(/se o número não está na tela, não compare/i);
	});
});
