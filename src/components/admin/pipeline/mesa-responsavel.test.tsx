// @vitest-environment happy-dom
/**
 * Camada 1 — MesaResponsavel: bloco "Responsável pela mesa" (spec 2026-07-03). Mostra quem
 * assumiu, deixa REATRIBUIR a outro atendente (dropdown, exclui o dono atual e os inativos) e
 * ENCERRAR o atendimento. Render puro; as ações batem em /api/admin/mesa/handoffs/[id]/{reassign,close}.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MesaResponsavel } from "./mesa-responsavel";

const HANDOFF = {
	id: "h1",
	status: "em_andamento" as const,
	attendant: { id: "a1", nome: "Ana", whatsapp: "5562999990000" },
	since: "2026-07-03T12:00:00.000Z",
};

function installFetch() {
	const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
		if (String(url).includes("/mesa-attendants")) {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					mesaAttendants: [
						{ id: "a1", nome: "Ana", isActive: true },
						{ id: "b1", nome: "Bruno", isActive: true },
						{ id: "c1", nome: "Carlos", isActive: false },
					],
				}),
			} as unknown as Response;
		}
		return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
	});
	global.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

beforeEach(() => {
	document.body.innerHTML = "";
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("MesaResponsavel — visibilidade + reatribuir + encerrar", () => {
	it("mostra o responsável, o dropdown de reatribuição e o botão encerrar", async () => {
		installFetch();
		render(<MesaResponsavel activeHandoff={HANDOFF} />);
		expect(screen.getByText(/Responsável pela mesa/i)).toBeTruthy();
		expect(screen.getByText("Ana")).toBeTruthy();
		expect(await screen.findByRole("combobox", { name: /reatribuir/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /encerrar/i })).toBeTruthy();
	});

	it("o dropdown lista só ATIVOS e exclui o dono atual (Bruno sim; Ana=dono e Carlos=inativo não)", async () => {
		installFetch();
		render(<MesaResponsavel activeHandoff={HANDOFF} />);
		expect(await screen.findByRole("option", { name: "Bruno" })).toBeTruthy();
		expect(screen.queryByRole("option", { name: "Ana" })).toBeNull();
		expect(screen.queryByRole("option", { name: "Carlos" })).toBeNull();
	});

	it("reatribuir para Bruno → POST /reassign com o id dele", async () => {
		const fetchMock = installFetch();
		const onChanged = vi.fn();
		render(<MesaResponsavel activeHandoff={HANDOFF} onChanged={onChanged} />);
		const select = await screen.findByRole("combobox", { name: /reatribuir/i });
		await screen.findByRole("option", { name: "Bruno" });
		fireEvent.change(select, { target: { value: "b1" } });
		fireEvent.click(screen.getByRole("button", { name: "Reatribuir" }));
		await waitFor(() => {
			const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/reassign"));
			expect(call).toBeTruthy();
			expect(String(call?.[0])).toContain("/mesa/handoffs/h1/reassign");
			expect(JSON.parse(String((call?.[1] as RequestInit)?.body)).mesaAttendantId).toBe("b1");
		});
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	it("encerrar → POST /close no handoff", async () => {
		const fetchMock = installFetch();
		const onChanged = vi.fn();
		render(<MesaResponsavel activeHandoff={HANDOFF} onChanged={onChanged} />);
		fireEvent.click(screen.getByRole("button", { name: /encerrar/i }));
		await waitFor(() => {
			const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/close"));
			expect(call).toBeTruthy();
			expect(String(call?.[0])).toContain("/mesa/handoffs/h1/close");
		});
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
	});

	it("sem handoff ativo não renderiza nada", () => {
		installFetch();
		const { container } = render(<MesaResponsavel activeHandoff={null} />);
		expect(container.textContent).toBe("");
	});
});
