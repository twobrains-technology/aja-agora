// O pedido de CPF não pode sair em dobro.
//
// Julgamento de 14/08 (duas conversas, 4 de 4 turnos de identidade): o cliente
// leu o pedido duas vezes, colado —
//
//   "...e seus dados ficam protegidos pela LGPD.Pra eu trazer as ofertas reais
//    das administradoras, preciso do seu CPF e celular."
//
// A segunda metade é a pergunta canônica do canal, idêntica nas quatro
// ocorrências. `modelAsked` não a segurava porque ele responde "o modelo fez
// ALGUMA pergunta" — e "preciso do seu CPF" é afirmação, não pergunta.
import { describe, expect, it } from "vitest";
import { pediuIdentidade } from "./detect-name-turn";

describe("pediuIdentidade", () => {
	it("reconhece o pedido em afirmação (o caso que passou)", () => {
		expect(
			pediuIdentidade(
				"Pra eu trazer as melhores ofertas, preciso do seu CPF e do seu celular. Seus dados ficam protegidos pela LGPD.",
			),
		).toBe(true);
	});

	it("reconhece em pergunta e com caixa/acento variados", () => {
		expect(pediuIdentidade("Qual é o seu CPF?")).toBe(true);
		expect(pediuIdentidade("me manda seu cpf, só os números")).toBe(true);
	});

	it("não confunde com fala que não pede identidade", () => {
		expect(pediuIdentidade("Achei 6 opções de moto pra você, olha só as parcelas.")).toBe(false);
		expect(pediuIdentidade("")).toBe(false);
		expect(pediuIdentidade(null)).toBe(false);
	});
});
