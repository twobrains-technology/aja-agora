/**
 * O que o MODELO recebe — não o que a constante contém.
 *
 * Este teste existe porque o mesmo erro aconteceu duas vezes na mesma entrega,
 * cada vez uma camada mais fundo:
 *
 *   1ª — escrevi a regra em `SPECIALIST_BASE_PROMPT`, que o grafo não lê.
 *        `pnpm prompts:check` deu verde, porque ele só compara `SYSTEM_PROMPT`.
 *   2ª — movi para `SYSTEM_PROMPT`, dentro da seção "## Fluxo de Vendas" —
 *        e `leanSystemPrompt` (converse.ts) **corta essa seção inteira** antes
 *        de mandar ao modelo. A sonda:
 *
 *          SYSTEM_PROMPT chars: 13896  |  lean chars: 10641
 *          "custa documento"    → SYSTEM: true  | LEAN: false
 *          "nunca SOBRE ele"    → SYSTEM: true  | LEAN: false
 *          ordem VELHA no LEAN  → true
 *
 * Ou seja: o trabalho de prompt era texto morto, e o texto vivo ensinava a
 * ordem antiga (`identidade → busca`) em todo turno.
 *
 * A lição do CLAUDE.md — "você pode estar depurando um texto que o modelo nunca
 * recebeu" — aconteceu dentro da própria correção dela. Por isso este teste
 * asserta sobre `leanSystemPrompt(SYSTEM_PROMPT)`: o artefato que chega ao
 * modelo, o único que importa.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { leanSystemPrompt } from "./converse";

const ENV_ORIGINAL = { ...process.env };

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("leanSystemPrompt — o prompt que o modelo de fato recebe", () => {
	describe("com a vitrine ligada", () => {
		beforeEach(() => {
			process.env.VITRINE_CPF = "11144477735";
			process.env.VITRINE_CELULAR = "62992496793";
		});

		it("entrega a regra de que buscar oferta não custa documento", () => {
			expect(leanSystemPrompt(SYSTEM_PROMPT)).toContain("custa documento");
		});

		it("a regra condicional é marcada com a TAG que o filtro usa", () => {
			// Se alguém reescrever o corpo da regra (inclusive pela UI do Langfuse),
			// a tag no título é o que mantém o filtro funcionando. Sem ela, a regra
			// vazaria para o mundo sem vitrine em silêncio.
			expect(SYSTEM_PROMPT).toMatch(/\*\*REGRA DURA\s*\[VITRINE\]/i);
		});

		it("entrega a regra de falar COM o cliente, nunca sobre ele", () => {
			expect(leanSystemPrompt(SYSTEM_PROMPT)).toContain("nunca SOBRE ele");
		});

		it("NÃO ensina a ordem velha (identidade antes da busca)", () => {
			// O bloco que o `leanSystemPrompt` injeta no lugar do fluxo cortado
			// afirmava `nome → objetivo → valor do bem → identidade → busca`. Com a
			// vitrine, isso é falso — e é a autoridade mais específica na janela do
			// modelo, contradizendo o servidor em todo turno.
			expect(leanSystemPrompt(SYSTEM_PROMPT)).not.toContain("identidade → busca");
		});

		it("ensina a ordem NOVA: valor → busca, identidade no fecho", () => {
			const lean = leanSystemPrompt(SYSTEM_PROMPT);
			expect(lean).toContain("valor → busca");
		});
	});

	describe("com a vitrine desligada — o prompt volta junto com o funil", () => {
		beforeEach(() => {
			process.env.VITRINE_CPF = "";
			process.env.VITRINE_CELULAR = "";
		});

		it("NÃO entrega a regra do mundo novo — senão o modelo lê duas ordens", () => {
			// A extração das REGRA DURAs era incondicional, e o resultado era uma
			// janela que dizia ao mesmo tempo "buscar oferta NÃO custa documento" e
			// "## Ordem do funil … identidade → busca". Pior: no turno do gate, a
			// directive manda dizer "a administradora exige pra trazer as ofertas
			// reais" — a frase que a própria REGRA DURA, na mesma janela, lista como
			// BAD. Isso valia no kill switch E no estado default do rollout (código
			// novo em produção, secret ainda sem VITRINE_*).
			expect(leanSystemPrompt(SYSTEM_PROMPT)).not.toContain("custa documento");
			// E o mecanismo: nenhuma regra marcada [VITRINE] sobrevive com ela off.
			expect(leanSystemPrompt(SYSTEM_PROMPT)).not.toMatch(/REGRA DURA\s*\[VITRINE\]/i);
		});

		it("mantém a regra de GRAVAR o nome oferecido — a única via que sobrou", () => {
			// Sem gate `name` no caminho de quem traz o valor, ninguém pergunta o
			// nome: a apresentação espontânea é a única chance de tê-lo, e quem a
			// grava é a tool do modelo. Se esta regra não chegar à janela, o lead
			// nasce anônimo — foi o que aconteceu ao vivo enquanto ela morava em
			// `SPECIALIST_BASE_PROMPT`, que o grafo NÃO lê (2 conversas no app, o
			// modelo saudou pelo nome e não chamou a tool nenhuma vez).
			//
			// Ela NÃO leva a tag [VITRINE] de propósito: vale com a vitrine ligada ou
			// desligada — gravar o nome que a pessoa deu nunca dependeu disso.
			const lean = leanSystemPrompt(SYSTEM_PROMPT);
			expect(lean).toContain("save_contact_name");
			// E os contra-exemplos do domínio vêm junto: sem eles a regra vira
			// "grave qualquer palavra depois de 'meu nome é'".
			expect(lean).toContain("sujo no Serasa");
		});

		it("mantém as regras que independem da vitrine", () => {
			// A de falar COM o cliente não tem nada a ver com a ordem do funil —
			// filtrar demais seria jogar fora regra boa.
			expect(leanSystemPrompt(SYSTEM_PROMPT)).toContain("nunca SOBRE ele");
		});

		it("volta a ensinar identidade antes da busca", () => {
			// Kill switch de verdade é o que reverte estado E fala. Sem isto, apagar
			// a env deixaria o modelo prometendo busca sem CPF enquanto o servidor
			// volta a exigi-lo — prompt contra servidor, a receita de incidente que
			// este projeto já pagou.
			expect(leanSystemPrompt(SYSTEM_PROMPT)).toContain("identidade → busca");
		});
	});

	it("extrai SÓ as regras — não arrasta o item do fluxo que vem depois", () => {
		// A extração fatiava por linha em branco; sem uma delas entre a REGRA DURA e
		// o item seguinte, o "5. Feche (self-service)" vinha de carona, órfão do
		// fluxo que foi cortado. Texto solto no prompt é pior que texto ausente.
		process.env.VITRINE_CPF = "11144477735";
		process.env.VITRINE_CELULAR = "62992496793";

		expect(leanSystemPrompt(SYSTEM_PROMPT)).not.toContain("Feche (self-service)");
	});

	it("continua sendo MENOR que o prompt completo — o corte não foi desfeito", () => {
		// A poda existe por custo de contexto; a correção não pode virar "manda
		// tudo". O que muda é O QUE sobrevive ao corte, não que ele deixe de haver.
		expect(leanSystemPrompt(SYSTEM_PROMPT).length).toBeLessThan(SYSTEM_PROMPT.length);
	});
});
