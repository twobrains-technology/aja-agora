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
 *
 * ── REVERSÃO PARCIAL E CONSCIENTE, 2026-08-30 (decisão do Kairo) ────────────
 *
 * A agulha ÚNICA continua — os três sliders interligados não voltam, e é isso
 * que a maior parte deste arquivo protege. O que volta é a PARCELA ESTIMADA,
 * como linha de leitura ao lado da agulha.
 *
 * O que mudou entre 28/06 e hoje foi o que se sabe do funil. Medido no banco de
 * produção em 30/08/2026 (janela limpa de 16–30/08, 71 conversas web reais):
 * **34 delas, 49%, morrem com uma única fala do cliente**, e 46 (65%) nunca
 * chegam a informar o valor do bem. Do outro lado, de quem CHEGA a informar o
 * valor, 86% entrega o CPF. O cliente não desiste por falta de precisão — ele
 * desiste porque nada aparece na tela.
 *
 * A razão original do FIX-107 continua de pé e por isso o selo é obrigatório
 * (`parcela-estimada-selo`, testado em
 * `value-picker.estimativa-antes-do-dado.test.tsx`): o número da agulha é
 * premissa de mercado documentada, e a tela diz isso na cara. O invariante do
 * projeto — número de administradora sai de tool, nunca da nossa cabeça —
 * continua intacto, porque nada aqui se apresenta como oferta.
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

	it("a parcela estimada NUNCA aparece sem o selo que a desmente como oferta", () => {
		// O que o FIX-107 proibia era a estimativa CALADA — número na tela com
		// cara de dado de administradora. Isso continua proibido: se a parcela
		// aparecer, o selo aparece junto, sempre. É o selo que impede a
		// estimativa de virar promessa e a oferta real de virar decepção.
		render(<ValuePicker payload={payload} />);

		const texto = document.body.textContent ?? "";
		if (/\/mês/.test(texto)) {
			expect(screen.getByTestId("parcela-estimada-selo").textContent?.toLowerCase()).toContain(
				"estimativa",
			);
			expect(texto).toMatch(/valores reais vêm da busca/i);
		}
	});

	it("os três sliders interligados NÃO voltam — a reversão de 30/08 é só da leitura", () => {
		render(<ValuePicker payload={payload} />);
		expect(screen.getAllByRole("slider").length).toBe(1);
		// A parcela é LIDA ao lado da agulha; ela não é um controle que o cliente
		// mexe. Um campo de parcela editável aqui traria de volta a interligação
		// que o FIX-107 removeu.
		expect(screen.queryByLabelText(/parcela/i)).toBeNull();
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
