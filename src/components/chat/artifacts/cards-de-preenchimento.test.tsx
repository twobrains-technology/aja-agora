// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";

const ctx = vi.hoisted(() => ({
	messages: [] as AjaUIMessage[],
	sendUserMessage: vi.fn(),
	sendAction: vi.fn(),
	status: "streaming" as "ready" | "streaming" | "submitted",
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendUserMessage: ctx.sendUserMessage,
		sendAction: ctx.sendAction,
		status: ctx.status,
		messages: ctx.messages,
	}),
}));

import { ContractForm } from "./contract-form";
import { NamePrompt } from "./name-prompt";
import { TelefoneDoDesbloqueio } from "./telefone-do-desbloqueio";
import { ValuePicker } from "./value-picker";
import { WhatsappOptin } from "./whatsapp-optin";

const VALOR = {
	category: "auto" as const,
	fields: [
		{
			id: "credit",
			label: "Valor do carro",
			min: 20_000,
			max: 200_000,
			step: 10_000,
			default: 40_000,
			format: "currency" as const,
		},
	],
};

const msg = (role: "user" | "assistant", id: string) =>
	({ id, role, parts: [{ type: "text", text: "x" }] }) as unknown as AjaUIMessage;

// Cada card: como renderiza, o campo principal, como deixa o card "pronto para enviar".
const CARDS = [
	{
		nome: "value_picker",
		ui: () => <ValuePicker payload={VALOR} />,
		campo: () => screen.getByTestId("value-input-credit"),
		preencher: () => {},
		enviado: () => ctx.sendUserMessage,
	},
	{
		nome: "name_prompt",
		ui: () => <NamePrompt />,
		campo: () => screen.getByTestId("name-input"),
		preencher: () =>
			fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Maria" } }),
		enviado: () => ctx.sendUserMessage,
	},
	{
		nome: "whatsapp_optin",
		ui: () => <WhatsappOptin />,
		campo: () => screen.getByPlaceholderText("(11) 98765-4321"),
		preencher: () =>
			fireEvent.change(screen.getByPlaceholderText("(11) 98765-4321"), {
				target: { value: "11987654321" },
			}),
		enviado: () => ctx.sendAction,
	},
	{
		nome: "telefone_do_desbloqueio",
		ui: () => <TelefoneDoDesbloqueio payload={{ variante: "B" } as never} />,
		campo: () => screen.getByTestId("desbloqueio-phone"),
		preencher: () =>
			fireEvent.change(screen.getByTestId("desbloqueio-phone"), {
				target: { value: "11987654321" },
			}),
		enviado: () => ctx.sendAction,
	},
	{
		nome: "contract_form",
		ui: () => <ContractForm payload={{} as never} />,
		campo: () => screen.getByTestId("contract-cpf"),
		preencher: () => {
			fireEvent.change(screen.getByTestId("contract-cpf"), { target: { value: "12345678909" } });
			fireEvent.change(screen.getByTestId("contract-phone"), { target: { value: "11987654321" } });
		},
		enviado: () => ctx.sendAction,
	},
];

beforeEach(() => {
	ctx.messages = [msg("assistant", "a1")];
	ctx.status = "streaming"; // o stream do chat inteiro ainda não fechou
	ctx.sendUserMessage.mockReset();
	ctx.sendAction.mockReset();
});
afterEach(cleanup);

describe.each(CARDS)("card de preenchimento — $nome", (card) => {
	it("monta com o campo principal FOCADO e habilitado, mesmo com o stream aberto", () => {
		render(card.ui());
		const campo = card.campo() as HTMLInputElement;
		expect(campo.disabled).toBe(false);
		expect(document.activeElement).toBe(campo);
	});

	it("Enter (submit do <form>) envia quando os campos são válidos", () => {
		ctx.status = "ready";
		const { container } = render(card.ui());
		card.preencher();
		const form = container.querySelector("form");
		expect(form).not.toBeNull();
		fireEvent.submit(form as HTMLFormElement);
		expect(card.enviado()).toHaveBeenCalledTimes(1);
	});

	it("sela depois que o cliente responde digitando na conversa", () => {
		const { rerender, container } = render(card.ui());
		expect(card.campo()).toBeTruthy();
		ctx.messages = [msg("assistant", "a1"), msg("user", "u1")];
		rerender(card.ui());
		// Selado: nenhum campo ativo; se sobra algo, é o rótulo textual.
		expect(container.querySelector("input:not([disabled])")).toBeNull();
	});

	it("sela também quando o card monta DEPOIS da resposta (remontagem)", () => {
		ctx.messages = [msg("assistant", "a1"), msg("user", "u1")];
		const { container } = render(card.ui());
		expect(container.querySelector("input:not([disabled])")).toBeNull();
	});
});

describe("estado respondido tem texto visível (não só cor)", () => {
	it("whatsapp_optin sela com o rótulo 'Respondido'", () => {
		ctx.messages = [msg("assistant", "a1"), msg("user", "u1")];
		render(<WhatsappOptin />);
		expect(screen.getByTestId("card-respondido").textContent).toContain("Respondido");
	});
});
