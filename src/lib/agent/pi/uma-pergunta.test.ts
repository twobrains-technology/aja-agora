import { describe, expect, it, vi } from "vitest";
import { publicarScores } from "@/lib/observability/sinais/publicar";
import { contarPerguntas, manterUmaPergunta, semCitacoes } from "./uma-pergunta";

vi.mock("@/lib/observability/sinais/publicar", () => ({ publicarScores: vi.fn() }));

describe("uma pergunta por mensagem (medida, sem corte — P11)", () => {
	it("conta pergunta fora de aspas", () => {
		expect(
			contarPerguntas("Você quer trocar o carro, ou é a primeira compra? E para quando?"),
		).toBe(2);
		expect(contarPerguntas('Muita gente pergunta "será que consigo?" e eu explico.')).toBe(0);
		expect(contarPerguntas("Ótimo, Marcos!")).toBe(0);
	});

	it("com duas perguntas, o texto passa inteiro e o sinal registra 2", () => {
		const entrada =
			"Ótimo! Carro é sempre uma alegria.\n\nVocê quer trocar o que tem agora, ou é a primeira compra? E para quando você está pensando nisso?";
		expect(manterUmaPergunta(entrada)).toBe(entrada);
		expect(contarPerguntas(entrada)).toBe(2);
		expect(publicarScores).toHaveBeenCalledWith(
			[{ name: "fala_com_multiplas_perguntas", value: 2, dataType: "NUMERIC" }],
			"remendos-fala",
		);
	});

	it("duas perguntas na mesma linha: texto inteiro, sinal com o número certo", () => {
		const fala = "Quanto separa por mês? Ou prefere que eu mostre as opções?";
		expect(manterUmaPergunta(fala)).toBe(fala);
		expect(publicarScores).toHaveBeenCalledWith(
			[{ name: "fala_com_multiplas_perguntas", value: 2, dataType: "NUMERIC" }],
			"remendos-fala",
		);
	});

	it("uma pergunta só passa intacta, sem sinal, e pergunta citada não conta", () => {
		vi.mocked(publicarScores).mockClear();
		const um = "Perfeito! Qual o valor do carro?";
		expect(manterUmaPergunta(um)).toBe(um);
		const citada = 'Muita gente diz "será que dá?" — dá sim. Quando você quer começar?';
		expect(manterUmaPergunta(citada)).toBe(citada);
		expect(publicarScores).not.toHaveBeenCalled();
	});

	it("números com ponto de milhar contam certo (achado F3 do dev)", () => {
		vi.mocked(publicarScores).mockClear();
		const comDuas = "O teto é de R$ 60.000, certo? A parcela ficaria em 1.038,61. Posso simular?";
		expect(contarPerguntas(comDuas)).toBe(2);
		expect(manterUmaPergunta(comDuas)).toBe(comDuas);
		expect(publicarScores).toHaveBeenCalledTimes(1);
	});
});

describe("semCitacoes (medida)", () => {
	it("preserva índices ao apagar o miolo de aspas", () => {
		const texto = 'diz "será?" aqui';
		const limpo = semCitacoes(texto);
		expect(limpo.indexOf("aqui")).toBe(texto.indexOf("aqui"));
		expect(limpo.includes("?")).toBe(false);
	});
});
