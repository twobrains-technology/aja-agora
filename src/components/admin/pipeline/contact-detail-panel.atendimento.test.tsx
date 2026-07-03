// @vitest-environment happy-dom
/**
 * Camada 1 — ContactDetailPanel expõe a aba "Atendimento" (transbordo + chat).
 *
 * Bug (inbox 2026-07-02): o botão "Transbordar para a mesa" e a caixa "Chat com o
 * cliente" (FIX-64/FIX-87) só viviam no LeadDetailPanel (lead anônimo). Para todo
 * lead com contato resolvido o kanban abre o ContactDetailPanel (visão consolidada
 * FIX-45), que NÃO portou nenhuma das duas ações — deixando o operador sem transbordo
 * manual e sem canal de mensagem ao cliente justamente nos leads que importam.
 *
 * Correção: uma aba "Atendimento" no ContactDetailPanel com o MesaTransbordoDialog +
 * a caixa de chat, alimentada por leadId/leadName/conversationId vindos do card
 * selecionado (kanban-board). Render React puro, sem LLM → só Camada 1 (sem cassette).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactDetailPanel } from "./contact-detail-panel";

const detailFixture = {
	contact: { id: "c1", name: "Mirella", phone: "5562999999999", cpf: null, email: null },
	channels: ["whatsapp"],
	currentStage: "na_administradora",
	conversationCount: 1,
	currentProposalId: null,
	activeConversationId: "conv-1",
	timeline: [],
	proposals: [],
	stageHistory: [],
};

beforeEach(() => {
	document.body.innerHTML = "";
	// happy-dom não implementa window.alert (o componente o usa como no FIX-87).
	vi.stubGlobal("alert", vi.fn());
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => detailFixture,
	}) as unknown as typeof fetch;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function renderPanel(overrides: Partial<Parameters<typeof ContactDetailPanel>[0]> = {}) {
	return render(
		<ContactDetailPanel
			contactId="c1"
			leadId="lead-1"
			leadName="Mirella"
			conversationId="conv-1"
			open
			onClose={() => {}}
			{...overrides}
		/>,
	);
}

describe("ContactDetailPanel — aba Atendimento (transbordo + chat)", () => {
	it("expõe a aba 'Atendimento'", async () => {
		renderPanel();
		expect(await screen.findByRole("tab", { name: "Atendimento" })).toBeTruthy();
	});

	it("na aba Atendimento mostra o botão 'Transbordar para a mesa'", async () => {
		renderPanel();
		fireEvent.click(await screen.findByRole("tab", { name: "Atendimento" }));
		expect(screen.getByRole("button", { name: /transbordar para a mesa/i })).toBeTruthy();
	});

	it("na aba Atendimento mostra a caixa 'Chat com o cliente' com textarea e botão Enviar", async () => {
		renderPanel();
		fireEvent.click(await screen.findByRole("tab", { name: "Atendimento" }));
		expect(screen.getByText("Chat com o cliente")).toBeTruthy();
		expect(screen.getByPlaceholderText(/digite sua mensagem para o cliente/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /enviar/i })).toBeTruthy();
	});

	it("enviar uma mensagem chama o endpoint da CONVERSA (não do lead)", async () => {
		const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
		renderPanel();
		fireEvent.click(await screen.findByRole("tab", { name: "Atendimento" }));
		fireEvent.change(screen.getByPlaceholderText(/digite sua mensagem para o cliente/i), {
			target: { value: "Olá, tudo certo com seus documentos?" },
		});
		// resposta do POST
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ messageId: "m1" }) });
		fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
		const called = fetchMock.mock.calls.map((c) => String(c[0]));
		expect(called.some((u) => u === "/api/admin/conversations/conv-1/message")).toBe(true);
	});
});

describe("kanban-board fia leadId/conversationId no ContactDetailPanel (wiring)", () => {
	const src = readFileSync(join(__dirname, "kanban-board.tsx"), "utf8");

	it("passa leadId e conversationId do card selecionado pro ContactDetailPanel", () => {
		// O bloco de render do ContactDetailPanel precisa receber o id do lead e da
		// conversa do card — sem isso, a aba Atendimento não consegue transbordar nem enviar.
		expect(src).toMatch(/leadId=\{selectedLead\??\.id\}/);
		expect(src).toMatch(/conversationId=\{selectedLead\??\.conversationId\}/);
	});
});
