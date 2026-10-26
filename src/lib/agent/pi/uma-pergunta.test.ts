import { describe, expect, it } from "vitest";
import { contarPerguntas, manterUmaPergunta } from "./uma-pergunta";

describe("uma pergunta por mensagem", () => {
	it("conta pergunta fora de aspas", () => {
		expect(
			contarPerguntas("Você quer trocar o carro, ou é a primeira compra? E para quando?"),
		).toBe(2);
		expect(contarPerguntas('Muita gente pergunta "será que consigo?" e eu explico.')).toBe(0);
		expect(contarPerguntas("Ótimo, Marcos!")).toBe(0);
	});

	it("com duas perguntas, mantém só a última e preserva o acolhimento", () => {
		const entrada =
			"Ótimo! Carro é sempre uma alegria.\n\nVocê quer trocar o que tem agora, ou é a primeira compra? E para quando você está pensando nisso?";
		const saida = manterUmaPergunta(entrada);
		expect(contarPerguntas(saida)).toBe(1);
		expect(saida).toContain("Carro é sempre uma alegria.");
		expect(saida).toContain("para quando você está pensando nisso?");
		expect(saida).not.toContain("primeira compra");
	});

	it("pergunta + pergunta em frases coladas na mesma linha", () => {
		const saida = manterUmaPergunta("Quanto separa por mês? Ou prefere que eu mostre as opções?");
		expect(contarPerguntas(saida)).toBe(1);
		expect(saida).toBe("Ou prefere que eu mostre as opções?");
	});

	it("uma pergunta só passa intacta, e pergunta citada não é cortada", () => {
		const um = "Perfeito! Qual o valor do carro?";
		expect(manterUmaPergunta(um)).toBe(um);
		const citada = 'Muita gente diz "será que dá?" — dá sim. Quando você quer começar?';
		expect(manterUmaPergunta(citada)).toBe(citada);
	});

	it("ponto de milhar não quebra a frase: o número sai íntegro (achado F3 do dev)", () => {
		const entrada =
			"Achei 4 opções! Eu escolheria a primeira, parcela de R$ 733. Prefere essa? Se preferir pagar antes, a terceira faz isso em 75 meses (parcela de R$ 1.010). Qual delas você quer?";
		expect(manterUmaPergunta(entrada)).toBe(
			"Achei 4 opções! Eu escolheria a primeira, parcela de R$ 733. Se preferir pagar antes, a terceira faz isso em 75 meses (parcela de R$ 1.010). Qual delas você quer?",
		);
	});

	it("milhar e decimal dentro de frase preservada não quebram nada", () => {
		for (const intacta of [
			"O teto é de R$ 60.000. Posso simular pra você?",
			"A parcela ficou em 1.038,61. Faz sentido pra você?",
			"12.5% é o coeficiente. Posso simular?",
		]) {
			expect(manterUmaPergunta(intacta)).toBe(intacta);
		}
		// A frase com o número fica; só a pergunta do meio é cortada.
		const comDuas = "O teto é de R$ 60.000, certo? A parcela ficaria em 1.038,61. Posso simular?";
		expect(manterUmaPergunta(comDuas)).toBe("A parcela ficaria em 1.038,61. Posso simular?");
	});
});
