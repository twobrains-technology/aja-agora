// @vitest-environment happy-dom
/**
 * A3-UI (QA noturno 2026-06-22) — BUG: o dialog de transbordo do kanban NUNCA listava
 * atendentes. A API GET /api/admin/mesa-attendants devolve `{ mesaAttendants: [...] }`
 * (src/app/api/admin/mesa-attendants/route.ts:14; a tabela em mesa-attendants-table.tsx
 * lê `data.mesaAttendants`). Mas o dialog lia `data.attendants` (chave inexistente) →
 * `?? []` → lista sempre vazia → "Nenhum atendente de mesa ativo cadastrado" mesmo com
 * atendentes ativos. Resultado: o admin NÃO conseguia transbordar pelo kanban.
 *
 * Regressão determinística do contrato de shape entre o endpoint (bloco A) e o dialog
 * (bloco B) — os integration tests cobriam cada lado isolado, nunca o shape entre eles.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MesaTransbordoDialog } from "./mesa-transbordo-dialog";

const ATIVO = {
	id: "att-1",
	nome: "Operador Teste",
	whatsapp: "5562988887777",
	isActive: true,
};

describe("MesaTransbordoDialog — parse da resposta da API de atendentes", () => {
	beforeEach(() => {
		// Contrato REAL do endpoint: { mesaAttendants: [...] }.
		global.fetch = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ mesaAttendants: [ATIVO] }),
		})) as unknown as typeof fetch;
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("lista o atendente ativo quando a API devolve { mesaAttendants } (não exibe 'Nenhum atendente')", async () => {
		render(<MesaTransbordoDialog leadId="lead-1" leadName="Fulano" open onOpenChange={() => {}} />);

		// Espera o fetch resolver: o placeholder do select sai de "Carregando…" pra "Selecione…".
		await screen.findByText("Selecione um atendente");

		// BUG: lendo a chave errada, a lista ficava vazia e esta mensagem aparecia.
		expect(screen.queryByText(/Nenhum atendente de mesa ativo cadastrado/i)).toBeNull();
	});
});
