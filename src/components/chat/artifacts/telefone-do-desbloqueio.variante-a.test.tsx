// @vitest-environment happy-dom
/**
 * FIX-395 — Variante B: o telefone ANTES de liberar a comparação.
 *
 * Palavras da Bruna na call de 29/09/2026 (12:07:52): *"Primeiro coisa que a
 * gente está falando aqui de plano de ação é: antes de mostrar a simulação, a
 * gente colocar o telefone."*
 *
 * Regressão exigida pelo card:
 *  - sem telefone conhecido ⇒ o passo aparece ANTES da comparação, e a
 *    comparação só é liberada depois de um telefone VÁLIDO;
 *  - com telefone conhecido ⇒ o passo NÃO aparece.
 *
 * A cópia é LITERAL do documento (`docs/decisoes/2026-09-29-copia-do-
 * desbloqueio-do-telefone.md`) — este teste trava o texto, então quem reescrever
 * a copy quebra aqui de propósito.
 *
 * 🚫 Nenhuma chamada real a WhatsApp/Meta: `sendAction` é mock, e o teste
 * garante que o caminho termina numa AÇÃO DE CARD, não num disparo.
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

const PAYLOAD_B: TelefoneDoDesbloqueioPayload = { variante: "A", estado: "pede-antes" };

describe("TelefoneDoDesbloqueio — variante B (FIX-395)", () => {
	afterEach(() => {
		cleanup();
		sendAction.mockClear();
	});

	it("mostra a cópia LITERAL do documento (título, apoio, campo, botão, rodapé)", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_B} />);
		expect(screen.getByText("Falta um passo para ver a sua comparação")).toBeDefined();
		expect(
			screen.getByText(
				/A comparação é montada na hora, com a faixa que você buscou\. Deixo ela salva no seu WhatsApp — se a sua internet cair, eu te encontro de volta\./,
			),
		).toBeDefined();
		expect(screen.getByText("Seu WhatsApp com DDD")).toBeDefined();
		expect(screen.getByText("Ver a minha comparação")).toBeDefined();
		expect(
			screen.getByText(
				/Seus dados seguem a LGPD\. A AJA não vende consórcio próprio e não repassa seu contato\./,
			),
		).toBeDefined();
	});

	it("NÃO mostra card de comparação: o passo vem antes dela", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_B} />);
		// nada de parcela/valor de oferta neste caminho — a comparação não foi liberada
		expect(screen.queryByTestId("melhor-opcao-borrada")).toBeNull();
		expect(screen.queryByText(/\/mês/)).toBeNull();
	});

	it("telefone inválido ⇒ o submit está desabilitado e NADA é enviado", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_B} />);
		const enviar = screen.getByTestId("desbloqueio-enviar") as HTMLButtonElement;
		expect(enviar.disabled).toBe(true);

		// número curto/incompleto — não passa na régua do gate identify
		fireEvent.change(screen.getByTestId("desbloqueio-phone"), {
			target: { value: "(11) 9999" },
		});
		expect((screen.getByTestId("desbloqueio-enviar") as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(screen.getByTestId("desbloqueio-enviar"));
		expect(sendAction).not.toHaveBeenCalled();
	});

	it("telefone VÁLIDO ⇒ a comparação é liberada: ação enviada + confirmação", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_B} />);
		// número FALSO de teste (padrão 99999) — nunca PII real
		fireEvent.change(screen.getByTestId("desbloqueio-phone"), {
			target: { value: "(11) 99999-9999" },
		});
		const enviar = screen.getByTestId("desbloqueio-enviar") as HTMLButtonElement;
		expect(enviar.disabled).toBe(false);
		fireEvent.click(enviar);

		expect(sendAction).toHaveBeenCalledTimes(1);
		expect(sendAction).toHaveBeenCalledWith(
			{
				kind: "telefone_desbloqueio",
				variante: "A",
				celular: "11999999999",
				label: "Ver a minha comparação",
			},
			"Ver a minha comparação",
		);
		expect(screen.getByTestId("desbloqueio-conteudo-liberado")).toBeDefined();
	});

	it("NÃO oferece 'Agora não' — essa saída é só da variante C", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_B} />);
		expect(screen.queryByTestId("desbloqueio-agora-nao")).toBeNull();
		expect(screen.queryByText("Agora não")).toBeNull();
	});

	it("não reenvia a ação duas vezes (guard anti duplo-clique)", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_B} />);
		fireEvent.change(screen.getByTestId("desbloqueio-phone"), {
			target: { value: "(11) 99999-9999" },
		});
		const enviar = screen.getByTestId("desbloqueio-enviar") as HTMLButtonElement;
		fireEvent.click(enviar);
		fireEvent.click(enviar);
		expect(sendAction).toHaveBeenCalledTimes(1);
	});

	it("card do HISTÓRICO (active=false) não deixa preencher nem enviar", () => {
		render(<TelefoneDoDesbloqueio payload={PAYLOAD_B} active={false} />);
		const input = screen.getByTestId("desbloqueio-phone") as HTMLInputElement;
		expect(input.disabled).toBe(true);
		expect((screen.getByTestId("desbloqueio-enviar") as HTMLButtonElement).disabled).toBe(true);
	});
});

describe("estadoDoDesbloqueio — a decisão de variante B (FIX-395)", () => {
	it("sem telefone conhecido numa visita B ⇒ pede-antes", () => {
		expect(estadoDoDesbloqueio({ variante: "A", celularConhecido: false })).toBe("pede-antes");
	});

	it("telefone já conhecido ⇒ NÃO pede de novo (livre)", () => {
		expect(estadoDoDesbloqueio({ variante: "A", celularConhecido: true })).toBe("livre");
	});
});
