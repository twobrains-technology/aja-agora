// @vitest-environment happy-dom
/**
 * FIX-50 — o card do contato hierarquiza o PRESENTE: badge "Atual" só na proposta
 * vigente; selo "Em andamento" só nas mensagens da conversa ativa. Sem isso, o
 * comercial vê N propostas/conversas iguais sem saber "onde o cliente está agora".
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactDetailPanel } from "./contact-detail-panel";

const DETAIL = {
	contact: { id: "ct1", name: "Helena", phone: "62999990000", cpf: null, email: null },
	channels: ["web"],
	currentStage: "proposta_enviada",
	conversationCount: 2,
	currentProposalId: "p-vigente",
	activeConversationId: "conv-ativa",
	timeline: [
		{
			id: "m-encerrada",
			conversationId: "conv-encerrada",
			channel: "web",
			conversationStatus: "closed",
			role: "user",
			content: "mensagem da conversa encerrada",
			createdAt: "2026-06-15T09:00:00Z",
		},
		{
			id: "m-ativa",
			conversationId: "conv-ativa",
			channel: "web",
			conversationStatus: "active",
			role: "user",
			content: "mensagem da conversa em andamento",
			createdAt: "2026-06-15T10:00:00Z",
		},
	],
	proposals: [
		{
			id: "p-superada",
			proposalId: "BV-1",
			administradora: "ANCORA",
			creditValue: "50000",
			monthlyPayment: "800",
			proposalStatus: "simulacao",
			consortiumProposalLink: null,
		},
		{
			id: "p-vigente",
			proposalId: "BV-2",
			administradora: "CANOPUS",
			creditValue: "60000",
			monthlyPayment: "900",
			proposalStatus: "documentos",
			consortiumProposalLink: null,
		},
	],
	stageHistory: [],
};

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(DETAIL) }),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("FIX-50 — ContactDetailPanel hierarquiza o presente", () => {
	it("selo 'Em andamento' só na mensagem da conversa ativa (timeline é o tab default)", async () => {
		render(<ContactDetailPanel contactId="ct1" open onClose={() => {}} />);
		await waitFor(() =>
			expect(screen.getByText("mensagem da conversa em andamento")).toBeDefined(),
		);
		const selos = screen.getAllByTestId("conversation-active-badge");
		expect(selos.length).toBe(1);
	});

	it("badge 'Atual' só na proposta vigente (aba Propostas)", async () => {
		render(<ContactDetailPanel contactId="ct1" open onClose={() => {}} />);
		await waitFor(() => expect(screen.getByRole("tab", { name: /Propostas/i })).toBeDefined());
		fireEvent.click(screen.getByRole("tab", { name: /Propostas/i }));
		await waitFor(() => expect(screen.getByText("CANOPUS")).toBeDefined());
		const badges = screen.getAllByTestId("proposal-current-badge");
		expect(badges.length).toBe(1);
		// o badge "Atual" pertence ao item da proposta vigente (CANOPUS / p-vigente)
		const vigente = screen.getByTestId("proposal-item-p-vigente");
		expect(vigente.textContent).toContain("Atual");
		const superada = screen.getByTestId("proposal-item-p-superada");
		expect(superada.textContent).not.toContain("Atual");
	});
});
