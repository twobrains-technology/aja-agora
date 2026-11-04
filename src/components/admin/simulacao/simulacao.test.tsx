// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendUserMessage: vi.fn(),
		sendAction: vi.fn(),
		status: "ready" as const,
		messages: [],
	}),
}));

const serializar = vi.hoisted(() => vi.fn(() => "{}"));
vi.mock("@/lib/playground/simulacao/relatorio", async (orig) => ({
	...(await orig<typeof import("@/lib/playground/simulacao/relatorio")>()),
	serializarExportacao: serializar,
}));

import { Simulacao } from "./simulacao";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	serializar.mockClear();
});

function fetchFalso() {
	let falas = 0;
	return vi.fn(async (url: string) => {
		if (String(url).includes("/simulacao/cliente")) {
			falas++;
			return new Response(
				JSON.stringify({
					texto: "oi",
					estado: falas > 1 ? "desiste" : "continua",
					origem: "semente",
				}),
			);
		}
		const linhas = [
			{ type: "inicio", conversationId: "11111111-1111-4111-8111-111111111111" },
			{ type: "evento", evento: { type: "text-delta", text: "Claro." } },
			{ type: "final", baloes: [{ texto: "Claro." }] },
		];
		return new Response(linhas.map((l) => JSON.stringify(l)).join("\n"));
	});
}

describe("Simulacao", () => {
	it("Rodar este: Em andamento e depois Concluído; Exportar JSON serializa", async () => {
		vi.stubGlobal("fetch", fetchFalso());
		vi.stubGlobal(
			"URL",
			Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
		);
		render(<Simulacao />);
		fireEvent.click(screen.getByLabelText("Rodar este: Objeção"));
		await screen.findByText(/Estado: Em andamento/);
		await screen.findByText(/Estado: Concluído/);
		await waitFor(() =>
			expect((screen.getByText("Exportar JSON") as HTMLButtonElement).disabled).toBe(false),
		);
		fireEvent.click(screen.getByText("Exportar JSON"));
		expect(serializar).toHaveBeenCalledTimes(1);
	});
});
