// @vitest-environment happy-dom
/**
 * Camada 2 — FIX-55 (Bernardo, jornada2_revisão.docx): o ValuePicker
 * (present_value_picker) só aceitava múltiplos do `step` no slider de valor do
 * bem. Agora cada campo `currency` tem um input numérico livre ao lado do
 * slider — o usuário digita o valor exato (quebrado) e ele propaga sem snap.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValuePickerPayload } from "@/lib/chat/types";

const sendUserMessage = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendUserMessage, status: "ready" }),
}));

import { ValuePicker } from "./value-picker";

const payload: ValuePickerPayload = {
	category: "auto",
	fields: [
		{
			id: "creditValue",
			label: "Valor do bem",
			min: 20_000,
			max: 500_000,
			step: 1_000,
			default: 80_000,
			format: "currency",
		},
	],
};

beforeEach(() => {
	sendUserMessage.mockReset();
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("FIX-55 — input livre no ValuePicker aceita número quebrado", () => {
	it("campo currency tem input numérico editável", () => {
		render(<ValuePicker payload={payload} />);
		const input = screen.getByTestId("value-input-creditValue") as HTMLInputElement;
		expect(input).toBeDefined();
		expect(input.inputMode).toBe("numeric");
	});

	it("digitar valor quebrado (347_500) propaga na mensagem do submit sem snap a múltiplo de 10k", () => {
		render(<ValuePicker payload={payload} />);
		const input = screen.getByTestId("value-input-creditValue");
		fireEvent.change(input, { target: { value: "347500" } });
		fireEvent.blur(input);
		fireEvent.click(screen.getByRole("button"));
		expect(sendUserMessage).toHaveBeenCalledTimes(1);
		const msg = sendUserMessage.mock.calls[0][0] as string;
		expect(msg).toContain("347.500");
	});

	it("input clampa ao teto da categoria quando acima do max", () => {
		render(<ValuePicker payload={payload} />);
		const input = screen.getByTestId("value-input-creditValue");
		fireEvent.change(input, { target: { value: "9999999" } });
		fireEvent.blur(input);
		fireEvent.click(screen.getByRole("button"));
		const msg = sendUserMessage.mock.calls[0][0] as string;
		expect(msg).toContain("500.000");
	});
});
