/**
 * O nome do lead sai da fala do cliente, não da cabeça do modelo.
 *
 * Encontrado por uma revisão adversarial exercitando o fecho da jornada nova: o
 * modelo chamou `save_contact_name` com **"Cliente"** e o banco gravou
 * `contact_name = "Cliente"` numa conversa em que a pessoa jamais se apresentou.
 * O validador existente deixa passar — ele recusa "Teste" e "Voltei", mas
 * "Cliente", "Usuario", "Comprador" e "Interessado" são palavras plausíveis como
 * nome próprio.
 *
 * É a Lei 3 do projeto — nunca agir sobre entidade não-ancorada — e o dano é o
 * mesmo do valor inventado, que esta entrega já resolveu do jeito certo em
 * `analyze.ts` (`valorAncoradoNoTexto`): a mesa vê "Cliente", o agente passa a
 * chamar a pessoa de "Cliente", `hasContactName` suprime o gate `name` para
 * sempre, e a métrica "deu o nome" — a mesma que este trabalho usou para medir o
 * funil — fica poluída.
 *
 * A vitrine tornou isso comum: antes o nome vinha cedo, no começo da conversa;
 * agora "chegou ao fecho sem nome" é o caso normal, e é exatamente aí que o
 * modelo tenta preencher a lacuna.
 *
 * **Por que ancoragem e não uma lista de palavras proibidas:** o `CLAUDE.md` é
 * explícito — "não se fecha porta a porta, fecha-se a parede". Bloquear
 * "Cliente" deixa "Comprador", depois "Interessado", depois "Amigo". A pergunta
 * certa não é *que palavra é essa*, é *o cliente disse isso?*.
 */
import { describe, expect, it } from "vitest";
import { nomeAncoradoNaFala } from "./nome-plausivel";

describe("nomeAncoradoNaFala", () => {
	it("aceita o nome que o cliente escreveu", () => {
		expect(nomeAncoradoNaFala("Paulo", "Sou o Paulo, quero um carro")).toBe(true);
		expect(nomeAncoradoNaFala("Mirella", "mirella")).toBe(true);
	});

	it("aceita ignorando acento e caixa — o cliente digita como quiser", () => {
		expect(nomeAncoradoNaFala("Fabio", "meu nome é fábio")).toBe(true);
		expect(nomeAncoradoNaFala("Ângela", "pode me chamar de angela")).toBe(true);
	});

	it("RECUSA o placeholder que o modelo inventa no fecho", () => {
		// O caso real: conversa inteira sem apresentação, e o modelo preenche.
		expect(nomeAncoradoNaFala("Cliente", "quero contratar essa mesmo")).toBe(false);
		expect(nomeAncoradoNaFala("Comprador", "bora fechar")).toBe(false);
		expect(nomeAncoradoNaFala("Interessado", "sim, quero")).toBe(false);
	});

	it("RECUSA nome que não está na fala, mesmo sendo nome de gente", () => {
		// O ponto da ancoragem: não é sobre a palavra ser um nome, é sobre ela ter
		// sido dita. Um "João" que ninguém falou é tão inventado quanto "Cliente".
		expect(nomeAncoradoNaFala("João", "quero um carro de 80 mil")).toBe(false);
	});

	it("sem fala do turno, não ancora nada", () => {
		// Turno server-authored (clique, retomada): não há texto do cliente para
		// ancorar. Melhor não gravar do que gravar no escuro.
		expect(nomeAncoradoNaFala("Paulo", "")).toBe(false);
		expect(nomeAncoradoNaFala("Paulo", null)).toBe(false);
	});

	it("não casa por pedaço de outra palavra", () => {
		// "Ana" não pode ancorar em "financiamento" só porque as letras aparecem lá.
		expect(nomeAncoradoNaFala("Ana", "prefiro financiamento")).toBe(false);
	});

	it("ancora nome com apóstrofo ou hífen — o produto diz suportar", () => {
		// A tokenização quebrava a fala em letras (`[^\p{L}]+`) mas comparava o alvo
		// inteiro, com `'` e `-`. Resultado: quem se chama D'Ávila ou Jean-Luc caía
		// em loop de "peça o nome de novo" — e `capitalizeName` declara suportar os
		// dois.
		expect(nomeAncoradoNaFala("D'Ávila", "sou a d'avila")).toBe(true);
		expect(nomeAncoradoNaFala("Jean-Luc", "meu nome é jean-luc")).toBe(true);
	});

	it("NÃO ancora numa directive do servidor — ela não é fala do cliente", () => {
		// O furo que sobrou do conserto anterior: em turno server-authored o campo
		// `userText` carrega a DIRECTIVE, e a palavra "cliente" está em praticamente
		// todas elas. `save_contact_name("Cliente")` voltava a gravar exatamente na
		// classe de turno que domina o fecho da jornada nova.
		//
		// A defesa de verdade é o chamador não passar directive como se fosse fala
		// (ver `converse.ts`); este caso trava o predicado como segunda linha.
		const directive = "O cliente escolheu a cota. Conduza para o próximo passo do funil.";

		expect(nomeAncoradoNaFala("Cliente", directive)).toBe(false);
		expect(nomeAncoradoNaFala("Sistema", "instrução do sistema para o agente")).toBe(false);
	});
});
