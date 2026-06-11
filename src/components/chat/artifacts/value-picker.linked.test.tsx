// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-16: ValuePicker inteligente (present_value_picker).
 * Pedido do Kairo (2026-06-11): arrastou parcela/prazo → valor do bem se
 * ajusta ao vivo pela relação de consórcio (engine value-picker-link).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValuePickerPayload } from "@/lib/chat/types";

const sendUserMessage = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendUserMessage, status: "ready" }),
}));

import { ValuePicker } from "./value-picker";

// Mesmo shape da screenshot do pedido: bem + parcela + prazo (categoria auto)
const payload: ValuePickerPayload = {
	category: "auto",
	fields: [
		{ id: "creditValue", label: "Valor do bem", min: 20_000, max: 300_000, step: 1_000, default: 80_000, format: "currency" },
		{ id: "monthlyBudget", label: "Parcela mensal", min: 300, max: 5_000, step: 100, default: 2_000, format: "currency" },
		{ id: "term", label: "Prazo", min: 24, max: 100, step: 1, default: 60, format: "months" },
	],
};

beforeEach(() => {
	sendUserMessage.mockReset();
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("FIX-16 — ValuePicker interligado pela matemática de consórcio", () => {
	it("componente usa a engine compartilhada (identifyLinkRoles + recalcLinkedValues)", () => {
		const src = readFileSync("src/components/chat/artifacts/value-picker.tsx", "utf-8");
		expect(src).toMatch(/identifyLinkRoles/);
		expect(src).toMatch(/recalcLinkedValues/);
	});

	it("arrastou a PARCELA (teclado no slider) → o VALOR DO BEM sobe junto", () => {
		render(<ValuePicker payload={payload} />);
		const sliders = screen.getAllByRole("slider");
		expect(sliders.length).toBe(3);

		// estado inicial vem do agent, intacto (não reconciliamos o histórico)
		expect(document.body.textContent).toContain("R$ 80 mil");

		// ArrowRight no slider da parcela: 2000 → 2100
		// bem derivado: 2100 × 60 / 1.15 = 109.565 → snap step 1000 = 110.000 → "R$ 110 mil"
		fireEvent.keyDown(sliders[1], { key: "ArrowRight" });
		const text = document.body.textContent ?? "";
		expect(text).toContain("R$ 2.100");
		expect(text).toContain("R$ 110 mil");
	});

	it("arrastou o PRAZO → o VALOR DO BEM se ajusta mantendo a parcela", () => {
		render(<ValuePicker payload={payload} />);
		const sliders = screen.getAllByRole("slider");

		// ArrowRight no prazo: 60 → 61 meses
		// bem derivado: 2000 × 61 / 1.15 = 106.086 → snap 106.000 → "R$ 106 mil"
		fireEvent.keyDown(sliders[2], { key: "ArrowRight" });
		const text = document.body.textContent ?? "";
		expect(text).toContain("61 meses");
		expect(text).toContain("R$ 106 mil");
		expect(text).toContain("R$ 2.000"); // parcela intacta
	});

	it("arrastou o BEM → a PARCELA se ajusta (prazo fixo)", () => {
		render(<ValuePicker payload={payload} />);
		const sliders = screen.getAllByRole("slider");

		// ArrowRight no bem: 80.000 → 81.000
		// parcela derivada: 81.000 × 1.15 / 60 = 1.552,50 → snap step 100 = 1.600
		fireEvent.keyDown(sliders[0], { key: "ArrowRight" });
		const text = document.body.textContent ?? "";
		expect(text).toContain("R$ 81 mil");
		expect(text).toContain("R$ 1.600");
		expect(text).toContain("60 meses");
	});

	it("SELO de estimativa visível quando o link está ativo (regra de produto FIX-3)", () => {
		render(<ValuePicker payload={payload} />);
		expect(document.body.textContent).toMatch(/[Ee]stimativa/);
	});

	it("payload sem papéis identificáveis → degrada pro comportamento solto, sem selo", () => {
		const loose: ValuePickerPayload = {
			category: "auto",
			fields: [
				{ id: "creditValue", label: "Valor do bem", min: 20_000, max: 300_000, step: 1_000, default: 80_000, format: "currency" },
			],
		};
		render(<ValuePicker payload={loose} />);
		expect(screen.getAllByRole("slider").length).toBe(1);
		expect(document.body.textContent).not.toMatch(/[Ee]stimativa/);
	});

	it("submit envia os valores ATUAIS (pós-recálculo) na mensagem", () => {
		render(<ValuePicker payload={payload} />);
		const sliders = screen.getAllByRole("slider");
		fireEvent.keyDown(sliders[1], { key: "ArrowRight" }); // parcela 2100 → bem 110.000
		fireEvent.click(screen.getByRole("button"));
		expect(sendUserMessage).toHaveBeenCalledTimes(1);
		const msg = sendUserMessage.mock.calls[0][0] as string;
		expect(msg).toContain("110.000");
		expect(msg).toContain("2.100");
	});
});
