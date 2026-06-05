// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-3: componente "Planeje sua conquista" (passo 2, gate credit).
 * 4 indicadores interligados + lance embutido + estimativa ao vivo com SELO
 * obrigatório de estimativa (decisão aprovada: nunca apresentar como dado
 * real — a Bevi só simula pós-identify).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanGatePartData } from "@/lib/chat/ui-message";

const sendAction = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		conversationId: "conv-123",
		sendAction,
		status: "ready",
	}),
}));

import { PlanEstimatePicker } from "./plan-estimate-picker";

const payload: PlanGatePartData = {
	kind: "plan",
	gate: "credit",
	category: "moto",
	credit: { id: "credit", label: "Valor do bem", format: "currency", min: 8_000, max: 80_000, step: 1_000, default: 25_000 },
	monthly: { id: "monthlyBudget", label: "Parcela mensal", format: "currency", min: 150, max: 2_500, step: 50, default: 500 },
	targetMonthDefault: 6,
};

beforeEach(() => {
	sendAction.mockReset();
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("FIX-3 — PlanEstimatePicker", () => {
	it("renderiza os 4 indicadores + lance embutido + estimativa ao vivo", () => {
		render(<PlanEstimatePicker payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).toContain("Valor do bem");
		expect(text).toContain("Quando você quer usar o valor");
		expect(text).toContain("Parcela mensal");
		expect(text).toContain("Lance que você consegue dar");
		expect(text).toContain("Considerar lance embutido?");
		// educação do docx no próprio componente
		expect(text).toMatch(/parte do próprio valor do bem|não tem.*em dinheiro hoje/);
		// estimativa ao vivo
		expect(screen.getByTestId("plan-estimate")).toBeDefined();
		expect(text).toContain("Parcela estimada");
	});

	it("SELO de estimativa SEMPRE visível (regra de produto)", () => {
		render(<PlanEstimatePicker payload={payload} />);
		expect(document.body.textContent).toMatch(
			/Estimativa de mercado — os valores reais vêm das administradoras/,
		);
	});

	it("submit envia o gate credit com mês-alvo e lance (preenche os gates seguintes)", () => {
		render(<PlanEstimatePicker payload={payload} />);
		fireEvent.click(screen.getByTestId("plan-submit"));
		expect(sendAction).toHaveBeenCalledTimes(1);
		const [action] = sendAction.mock.calls[0];
		expect(action.kind).toBe("gate");
		expect(action.gate).toBe("credit");
		expect(action.value.credit).toBe(25_000);
		expect(action.value.monthlyBudget).toBe(500);
		expect(action.value.targetMonth).toBe(6);
		expect(action.value.lanceValue).toBe(0);
	});

	it("lance embutido NÃO decidido → action sem o campo (gate da conversa cobre a educação)", () => {
		render(<PlanEstimatePicker payload={payload} />);
		fireEvent.click(screen.getByTestId("plan-submit"));
		const [action] = sendAction.mock.calls[0];
		expect("lanceEmbutido" in action.value).toBe(false);
	});

	it("lance embutido decidido no componente → action carrega a decisão", () => {
		render(<PlanEstimatePicker payload={payload} />);
		fireEvent.click(screen.getByTestId("plan-embutido"));
		fireEvent.click(screen.getByTestId("plan-submit"));
		const [action] = sendAction.mock.calls[0];
		expect(action.value.lanceEmbutido).toBe(true);
	});
});
