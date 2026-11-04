// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { turnoVazio } from "@/lib/playground/simulacao/ler-turno";
import type { TurnoDaSimulacao } from "@/lib/playground/simulacao/tipos";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendUserMessage: vi.fn(),
		sendAction: vi.fn(),
		status: "ready" as const,
		messages: [],
	}),
}));

import { Transcricao } from "./transcricao";

afterEach(cleanup);

const GROUPS = [1, 2, 3, 4].map((n) => ({
	id: `g${n}`,
	administradora: `ADM ${n}`,
	category: "auto" as const,
	creditValue: 60_000,
	monthlyPayment: 1_200,
	adminFeePercent: 18,
	termMonths: 80,
	availableSlots: 3,
}));

describe("Transcricao", () => {
	it("renderiza comparison_table com os selos Vendedor e Cliente (IA)", () => {
		const turno: TurnoDaSimulacao = {
			indice: 0,
			cliente: { texto: "quero um carro", origem: "semente" },
			vendedor: {
				...turnoVazio(),
				baloesFinais: [
					{ texto: "Veja as opções.", promessa: { rotulo: "contemplação", motivo: "x" } },
				],
				artifacts: [
					{ artifactType: "comparison_table", payload: { groups: GROUPS }, toolCallId: "t" },
				],
			},
			duracaoMs: 10,
		};
		render(<Transcricao turnos={[turno]} />);
		expect(screen.getByText(/^Vendedor/)).toBeTruthy();
		expect(screen.getByText(/Cliente \(IA\)/)).toBeTruthy();
		expect(screen.getByText(/PROMESSA DE CONTEMPLAÇÃO/)).toBeTruthy();
		expect(screen.getByTestId("carrossel-cartas")).toBeTruthy();
	});
});
