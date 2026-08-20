// @vitest-environment happy-dom
/**
 * D7 (PRD 19/08/2026, conversa da Rute) — O BOTÃO NÃO É TROCADO DE LUGAR.
 *
 * Último turno da conversa que morreu:
 *
 *   [29] cliente clica "Ver cenários de contemplação"
 *   [30] agente: "Qual seria o valor do bem que você gostaria de simular…?"
 *
 * Não é alucinação. O card colapsava QUALQUER intenção diferente de
 * `compare_other` em `adjust-value`, e o servidor então emitia ao modelo uma
 * instrução dizendo, com todas as letras, que a usuária queria MUDAR o valor do
 * bem. O modelo obedeceu a um servidor que mentiu — com a simulação na tela.
 *
 * A ironia: `compute_scenarios` e `present_scenarios` já existiam no toolset. O
 * clique é que nunca chegava ao grafo.
 *
 * Duas regras aqui, e a segunda é a que impede a próxima variação do mesmo
 * defeito: intenção conhecida vai para o SEU handler; intenção desconhecida
 * nunca é traduzida para outra — ela entra como a fala do cliente ("Ver
 * cenários de contemplação"), que é o que ele de fato pediu.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulationResultPayload } from "@/lib/chat/types";

const chat = vi.hoisted(() => ({
	sendAction: vi.fn(),
	sendUserMessage: vi.fn(),
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ ...chat, status: "ready" }),
}));

const { SimulationResult } = await import("./simulation-result");

const base: SimulationResultPayload = {
	groupId: "grp-itau-147",
	administradora: "ITAÚ",
	category: "imovel",
	creditValue: 524_580,
	monthlyPayment: 4_519,
	adminFee: 90_000,
	reserveFund: 10_000,
	insurance: 2_000,
	totalCost: 626_580,
	termMonths: 147,
	effectiveRate: 22,
};

function renderCom(actions: Array<{ label: string; intent: string }>) {
	render(<SimulationResult payload={{ ...base, actions }} />);
}

describe("D7 — o clique chega ao grafo com a intenção que o cliente viu", () => {
	beforeEach(() => {
		chat.sendAction.mockClear();
		chat.sendUserMessage.mockClear();
		document.body.innerHTML = "";
	});

	it('"Ver cenários de contemplação" abre os CENÁRIOS — nunca o ajuste de valor', () => {
		renderCom([{ label: "Ver cenários de contemplação", intent: "view_scenarios" }]);
		fireEvent.click(screen.getByText("Ver cenários de contemplação"));

		expect(chat.sendAction).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "view-scenarios", groupId: "grp-itau-147" }),
			"Ver cenários de contemplação",
		);
		const kinds = chat.sendAction.mock.calls.map((c) => c[0].kind);
		expect(kinds).not.toContain("adjust-value");
	});

	it('"Comparar com financiamento" tem handler próprio', () => {
		renderCom([{ label: "Comparar com financiamento", intent: "compare_financing" }]);
		fireEvent.click(screen.getByText("Comparar com financiamento"));

		expect(chat.sendAction).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "compare-financing" }),
			"Comparar com financiamento",
		);
	});

	it("intenção desconhecida entra como a FALA do cliente, não como outra intenção", () => {
		renderCom([{ label: "Quero ver o regulamento do grupo", intent: "ver_regulamento" }]);
		fireEvent.click(screen.getByText("Quero ver o regulamento do grupo"));

		expect(chat.sendAction).not.toHaveBeenCalled();
		expect(chat.sendUserMessage).toHaveBeenCalledWith("Quero ver o regulamento do grupo");
	});

	it("ajustar valor e nova simulação seguem reabrindo o what-if (sem regressão)", () => {
		renderCom([
			{ label: "Ajustar valor", intent: "adjust_value" },
			{ label: "Nova simulação", intent: "new_simulation" },
		]);
		fireEvent.click(screen.getByText("Ajustar valor"));
		fireEvent.click(screen.getByText("Nova simulação"));

		const kinds = chat.sendAction.mock.calls.map((c) => c[0].kind);
		expect(kinds).toEqual(["adjust-value", "adjust-value"]);
	});

	it('"Comparar outra administradora" segue no surfacing determinístico', () => {
		renderCom([{ label: "Comparar outra adm", intent: "compare_other" }]);
		fireEvent.click(screen.getByText("Comparar outra adm"));
		expect(chat.sendAction).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "show-other-options" }),
			"Comparar outra adm",
		);
	});
});
