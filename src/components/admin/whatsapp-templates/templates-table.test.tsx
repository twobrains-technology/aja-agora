// @vitest-environment happy-dom
// Camada 1 (render) — FIX-205: a lista renderiza status como badge e expõe o
// motivo da rejeição. Roda em test:unit (happy-dom). fetch mockado (sem rede).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplatesTable } from "./templates-table";

const originalFetch = global.fetch;

afterEach(() => {
	cleanup();
	global.fetch = originalFetch;
	vi.restoreAllMocks();
});

function mockList(templates: unknown[]) {
	global.fetch = vi.fn(
		async () => new Response(JSON.stringify({ templates }), { status: 200 }),
	) as unknown as typeof global.fetch;
}

const rejected = {
	id: "1",
	usageKey: "confirmacao_contratacao",
	metaName: "aja_confirmacao_v1",
	language: "pt_BR",
	category: "UTILITY",
	components: [{ type: "BODY", text: "Olá {{1}}" }],
	bodyPreview: "Olá {{1}}",
	status: "REJECTED",
	metaTemplateId: "meta-1",
	rejectionReason: "Categoria incorreta para o conteúdo",
	submittedAt: null,
	approvedAt: null,
	createdAt: new Date(0).toISOString(),
};

describe("FIX-205 — TemplatesTable (render)", () => {
	it("renderiza status como badge, o usageKey e o motivo da rejeição", async () => {
		mockList([rejected]);
		render(<TemplatesTable />);

		expect(await screen.findByText("aja_confirmacao_v1")).toBeTruthy();
		// badge de status com rótulo PT-BR
		expect(screen.getByText("Rejeitado")).toBeTruthy();
		// motivo da rejeição visível
		expect(screen.getByText(/Categoria incorreta para o conteúdo/)).toBeTruthy();
		// vínculo de uso exibido
		expect(screen.getByText(/confirmacao_contratacao/)).toBeTruthy();
	});

	it("mostra estado vazio quando não há templates", async () => {
		mockList([]);
		render(<TemplatesTable />);
		expect(await screen.findByText(/Nenhum template cadastrado/)).toBeTruthy();
	});
});
