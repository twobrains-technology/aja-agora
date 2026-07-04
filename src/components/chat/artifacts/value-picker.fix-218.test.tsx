// @vitest-environment happy-dom
/**
 * FIX-218 (Ata 2026-07-04, item 3): o valor do bem digitado no input livre da
 * web parava de ser capado à faixa do slider — "1.012.000" (auto, faixa até
 * 500 mil) virava "500.000". Decisão do cliente: aceitar o valor DIGITADO como
 * digitado; o slider mantém min/max só como dica visual. A busca (FIX-219)
 * traz os grupos pela ordem de grandeza mais próxima, não pelo valor exato.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValuePickerPayload } from "@/lib/chat/types";

const sendUserMessage = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendUserMessage, status: "ready" }),
}));

import { ValuePicker } from "./value-picker";

const autoPayload: ValuePickerPayload = {
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

describe("FIX-218 — input digitado aceita valor livre, fora da faixa do slider", () => {
	it("digitar 1.012.000 num auto (faixa até 500 mil) mantém 1.012.000 — NÃO capa a 500.000", () => {
		render(<ValuePicker payload={autoPayload} />);
		const input = screen.getByTestId("value-input-creditValue");
		fireEvent.change(input, { target: { value: "1.012.000" } });
		fireEvent.blur(input);
		fireEvent.click(screen.getByRole("button"));

		expect(sendUserMessage).toHaveBeenCalledTimes(1);
		const msg = sendUserMessage.mock.calls[0][0] as string;
		expect(msg).toContain("1.012.000");
		expect(msg).not.toContain("500.000");
	});

	it("digitar 122 mil (formato por extenso) mantém o valor livre", () => {
		render(<ValuePicker payload={autoPayload} />);
		const input = screen.getByTestId("value-input-creditValue");
		fireEvent.change(input, { target: { value: "122 mil" } });
		fireEvent.blur(input);
		fireEvent.click(screen.getByRole("button"));

		const msg = sendUserMessage.mock.calls[0][0] as string;
		expect(msg).toContain("122.000");
	});

	it("input exibe o valor digitado sem capar ANTES do submit (estado interno)", () => {
		render(<ValuePicker payload={autoPayload} />);
		const input = screen.getByTestId("value-input-creditValue") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "1012000" } });
		fireEvent.blur(input);
		expect(input.value).toBe("1.012.000");
	});
});

describe("FIX-218 — slider (arraste) continua respeitando min/max da categoria", () => {
	it("arrastar até o fim (End) fica no teto do campo (500 mil) — o slider não regrediu", () => {
		render(<ValuePicker payload={autoPayload} />);
		const slider = screen.getByRole("slider");
		fireEvent.keyDown(slider, { key: "End" });
		fireEvent.click(screen.getByRole("button"));
		const msg = sendUserMessage.mock.calls[0][0] as string;
		expect(msg).toContain("500.000");
	});

	it("mesmo após digitar um valor livre acima do teto, arrastar (Home) volta a respeitar o piso do campo", () => {
		render(<ValuePicker payload={autoPayload} />);
		const input = screen.getByTestId("value-input-creditValue");
		fireEvent.change(input, { target: { value: "1.012.000" } });
		fireEvent.blur(input);

		const slider = screen.getByRole("slider");
		fireEvent.keyDown(slider, { key: "Home" });
		fireEvent.click(screen.getByRole("button"));
		const msg = sendUserMessage.mock.calls[0][0] as string;
		expect(msg).toContain("20.000");
	});
});
