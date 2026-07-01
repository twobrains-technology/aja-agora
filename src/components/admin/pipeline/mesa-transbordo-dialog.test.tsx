// @vitest-environment happy-dom
/**
 * FIX-124 (D15) — o dialog de transbordo deixou de ser single-select. Antes o admin
 * escolhia UM atendente (e havia um bug de shape lendo `data.attendants` em vez de
 * `data.mesaAttendants`). Agora o caso vai por BROADCAST a TODOS os atendentes com botão
 * "Vou atender" — o dialog só CONFIRMA o transbordo e faz POST com body vazio (sem
 * mesaAttendantId). Este teste congela o novo contrato dialog↔API (memória
 * project_transbordo_kanban_contrato_shape) e garante que o single-select não voltou.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MesaTransbordoDialog } from "./mesa-transbordo-dialog";

describe("MesaTransbordoDialog — transbordo por broadcast (FIX-124)", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn(async () => ({
			ok: true,
			status: 201,
			json: async () => ({ handoff: { id: "h-1" } }),
		}));
		global.fetch = fetchMock as unknown as typeof fetch;
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("não tem mais seleção de atendente — mostra o modelo de broadcast", () => {
		render(<MesaTransbordoDialog leadId="lead-1" leadName="Fulano" open onOpenChange={() => {}} />);
		// Sem select nem mensagem de "nenhum atendente"; a cópia explica o "Vou atender".
		expect(screen.queryByText(/Selecione um atendente/i)).toBeNull();
		expect(screen.queryByText(/Nenhum atendente de mesa ativo/i)).toBeNull();
		expect(screen.queryByText(/Vou atender/i)).not.toBeNull();
	});

	it("confirmar → POST /transbordo com body VAZIO (sem mesaAttendantId)", async () => {
		render(<MesaTransbordoDialog leadId="lead-42" leadName="Fulano" open onOpenChange={() => {}} />);

		fireEvent.click(screen.getByRole("button", { name: /Transbordar para a mesa/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/admin/leads/lead-42/transbordo");
		expect(init.method).toBe("POST");
		const body = JSON.parse(String(init.body));
		expect(body).not.toHaveProperty("mesaAttendantId");
	});

	it("handoff ativo (409) → mensagem amigável, dialog não fecha", async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			status: 409,
			json: async () => ({ error: "handoff_ativo_existe", handoffId: "h-1" }),
		});
		const onOpenChange = vi.fn();
		render(
			<MesaTransbordoDialog leadId="lead-1" leadName="Fulano" open onOpenChange={onOpenChange} />,
		);

		fireEvent.click(screen.getByRole("button", { name: /Transbordar para a mesa/i }));

		await screen.findByText(/já tem um transbordo ativo na mesa/i);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});
});
