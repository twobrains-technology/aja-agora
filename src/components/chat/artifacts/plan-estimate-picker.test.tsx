// @vitest-environment happy-dom
/**
 * Camada 1 — "Planeje sua conquista" (passo 2, gate credit) na re-UX GUIADA POR
 * INTENÇÃO (handoff componentes-aja). O usuário escolhe o que mais importa
 * (menor parcela / receber rápido / tenho um lance) e só o controle relevante
 * aparece; a parcela é RESULTADO calmo. SELO de estimativa sempre visível (a Bevi
 * só simula pós-identify). Aderente à jornada canônica.
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
	credit: {
		id: "credit",
		label: "Valor do bem",
		format: "currency",
		min: 8_000,
		max: 80_000,
		step: 1_000,
		default: 25_000,
	},
	term: {
		id: "term",
		label: "Em quantos meses quer pagar",
		format: "months",
		min: 24,
		max: 80,
		step: 6,
		default: 60,
	},
	intentDefault: "parcela",
	targetMonthDefault: 6,
};

beforeEach(() => {
	sendAction.mockReset();
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("PlanEstimatePicker — re-UX guiada por intenção (handoff)", () => {
	it("renderiza valor do bem + segmented (3 intenções) + prazo + resultado calmo", () => {
		render(<PlanEstimatePicker payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).toContain("Quanto custa o que você quer?");
		expect(text).toContain("O que mais importa pra você agora?");
		expect(screen.getByTestId("plan-intent-parcela")).toBeDefined();
		expect(screen.getByTestId("plan-intent-rapido")).toBeDefined();
		expect(screen.getByTestId("plan-intent-lance")).toBeDefined();
		expect(text).toContain("Em quantos meses quer pagar");
		expect(text).toContain("Sua parcela fica em");
		expect(screen.getByTestId("plan-estimate")).toBeDefined();
	});

	it("SELO de estimativa SEMPRE visível (regra de produto)", () => {
		render(<PlanEstimatePicker payload={payload} />);
		expect(document.body.textContent).toMatch(
			/Estimativa de mercado — os valores reais vêm das administradoras/,
		);
	});

	it("intenção 'menor parcela' (default): sem mês-alvo e sem bloco de lance", () => {
		render(<PlanEstimatePicker payload={payload} />);
		expect(screen.queryByTestId("plan-target")).toBeNull();
		expect(screen.queryByTestId("plan-lance-block")).toBeNull();
	});

	it("intenção 'receber rápido' revela o mês-alvo de contemplação", () => {
		render(<PlanEstimatePicker payload={payload} />);
		fireEvent.click(screen.getByTestId("plan-intent-rapido"));
		expect(screen.getByTestId("plan-target")).toBeDefined();
		expect(document.body.textContent).toContain("Quero ser contemplado em até");
	});

	it("intenção 'tenho um lance' revela valor do lance + lance embutido", () => {
		render(<PlanEstimatePicker payload={payload} />);
		fireEvent.click(screen.getByTestId("plan-intent-lance"));
		expect(screen.getByTestId("plan-lance-block")).toBeDefined();
		expect(screen.getByTestId("plan-embutido")).toBeDefined();
		expect(document.body.textContent).toContain("Somar lance embutido");
	});

	it("submit envia credit + parcela CALCULADA + termMonths + intent (sem mês-alvo/lance)", () => {
		render(<PlanEstimatePicker payload={payload} />);
		fireEvent.click(screen.getByTestId("plan-submit"));
		expect(sendAction).toHaveBeenCalledTimes(1);
		const [action] = sendAction.mock.calls[0];
		expect(action.kind).toBe("gate");
		expect(action.gate).toBe("credit");
		expect(action.value.credit).toBe(25_000);
		expect(action.value.termMonths).toBe(60);
		expect(action.value.intent).toBe("parcela");
		// parcela é resultado calculado (total/prazo), não input
		expect(action.value.monthlyBudget).toBeGreaterThan(0);
		// intenção "parcela" não manda mês-alvo nem lance
		expect("targetMonth" in action.value).toBe(false);
		expect("lanceValue" in action.value).toBe(false);
	});

	it("submit na intenção 'tenho um lance' carrega lanceValue + lanceEmbutido", () => {
		render(<PlanEstimatePicker payload={payload} />);
		fireEvent.click(screen.getByTestId("plan-intent-lance"));
		fireEvent.click(screen.getByTestId("plan-embutido"));
		fireEvent.click(screen.getByTestId("plan-submit"));
		const [action] = sendAction.mock.calls[0];
		expect(action.value.intent).toBe("lance");
		expect(action.value.lanceEmbutido).toBe(true);
		expect("lanceValue" in action.value).toBe(true);
	});

	it("submit na intenção 'receber rápido' carrega o mês-alvo", () => {
		render(<PlanEstimatePicker payload={payload} />);
		fireEvent.click(screen.getByTestId("plan-intent-rapido"));
		fireEvent.click(screen.getByTestId("plan-submit"));
		const [action] = sendAction.mock.calls[0];
		expect(action.value.intent).toBe("rapido");
		expect(typeof action.value.targetMonth).toBe("number");
	});
});

// FIX-55 (Bernardo): o slider de valor do bem só aceitava múltiplos do step,
// forçando arredondamento. Agora há um input numérico livre ao lado do slider
// — o usuário digita o valor exato (R$ 37.500) e ele sobrevive (sem snap).
describe("FIX-55 — input numérico livre no valor do bem aceita número quebrado", () => {
	it("renderiza um input numérico editável para o valor do bem", () => {
		render(<PlanEstimatePicker payload={payload} />);
		const input = screen.getByTestId("plan-asset-input") as HTMLInputElement;
		expect(input).toBeDefined();
		expect(input.inputMode).toBe("numeric");
	});

	it("digitar valor quebrado propaga no submit sem re-quantizar para múltiplo de 10k", () => {
		render(<PlanEstimatePicker payload={payload} />);
		const input = screen.getByTestId("plan-asset-input");
		fireEvent.change(input, { target: { value: "37500" } });
		fireEvent.blur(input);
		fireEvent.click(screen.getByTestId("plan-submit"));
		const [action] = sendAction.mock.calls[0];
		expect(action.value.credit).toBe(37_500);
		expect(action.value.credit % 10_000).not.toBe(0);
	});

	it("input clampa ao teto da categoria quando acima do max (guardrail)", () => {
		render(<PlanEstimatePicker payload={payload} />);
		const input = screen.getByTestId("plan-asset-input");
		// payload.credit.max = 80_000 (moto)
		fireEvent.change(input, { target: { value: "999999" } });
		fireEvent.blur(input);
		fireEvent.click(screen.getByTestId("plan-submit"));
		const [action] = sendAction.mock.calls[0];
		expect(action.value.credit).toBe(payload.credit.max);
	});

	it("input aceita dígitos com separadores e extrai o número (R$ 37.500 → 37500)", () => {
		render(<PlanEstimatePicker payload={payload} />);
		const input = screen.getByTestId("plan-asset-input");
		fireEvent.change(input, { target: { value: "R$ 37.500" } });
		fireEvent.blur(input);
		fireEvent.click(screen.getByTestId("plan-submit"));
		const [action] = sendAction.mock.calls[0];
		expect(action.value.credit).toBe(37_500);
	});
});

describe("QA-crítico P2 — lance clampa quando o valor do bem diminui", () => {
	it("clampLanceToAsset rebaixa o lance pro teto de 80% do bem (fonte única da regra)", async () => {
		const { clampLanceToAsset } = await import("@/lib/consorcio/plan-estimate");
		expect(clampLanceToAsset(20_000, 8_000)).toBe(6_400);
		expect(clampLanceToAsset(4_000, 20_000)).toBe(4_000);
		expect(clampLanceToAsset(-5, 20_000)).toBe(0);
	});

	it("componente deriva o lance efetivo via clampLanceToAsset (acoplamento)", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/components/chat/artifacts/plan-estimate-picker.tsx", "utf-8");
		expect(src).toMatch(/clampLanceToAsset\(lanceValueRaw, assetValue\)/);
	});
});
