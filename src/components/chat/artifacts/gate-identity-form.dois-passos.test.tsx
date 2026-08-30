// @vitest-environment happy-dom
/**
 * C7 — o pedido duplo vira dois passos dentro do mesmo card.
 *
 * ── O item, e por que ele sobrou ────────────────────────────────────────────
 *
 * A auditoria descreve o formulário como uma parede: CPF, celular e caixa de
 * LGPD de uma vez só, no ponto mais sensível do funil. O plano previa que ele
 * seria absorvido pelo C3 (desacoplar o CPF da busca) — mas o C3 depende da
 * vitrine, que está desligada por falta de env. O C7 ficou no vão.
 *
 * **E a parede ficou MAIOR, não menor.** Os itens C2 e C5, entregues neste
 * mesmo trabalho, acrescentaram duas linhas ao card: a garantia de privacidade
 * e a credencial do Banco Central. As duas atacam a desconfiança, que é a causa
 * que a auditoria aponta — mas o resultado, medido em elementos na tela, é mais
 * conteúdo no instante em que se pede o dado mais sensível do Brasil.
 *
 * ── O desenho, e o que ele NÃO muda ─────────────────────────────────────────
 *
 * Dois passos visuais, um card só, **mesma cascata e mesmo gate**. É a variante
 * mais barata que o plano descreve, e a única que não depende da vitrine.
 *
 *   passo 1 · celular     — o dado que a pessoa dá sem pensar duas vezes
 *   passo 2 · CPF + LGPD  — o pedágio, agora sozinho na tela
 *
 * A ordem não é arbitrária: é a mesma do C3 ("só WhatsApp primeiro, CPF ao
 * gerar a oferta real"), aplicada ao que dá para fazer sem mexer no funil. E o
 * celular vem primeiro por um segundo motivo — no WhatsApp ele já é conhecido
 * (`prefilledPhone`), então quem chega por lá começa direto no passo 2.
 *
 * O INVARIANTE fica intacto: o envio continua exigindo os três (CPF válido,
 * celular e aceite). Dois passos mudam a apresentação, nunca o que a Bevi
 * precisa receber.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction, status: "ready" }),
}));

import { GateIdentityForm } from "./gate-identity-form";

afterEach(() => {
	sendAction.mockReset();
	cleanup();
});

const digitar = (testid: string, valor: string) =>
	fireEvent.change(screen.getByTestId(testid), { target: { value: valor } });

/** O aceite LGPD.
 *
 *  O `Checkbox` do base-ui pinta um `<span role="checkbox">` e mantém o
 *  controle REAL num `<input type="checkbox">` visualmente escondido. O
 *  `data-testid` e o `role` ficam no span, e clicar nele não alterna nada em
 *  `happy-dom` — quem responde é o input. Verificado no próprio componente
 *  antes de escrever isto, não deduzido. */
const aceitarLgpd = (container: HTMLElement) => {
	const input = container.querySelector('input[type="checkbox"]');
	if (!input) throw new Error("o input do aceite LGPD não está na tela");
	fireEvent.click(input);
};

describe("C7 — o card pede um dado por vez", () => {
	it("abre no celular, e o CPF ainda não está na tela", () => {
		render(<GateIdentityForm />);

		expect(screen.getByTestId("identify-phone")).toBeTruthy();
		expect(screen.queryByTestId("identify-cpf")).toBeNull();
		// E o aceite, que é a terceira coisa a conceder, também espera.
		expect(screen.queryByTestId("identify-lgpd")).toBeNull();
	});

	it("o passo 1 não avança sem um celular válido", () => {
		render(<GateIdentityForm />);
		const avancar = screen.getByTestId("identify-avancar");

		expect(avancar).toHaveProperty("disabled", true);
		digitar("identify-phone", "1199999");
		expect(screen.getByTestId("identify-avancar")).toHaveProperty("disabled", true);

		digitar("identify-phone", "11999998888");
		expect(screen.getByTestId("identify-avancar")).toHaveProperty("disabled", false);
	});

	it("com o celular dado, o passo 2 traz o CPF e o aceite", () => {
		render(<GateIdentityForm />);
		digitar("identify-phone", "11999998888");
		fireEvent.click(screen.getByTestId("identify-avancar"));

		expect(screen.getByTestId("identify-cpf")).toBeTruthy();
		expect(screen.getByTestId("identify-lgpd")).toBeTruthy();
		// O celular sai da tela — já foi respondido.
		expect(screen.queryByTestId("identify-phone")).toBeNull();
	});

	it("dá para voltar e corrigir o celular sem perder o que já foi digitado", () => {
		render(<GateIdentityForm />);
		digitar("identify-phone", "11999998888");
		fireEvent.click(screen.getByTestId("identify-avancar"));
		fireEvent.click(screen.getByTestId("identify-voltar"));

		expect((screen.getByTestId("identify-phone") as HTMLInputElement).value).toBe(
			"(11) 99999-8888",
		);
	});

	it("quem chega pelo WhatsApp já começa no passo 2 — o celular é o waId", () => {
		// Lá o número já é conhecido, e pedi-lo de novo seria a pergunta que o
		// próprio canal responde.
		render(<GateIdentityForm prefilledPhone="11999998888" />);

		expect(screen.getByTestId("identify-cpf")).toBeTruthy();
		expect(screen.queryByTestId("identify-avancar")).toBeNull();
	});
});

describe("C7 — o que os dois passos NÃO podem mudar", () => {
	it("o envio continua exigindo os três: CPF, celular e aceite", () => {
		const { container } = render(<GateIdentityForm />);
		digitar("identify-phone", "11999998888");
		fireEvent.click(screen.getByTestId("identify-avancar"));

		// Só CPF: ainda travado.
		digitar("identify-cpf", "11144477735");
		expect(screen.getByTestId("identify-submit")).toHaveProperty("disabled", true);

		// Com o aceite: libera.
		aceitarLgpd(container);
		expect(screen.getByTestId("identify-submit")).toHaveProperty("disabled", false);
	});

	it("manda o MESMO payload de sempre — a Bevi não vê diferença", () => {
		const { container } = render(<GateIdentityForm />);
		digitar("identify-phone", "11999998888");
		fireEvent.click(screen.getByTestId("identify-avancar"));
		digitar("identify-cpf", "11144477735");
		aceitarLgpd(container);
		fireEvent.click(screen.getByTestId("identify-submit"));

		expect(sendAction).toHaveBeenCalledTimes(1);
		expect(sendAction.mock.calls[0][0]).toMatchObject({
			kind: "gate",
			gate: "identify",
			value: { cpf: "11144477735", celular: "11999998888", lgpd: true },
		});
	});

	it("a garantia e a credencial continuam visíveis nos DOIS passos", () => {
		// C2 e C5 existem para reduzir o risco percebido no instante do pedido.
		// Escondê-las no passo em que o CPF é pedido seria desfazer os dois itens
		// para caber neste.
		render(<GateIdentityForm />);
		expect(screen.getByText(/autorizadas pelo Banco Central/i)).toBeTruthy();
		expect(screen.getByText(/não são vendidos/i)).toBeTruthy();

		digitar("identify-phone", "11999998888");
		fireEvent.click(screen.getByTestId("identify-avancar"));

		expect(screen.getByText(/autorizadas pelo Banco Central/i)).toBeTruthy();
		expect(screen.getByText(/não são vendidos/i)).toBeTruthy();
	});

	it("o card do HISTÓRICO mostra tudo de uma vez, e inerte", () => {
		// Card antigo é registro do que aconteceu (FIX-381). Um passo a passo
		// congelado no meio contaria a história pela metade.
		render(<GateIdentityForm active={false} />);

		expect(screen.getByTestId("identify-phone")).toBeTruthy();
		expect(screen.getByTestId("identify-cpf")).toBeTruthy();
		expect(screen.queryByTestId("identify-avancar")).toBeNull();
		expect(screen.getByTestId("identify-submit")).toHaveProperty("disabled", true);
	});
});
