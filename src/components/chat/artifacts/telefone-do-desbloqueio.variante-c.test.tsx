// @vitest-environment happy-dom
/**
 * FIX-396 — Variante C: a melhor opção VISÍVEL e BORRADA, com o telefone
 * liberando.
 *
 * Ideia do Gustavo na call de 29/09/2026 (12:08:30), endossada pelo Kairo
 * (12:08:56): *"eu gosto dessa estratégia do Gustavo de causar aquele sentimento
 * de curiosidade… é melhor do que pedir o telefone dele de cara."*
 *
 * Regressão exigida pelo card:
 *  - a melhor opção mostra o valor (a parcela) e ESCONDE o resto;
 *  - o desbloqueio libera o conteúdo depois de telefone VÁLIDO;
 *  - o "Agora não" fecha o pedido **sem** apagar a comparação;
 *  - navegação por teclado chega ao desbloqueio;
 *  - acessibilidade: o blur NÃO é a única pista.
 *
 * Cópia LITERAL do documento (trava contra reescrita).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { estadoDoDesbloqueio } from "@/lib/chat/desbloqueio-do-telefone";
import type { TelefoneDoDesbloqueioPayload } from "@/lib/chat/types";
import { TelefoneDoDesbloqueio } from "./telefone-do-desbloqueio";

const sendAction = vi.fn();

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction, status: "ready" }),
}));

const PAYLOAD_C: TelefoneDoDesbloqueioPayload = {
	variante: "C",
	estado: "borrado",
	melhorOpcao: {
		administradora: "RODOBENS",
		creditValue: 89_000,
		monthlyPayment: 1_234,
		termMonths: 96,
	},
};

describe("TelefoneDoDesbloqueio — variante C (FIX-396)", () => {
	afterEach(() => {
		cleanup();
		sendAction.mockClear();
	});

	it("mostra a cópia LITERAL do documento (selo, título, apoio, botão, link, rodapé)", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_C} />);
		expect(screen.getByText("Sua melhor opção está aqui")).toBeDefined();
		expect(screen.getByText("Libere a comparação completa")).toBeDefined();
		expect(
			screen.getByText(
				/Se a sua internet cair, eu continuo a conversa com você pelo WhatsApp\. Me deixa o seu número que eu libero a comparação agora\./,
			),
		).toBeDefined();
		expect(screen.getByText("Liberar agora")).toBeDefined();
		expect(screen.getByText("Agora não")).toBeDefined();
		expect(
			screen.getByText(
				/Seus dados seguem a LGPD\. A AJA não vende consórcio próprio e não repassa seu contato\./,
			),
		).toBeDefined();
	});

	it("a melhor opção mostra a PARCELA e esconde o resto (borrado + fora do a11y)", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_C} />);
		// o que importa fica legível: a parcela
		expect(screen.getByText("R$ 1.234")).toBeDefined();

		// o resto vai BORRADO de verdade (classe blur) e fora da árvore de acessibilidade
		const borrado = screen.getByTestId("conteudo-borrado");
		expect(borrado.getAttribute("aria-hidden")).toBe("true");
		expect(borrado.className).toMatch(/blur/);
		expect(borrado.textContent).toMatch(/R\$\s*89\.000/);
		expect(borrado.textContent).toMatch(/96\s*meses/);
	});

	it("o blur NÃO é a única pista: há texto acessível dizendo que o conteúdo libera", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_C} />);
		expect(
			screen.getByText(
				/Os detalhes da melhor opção \(valor da carta e prazo\) aparecem depois que você informar o seu WhatsApp\./,
			),
		).toBeDefined();
	});

	it("telefone inválido ⇒ nada liberado e nada enviado", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_C} />);
		const enviar = screen.getByTestId("desbloqueio-enviar") as HTMLButtonElement;
		expect(enviar.disabled).toBe(true);
		fireEvent.change(screen.getByTestId("desbloqueio-phone"), {
			target: { value: "(11) 9999" },
		});
		fireEvent.click(screen.getByTestId("desbloqueio-enviar"));
		expect(sendAction).not.toHaveBeenCalled();
		expect(screen.queryByTestId("desbloqueio-conteudo-liberado")).toBeNull();
	});

	it("telefone VÁLIDO ⇒ desbloqueia o conteúdo e envia a ação certa", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_C} />);
		fireEvent.change(screen.getByTestId("desbloqueio-phone"), {
			target: { value: "(11) 99999-9999" },
		});
		fireEvent.click(screen.getByTestId("desbloqueio-enviar"));

		expect(sendAction).toHaveBeenCalledWith(
			{
				kind: "telefone_desbloqueio",
				variante: "C",
				celular: "11999999999",
				label: "Liberar agora",
			},
			"Liberar agora",
		);
		expect(screen.getByTestId("desbloqueio-conteudo-liberado")).toBeDefined();
	});

	it("'Agora não' fecha o pedido SEM apagar a comparação", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_C} />);
		fireEvent.click(screen.getByTestId("desbloqueio-agora-nao"));

		expect(sendAction).toHaveBeenCalledWith(
			{ kind: "telefone_desbloqueio_recusar", variante: "C" },
			"Agora não",
		);
		// o conteúdo liberado CONTINUA na tela — a comparação não foi apagada
		const liberado = screen.getByTestId("desbloqueio-conteudo-liberado");
		expect(liberado.textContent).toMatch(/a sua comparação segue aqui/i);
		// e o formulário de telefone saiu de cena
		expect(screen.queryByTestId("desbloqueio-phone")).toBeNull();
	});

	it("navegação por teclado chega ao desbloqueio (input → botão)", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_C} />);
		const input = screen.getByTestId("desbloqueio-phone");
		const enviar = screen.getByTestId("desbloqueio-enviar");
		expect(input.getAttribute("disabled")).toBeNull();
		expect(enviar.getAttribute("disabled")).not.toBeNull(); // sem número ainda
		input.focus();
		expect(document.activeElement).toBe(input);
		// digitar e acionar pelo teclado (Enter no botão) chega ao desbloqueio
		fireEvent.change(input, { target: { value: "(11) 99999-9999" } });
		enviar.focus();
		expect(document.activeElement).toBe(enviar);
		fireEvent.click(enviar);
		expect(screen.getByTestId("desbloqueio-conteudo-liberado")).toBeDefined();
	});

	it("card do HISTÓRICO (active=false) não deixa recusar nem enviar", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_C} active={false} />);
		fireEvent.click(screen.getByTestId("desbloqueio-agora-nao"));
		expect(sendAction).not.toHaveBeenCalled();
	});
});

describe("estadoDoDesbloqueio — a decisão de variante C (FIX-396)", () => {
	it("sem telefone e sem recusa ⇒ borrado", () => {
		expect(estadoDoDesbloqueio({ variante: "C", celularConhecido: false })).toBe("borrado");
	});

	it("'Agora não' ⇒ livre (a comparação segue, sem telefone)", () => {
		expect(
			estadoDoDesbloqueio({ variante: "C", celularConhecido: false, recusado: true }),
		).toBe("livre");
	});

	it("telefone conhecido ⇒ livre", () => {
		expect(estadoDoDesbloqueio({ variante: "C", celularConhecido: true })).toBe("livre");
	});
});