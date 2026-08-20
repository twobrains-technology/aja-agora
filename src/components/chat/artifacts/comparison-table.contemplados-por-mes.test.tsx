// @vitest-environment happy-dom
/**
 * P1 do PRD (19/08/2026) — OS CARDS PASSAM A MOSTRAR O QUE O AGENTE DIZ QUE
 * ELES MOSTRAM.
 *
 * Turno 22 da conversa da Rute: "Os cards mostram a taxa média de contemplação
 * por assembleia de cada administradora." A tabela de comparação não renderiza
 * nada de contemplação — zero ocorrências, verificado. O agente afirmou algo
 * falso sobre a própria interface porque não tinha o dado e precisava dizer
 * alguma coisa.
 *
 * Agora o dado aparece na tela, com o rótulo que o resto do produto já usa
 * ("Contemplados/mês", como no `group-card` e no `recommendation-card`), e é
 * contagem real — nunca percentual, nunca "taxa".
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComparisonTablePayload } from "@/lib/chat/types";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

const { ComparisonTable } = await import("./comparison-table");

const payload: ComparisonTablePayload = {
	groups: [
		{
			id: "bb-217",
			administradora: "BANCO DO BRASIL",
			category: "imovel",
			creditValue: 499_634,
			monthlyPayment: 3_031,
			adminFeePercent: 18,
			termMonths: 217,
			availableSlots: 15,
		},
		{
			id: "ita-147",
			administradora: "ITAÚ",
			category: "imovel",
			creditValue: 524_580,
			monthlyPayment: 4_519,
			adminFeePercent: 19,
			termMonths: 147,
			availableSlots: 4,
		},
	],
};

describe("comparativo mostra contemplados por mês", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("cada cota exibe a contagem real de contemplados por mês", () => {
		render(<ComparisonTable payload={payload} />);
		expect(screen.getByTestId("comparison-chip-contemplados-bb-217").textContent).toContain("15");
		expect(screen.getByTestId("comparison-chip-contemplados-ita-147").textContent).toContain("4");
	});

	it("o rótulo é de CONTAGEM, nunca de taxa/percentual", () => {
		render(<ComparisonTable payload={payload} />);
		const chip = screen.getByTestId("comparison-chip-contemplados-bb-217");
		expect(chip.textContent?.toLowerCase()).toContain("contemplados");
		expect(chip.textContent).not.toContain("%");
		expect(chip.textContent?.toLowerCase()).not.toContain("taxa");
	});

	it("cota sem o dado não mostra linha nenhuma — nunca inventa 0", () => {
		render(
			<ComparisonTable
				payload={{ groups: [{ ...payload.groups[0], availableSlots: 0 }, payload.groups[1]] }}
			/>,
		);
		expect(screen.queryByTestId("comparison-chip-contemplados-bb-217")).toBeNull();
		expect(screen.getByTestId("comparison-chip-contemplados-ita-147")).toBeTruthy();
	});
});
