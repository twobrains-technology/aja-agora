// @vitest-environment happy-dom
/**
 * FIX-231 (nível 3 com bloco-motor-calculo, docs/05-compliance-e-dados.md):
 * `likelihood` (heurística de 3 faixas alta/média/baixa) é um palpite sem
 * dado que o sustente — o motor (bloco-motor-calculo) remove o campo do
 * output de computeContemplationDial. Este bloco garante que o COMPONENTE
 * para de CONSUMIR o campo (não depende dele pra renderizar, e não mostra
 * mais o "medidor de chance").
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContemplationDialPayload } from "@/lib/chat/types";
import { ContemplationDial } from "./contemplation-dial";

const payload: ContemplationDialPayload = {
	administradora: "ÂNCORA",
	category: "auto",
	creditValue: 100_000,
	termMonths: 80,
	monthlyPayment: 1_500,
	initialTargetMonth: 20,
};

describe("ContemplationDial — para de consumir likelihood (FIX-231)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("renderiza normalmente mesmo se o motor não trouxer 'likelihood' no resultado", () => {
		// Simula o output pós-motor (bloco-motor-calculo remove o campo):
		// o componente não pode quebrar nem depender dele.
		render(<ContemplationDial payload={payload} />);
		expect(screen.getByText(/quando voc[êe] quer ser contemplado/i)).toBeTruthy();
	});

	it("não mostra mais o medidor de chance de contemplação", () => {
		render(<ContemplationDial payload={payload} />);
		expect(screen.queryByText(/chance de contemplação/i)).toBeNull();
	});

	it("mantém o disclaimer CDC como rodapé fixo (não tooltip)", () => {
		render(<ContemplationDial payload={payload} />);
		expect(screen.getByTestId("dial-disclaimer")).toBeTruthy();
	});
});
