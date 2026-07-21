// @vitest-environment happy-dom
/**
 * Camada 1+2 — FIX-107 (revisão da jornada de entrada, 2026-06-28).
 *
 * Decisão do Kairo: a web troca o `value_picker` COMPLEXO (3 sliders interligados
 * valor/parcela/prazo — FIX-16) por uma AGULHA SIMPLES só do VALOR DO BEM, de
 * R$ 1.000 em R$ 1.000. O valor passa a ser coletado por conversa; a parcela vem
 * das ofertas REAIS da Bevi (não é mais estimada/derivada na entrada) e o prazo
 * sai da entrada. Este componente é o apoio visual pro "quanto custa o que você
 * quer".
 */

import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValuePickerPayload } from "@/lib/chat/types";

const sendUserMessage = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendUserMessage, status: "ready" }),
}));

import { VALUE_STEP, ValuePicker } from "./value-picker";

// Mesmo que o backend ainda mande mais de um campo (legado), a agulha só usa o
// VALOR DO BEM (primeiro campo currency) — parcela/prazo somem da entrada.
const payload: ValuePickerPayload = {
	category: "auto",
	fields: [
		{
			id: "creditValue",
			label: "Valor do bem",
			min: 20_000,
			max: 300_000,
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

describe("FIX-107 — agulha simples de valor do bem (1k em 1k)", () => {
	it("renderiza UM único slider (sem parcela/prazo interligados)", () => {
		render(<ValuePicker payload={payload} />);
		expect(screen.getAllByRole("slider").length).toBe(1);
	});

	it("o slider anda de R$ 1.000 em R$ 1.000 (step=1000) e emite o valor escolhido", () => {
		render(<ValuePicker payload={payload} />);
		const slider = screen.getByRole("slider");
		// ArrowRight = +1 step = +R$ 1.000 → 80.000 → 81.000
		fireEvent.keyDown(slider, { key: "ArrowRight" });
		fireEvent.click(screen.getByRole("button"));
		expect(sendUserMessage).toHaveBeenCalledTimes(1);
		const msg = sendUserMessage.mock.calls[0][0] as string;
		expect(msg).toContain("81.000");
	});

	it("não estima parcela nem mostra selo de estimativa de mercado", () => {
		render(<ValuePicker payload={payload} />);
		expect(document.body.textContent ?? "").not.toMatch(/[Ee]stimativa/);
		expect(document.body.textContent ?? "").not.toMatch(/parcela/i);
	});

	it("ignora campos extras (parcela/prazo) e mantém só a agulha de valor", () => {
		const legacy: ValuePickerPayload = {
			category: "auto",
			fields: [
				{
					id: "creditValue",
					label: "Valor do bem",
					min: 20_000,
					max: 300_000,
					step: 1_000,
					default: 80_000,
					format: "currency",
				},
				{
					id: "monthlyBudget",
					label: "Parcela mensal",
					min: 300,
					max: 5_000,
					step: 100,
					default: 2_000,
					format: "currency",
				},
				{ id: "term", label: "Prazo", min: 24, max: 100, step: 1, default: 60, format: "months" },
			],
		};
		render(<ValuePicker payload={legacy} />);
		expect(screen.getAllByRole("slider").length).toBe(1);
	});

	it("não depende mais da engine de sliders interligados (value-picker-link)", () => {
		const src = readFileSync("src/components/chat/artifacts/value-picker.tsx", "utf-8");
		expect(src).not.toMatch(/recalcLinkedValues/);
		expect(src).not.toMatch(/identifyLinkRoles/);
	});

	// O passo da agulha virou R$ 10.000 (Kairo, 2026-07-21: "o componente de
	// valor deve passar de 10 em 10 mil e não de 1 em 1 mil") — carro de R$ 260
	// mil não se escolhe de mil em mil. O valor vem do payload (`field.step`, por
	// categoria) e cai em `VALUE_STEP` quando ausente.
	it("o passo da agulha é de R$ 10.000 (default), respeitando o step do payload", () => {
		expect(VALUE_STEP).toBe(10_000);
		const src = readFileSync("src/components/chat/artifacts/value-picker.tsx", "utf-8");
		expect(src).toMatch(/step=\{field\.step \|\| VALUE_STEP\}/);
	});
});
