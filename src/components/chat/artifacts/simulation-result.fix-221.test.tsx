// @vitest-environment happy-dom
/**
 * FIX-221 (Ata 2026-07-04, item 4.2): "Deixar claro que usar lance embutido =
 * receber menos dinheiro da carta." O bloco "Com lance embutido" já mostrava
 * "Valor que você recebe" (o número), mas faltava o ENUNCIADO explícito.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulationResultPayload } from "@/lib/chat/types";
import { SimulationResult } from "./simulation-result";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

const basePayload: SimulationResultPayload = {
	groupId: "grp-1",
	administradora: "Rodobens",
	category: "imovel",
	creditValue: 80_000,
	monthlyPayment: 1_500,
	adminFee: 14_400,
	reserveFund: 3_000,
	insurance: 4_000,
	totalCost: 101_400,
	termMonths: 80,
	effectiveRate: 26.75,
};

describe("FIX-221 — enunciado 'recebe menos' explícito no lance embutido", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("com embutido coerente (recebido < carta): enuncia explicitamente que recebe MENOS", () => {
		render(
			<SimulationResult
				payload={{
					...basePayload,
					embeddedBid: {
						percent: 30,
						embeddedBidValue: 24_000,
						receivedCredit: 56_000,
						necessaryBidToContemplate: 34_520,
					},
				}}
			/>,
		);
		expect(screen.getByText(/recebe menos/i)).toBeTruthy();
	});

	it("sem embeddedBid: nenhum enunciado de 'recebe menos' aparece (nada a comparar)", () => {
		render(<SimulationResult payload={basePayload} />);
		expect(screen.queryByText(/recebe menos/i)).toBeNull();
	});
});
