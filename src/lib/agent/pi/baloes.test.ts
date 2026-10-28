// A CONVERSA PICADA — ordem do dono, 27/10/2026: *"que ele fale de forma mais humanizada, com
// conversa picada, no sentido igual um humano fala no chat"*.
//
// O defeito medido nos prints 07 e 08: um beat do modelo virava UM balão de 7–9 linhas com
// `**Lance livre:**` e `**Lance embutido:**` dentro, e o cliente lia textão. `picarEmBaloes` é a
// peça pura que quebra o texto do beat em bolhas curtas na hora de emitir a fala.
import { describe, expect, it } from "vitest";
import { picarEmBaloes } from "./baloes";

/** O parágrafo do print 07 (`.orientacao/prints-ux/07-toque-responde-a-pergunta-do-turno.png`),
 * transcrito da tela: foi assim que o cliente recebeu a explicação de lance inteira num balão. */
const PRINT_07 =
	'Lance é um valor que você oferece para ser chamado antes, numa assembleia do grupo. Há dois tipos: **Lance livre:** você paga do seu bolso. Quanto maior, maior a chance de ser contemplado antes. Mas a contemplação continua sem data certa. **Lance embutido:** sai da própria carta, então você recebe um crédito menor. Não tira dinheiro do seu bolso, mas o carro fica um pouco mais "curto". Se vale a pena depende de você ter ou não uma reserva para o lance e de quanto você precisa do carro agora. Você tem algum valor guardado para isso?';

/** O texto sem os espaços que os balões consomem, para comparar "nada se perdeu". */
const semEspacoSobrando = (t: string) => t.replace(/\s+/g, " ").trim();

describe("(print 07) a explicação de lance não sai num bloco só", () => {
	it("vira pelo menos 2 balões, e nenhum deles é textão", () => {
		const baloes = picarEmBaloes(PRINT_07);
		// O print tinha UM balão com o parágrafo inteiro; a conversa picada tem pelo menos dois.
		expect(baloes.length).toBeGreaterThanOrEqual(2);
		expect(baloes.length).toBeLessThanOrEqual(3);
		for (const balao of baloes) {
			// 537 caracteres em 3 balões dão ~180 por balão; o mínimo possível respeitando fim de
			// frase é 194 (as frases têm 83/55/54/43/77/71/107/40 caracteres). 200 é o teto real.
			expect(balao.length, balao).toBeLessThanOrEqual(200);
		}
	});

	it("nenhum balão corta uma frase pelo meio nem inventa texto", () => {
		const baloes = picarEmBaloes(PRINT_07);
		const inteiro = semEspacoSobrando(PRINT_07);
		for (const balao of baloes) {
			// Cada balão é um pedaço contíguo do parágrafo: nada foi reescrito nem cortado ao meio.
			expect(inteiro, balao).toContain(balao);
			expect(balao.trim()).toBe(balao);
			expect(balao.length).toBeGreaterThan(0);
		}
	});
});

describe("texto curto fica como está", () => {
	it("uma frase curta volta em UM balão", () => {
		expect(picarEmBaloes("Fechou, Marcos! Já busquei as cartas.")).toEqual([
			"Fechou, Marcos! Já busquei as cartas.",
		]);
	});

	it("texto vazio não vira balão nenhum", () => {
		expect(picarEmBaloes("   ")).toEqual([]);
	});

	it("uma frase longa NÃO é partida no meio (não há fronteira de frase)", () => {
		const frase =
			"O lance embutido sai da própria carta e por isso a carta precisa ser maior que o bem que você quer comprar, senão o crédito que sobra não compra o carro.";
		expect(picarEmBaloes(frase)).toEqual([frase]);
	});
});

describe("cinco frases: no máximo 3 balões e nenhum caractere perdido", () => {
	it("a soma dos balões é o texto original", () => {
		const texto =
			"A parcela fica em R$ 1.176,39 por mês, em 96 meses. O prazo do grupo é de 96 meses. A taxa de administração é de 20,8% diluída. O lance embutido usa parte da própria carta. Você tem alguma reserva para dar lance?";
		const baloes = picarEmBaloes(texto);
		expect(baloes.length).toBeLessThanOrEqual(3);
		expect(baloes.length).toBeGreaterThanOrEqual(2);
		// "Nunca perder texto": os balões, na ordem, são o texto inteiro.
		expect(semEspacoSobrando(baloes.join(" "))).toBe(semEspacoSobrando(texto));
	});
});

describe("número e abreviação não são fronteira de frase", () => {
	it("não parte no meio de 'R$ 1.176,39'", () => {
		const texto =
			"O crédito é de R$ 90 mil e a parcela fica em R$ 1.176,39 por mês, com prazo de 96 meses. Se você der R$ 20 mil de lance livre, a chance de ser chamado cedo sobe bastante. O embutido usa parte da própria carta e o crédito que sobra fica menor.";
		const baloes = picarEmBaloes(texto, { maxChars: 80 });
		const comDinheiro = baloes.filter((b) => b.includes("1.176"));
		expect(comDinheiro).toHaveLength(1);
		// O valor sai inteiro: "R$", o milhar com ponto e os centavos na mesma bolha.
		expect(comDinheiro[0]).toContain("R$ 1.176,39");
		for (const balao of baloes) {
			// Nenhuma bolha termina pendurada num "R$" nem começa com o resto de um número.
			expect(balao).not.toMatch(/R\$$/);
			expect(balao).not.toMatch(/^[.,]?\d/);
		}
	});

	it("não parte depois de 'Sr.' nem de 'etc.'", () => {
		const texto =
			"Sr. Silva, a Canopus de R$ 90 mil é a que eu recomendo para o seu caso, com prazo de 96 meses e parcela que cabe no seu bolso. Dá para combinar lance livre, embutido, etc. sem sair do grupo. Você prefere parcela menor ou prazo mais curto?";
		const baloes = picarEmBaloes(texto, { maxChars: 60 });
		expect(baloes[0]).toMatch(/^Sr\. Silva/);
		expect(baloes.some((b) => b.startsWith("Silva"))).toBe(false);
	});
});
