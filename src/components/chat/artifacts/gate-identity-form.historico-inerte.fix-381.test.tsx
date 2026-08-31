// @vitest-environment happy-dom
/**
 * FIX-381 — o formulário de identidade do HISTÓRICO tem que ficar inerte.
 *
 * Visto ao vivo (smoke Kairo, 2026-07-26): ao retomar a conversa ("Voltar à
 * conversa"), a tela mostrou DOIS formulários "Pra buscar suas ofertas reais" —
 * o antigo, no histórico, e o novo do turno de retomada. Ambos com campos
 * digitáveis. Eu mesmo, pilotando, digitei no errado: preenchi o de cima, a
 * tela rolou, e os dados sumiram.
 *
 * A causa é estreita: `active` (que `chat-message.tsx` já calcula como
 * `isLast`) só afetava o `autoFocus` e a habilitação do BOTÃO. Os `input`s
 * usavam `disabled={isStreaming || submitted}` — sem `!active`. Resultado: o
 * card velho parecia vivo, aceitava digitação e não tinha como ser enviado.
 *
 * Card histórico é registro do que aconteceu, não um formulário a preencher.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GateIdentityForm } from "./gate-identity-form";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

describe("GateIdentityForm — card do histórico não aceita digitação (FIX-381)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	/** `toBeDisabled` (jest-dom) não está no setup deste projeto — a propriedade
	 * nativa do elemento diz a mesma coisa, sem dependência nova. */
	const campo = (placeholder: string) =>
		screen.getByPlaceholderText(placeholder) as HTMLInputElement;

	it("desabilita os campos quando o card não é o ativo", () => {
		render(<GateIdentityForm active={false} />);
		expect(campo("000.000.000-00").disabled).toBe(true);
		expect(campo("(11) 99999-9999").disabled).toBe(true);
	});

	it("mantém os campos utilizáveis no card ativo", () => {
		// Sem esta metade o fix viraria "ninguém preenche nada".
		//
		// Desde o C7 (30/08/2026) o card ativo abre em dois passos: o celular
		// sozinho, e o CPF depois. O card do HISTÓRICO continua mostrando tudo de
		// uma vez — é registro do que aconteceu, e um passo a passo congelado no
		// meio contaria a história pela metade.
		render(<GateIdentityForm active={true} />);
		expect(campo("(11) 99999-9999").disabled).toBe(false);

		fireEvent.change(campo("(11) 99999-9999"), { target: { value: "11999998888" } });
		fireEvent.click(screen.getByTestId("identify-avancar"));
		expect(campo("000.000.000-00").disabled).toBe(false);
	});
});
