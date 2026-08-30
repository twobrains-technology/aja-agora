// @vitest-environment happy-dom
/**
 * C2 + C5 — a garantia que EU dou e a credencial que a marca assina, no
 * instante exato em que o CPF é pedido.
 *
 * Os dois itens vivem no mesmo card, então são testados como card e não como
 * frase solta — é a mudança inteira que sobe ou desce a taxa do gate, não cada
 * linha isolada (é o que a planilha pede em "medido junto com C2").
 *
 * **C2 — o que existia era o oposto de uma garantia.** O card trazia só o
 * aceite LGPD: "Autorizo a consulta dos meus dados nas administradoras
 * parceiras". Isso é uma AUTORIZAÇÃO que eu peço — somada ao CPF, é mais uma
 * coisa que a pessoa concede. No silêncio sobre o destino do dado, quem lê
 * preenche com a pior hipótese: consulta de crédito, ligação de vendas, base
 * revendida. Uma linha curta no ponto do pedido vale mais que uma política de
 * privacidade no rodapé que ninguém abre.
 *
 * **C5 — a credencial já existia, mas não viajava.** A landing inteira se
 * apresenta como comparador independente e cita administradoras autorizadas
 * pelo Banco Central (colagem do hero, `kv-independente.tsx`). Nada disso
 * atravessava para dentro do chat, que é justamente onde o dado é pedido.
 *
 * **Nada aqui é promessa nova.** As duas frases saem do que a política de
 * privacidade já assina (`src/app/politica-de-privacidade/conteudo.ts`: "Não
 * vendemos seus dados cadastrais" / "administradoras de consórcio credenciadas
 * pelo Banco Central do Brasil"). Prometer o que a operação não cumpre — um
 * "nunca ligamos" enquanto a mesa liga — seria trocar uma desconfiança por
 * outra, maior.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

import { GateIdentityForm } from "./gate-identity-form";

afterEach(cleanup);

describe("C5 — autoridade no card do identify", () => {
	it("cita as administradoras autorizadas pelo Banco Central", () => {
		render(<GateIdentityForm />);
		expect(screen.getByText(/autorizadas pelo Banco Central/i)).toBeTruthy();
	});

	it("a credencial vale nos dois momentos do funil", () => {
		render(<GateIdentityForm momento="fecho" />);
		expect(screen.getByText(/autorizadas pelo Banco Central/i)).toBeTruthy();
	});
});

describe("C2 — garantia de privacidade no ponto do pedido", () => {
	it("diz o que NÃO fazemos com o dado", () => {
		render(<GateIdentityForm />);
		expect(screen.getByText(/não são vendidos/i)).toBeTruthy();
	});

	it("a garantia segue o momento: pré-busca fala da busca", () => {
		render(<GateIdentityForm momento="pre-busca" />);
		expect(screen.getByText(/só pra essa busca/i)).toBeTruthy();
	});

	it("no fecho, a garantia fala da cota — não de uma busca que já aconteceu", () => {
		render(<GateIdentityForm momento="fecho" />);
		expect(screen.getByText(/só pra fechar essa cota/i)).toBeTruthy();
		expect(screen.queryByText(/só pra essa busca/i)).toBeNull();
	});

	it("o aceite LGPD continua existindo — garantia não substitui autorização", () => {
		// Desde o C7 (30/08/2026) o card tem dois passos, e o aceite vive no
		// SEGUNDO, junto do CPF. A garantia não o substituiu — ele só deixou de
		// dividir a primeira tela com ele.
		render(<GateIdentityForm />);
		fireEvent.change(screen.getByTestId("identify-phone"), {
			target: { value: "11999998888" },
		});
		fireEvent.click(screen.getByTestId("identify-avancar"));

		expect(screen.getByText(/Autorizo a consulta dos meus dados/i)).toBeTruthy();
		expect(screen.getByTestId("identify-lgpd")).toBeTruthy();
	});

	it("não promete o que a operação não cumpre", () => {
		render(<GateIdentityForm />);
		const texto = document.body.textContent ?? "";
		// A mesa LIGA para o lead. Um "nunca ligamos" aqui seria mentira, e mentira
		// no card da confiança custa mais caro do que o silêncio que ele substitui.
		expect(texto).not.toMatch(/nunca (te )?lig/i);
		expect(texto).not.toMatch(/sem spam/i);
	});
});

describe("o card continua funcionando", () => {
	it("os três campos e o botão seguem lá — agora em dois passos", () => {
		// O C7 dividiu o card: celular primeiro, CPF e aceite depois. O que este
		// caso protege continua sendo o mesmo — nenhum campo sumiu no caminho.
		render(<GateIdentityForm />);
		expect(screen.getByTestId("identify-phone")).toBeTruthy();

		fireEvent.change(screen.getByTestId("identify-phone"), {
			target: { value: "11999998888" },
		});
		fireEvent.click(screen.getByTestId("identify-avancar"));

		expect(screen.getByTestId("identify-cpf")).toBeTruthy();
		expect(screen.getByTestId("identify-lgpd")).toBeTruthy();
		expect(screen.getByTestId("identify-submit")).toBeTruthy();
	});

	it("o card do histórico (inerte) também mostra a garantia", () => {
		// Card antigo é registro do que aconteceu: some o formulário vivo, mas o
		// que foi PROMETIDO à pessoa naquele momento tem que continuar visível.
		render(<GateIdentityForm active={false} />);
		expect(screen.getByText(/não são vendidos/i)).toBeTruthy();
	});
});
