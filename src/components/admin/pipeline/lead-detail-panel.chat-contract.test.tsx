// @vitest-environment happy-dom
/**
 * REV-C (auditoria adversarial 2026-06-28) — BUG de contrato de shape no chat do
 * operador (FIX-87). Dois defeitos no lead-detail-panel.tsx:
 *
 *  1. Ao enviar mensagem, o componente passava o `lead.id` (id do LEAD) como
 *     `conversationId` na URL e no body de POST /api/admin/conversations/[id]/message.
 *     Mas o id da CONVERSA é `lead.conversationId` (campo distinto no card — lead-card.tsx:12).
 *     Resultado: a janela de 24h e a persistência batiam na conversa ERRADA (ou inexistente).
 *
 *  2. No erro, lia `data.error?.message`, mas a rota retorna `{ error: string, message: string }`
 *     (route.ts: `{ error: "WindowClosed", message: "A janela ... está fechada ..." }`). Como
 *     `data.error` é string, `data.error?.message` era sempre undefined → o operador via o
 *     fallback genérico "Falha ao enviar mensagem" em vez do motivo real.
 *
 * Regressão determinística do contrato UI×API — o tipo de bug nº1 desta área.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "./lead-card";
import { LeadDetailPanel } from "./lead-detail-panel";

const LEAD: Lead = {
	id: "lead-aaaa",
	conversationId: "conv-bbbb",
	contactId: null,
	name: "Fulano",
	phone: "62999998888",
	email: null,
	stage: "engajado",
	creditValue: null,
	createdAt: new Date("2026-06-01T12:00:00Z").toISOString(),
	updatedAt: new Date("2026-06-01T12:00:00Z").toISOString(),
	conversation: {
		channel: "whatsapp",
		createdAt: new Date("2026-06-01T12:00:00Z").toISOString(),
		updatedAt: new Date("2026-06-01T12:00:00Z").toISOString(),
	},
};

type Captured = { url: string; body: unknown };

function installFetchMock(messageResponse: {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
}) {
	const calls: Captured[] = [];
	global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/message")) {
			calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
			return messageResponse as unknown as Response;
		}
		// ConversationTimeline e demais consumidores: resposta inócua.
		return {
			ok: true,
			status: 200,
			json: async () => ({ messages: [] }),
		} as unknown as Response;
	}) as unknown as typeof fetch;
	return calls;
}

describe("LeadDetailPanel — contrato do chat do operador (FIX-87)", () => {
	beforeEach(() => {
		// happy-dom não implementa alert(); o componente o chama no fluxo de envio.
		vi.stubGlobal("alert", vi.fn());
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	async function typeAndSend(text: string) {
		const textarea = await screen.findByPlaceholderText(/Digite sua mensagem para o cliente/i);
		fireEvent.change(textarea, { target: { value: text } });
		const sendBtn = screen.getByRole("button", { name: /Enviar/i });
		fireEvent.click(sendBtn);
	}

	it("envia conversationId = lead.conversationId (NÃO lead.id) na URL e no body", async () => {
		const calls = installFetchMock({
			ok: true,
			status: 200,
			json: async () => ({ success: true, messageId: "wamid.OK" }),
		});

		render(<LeadDetailPanel lead={LEAD} open onClose={() => {}} />);
		await typeAndSend("Olá, tudo bem?");

		await waitFor(() => expect(calls.length).toBe(1));
		const call = calls[0];
		expect((call.body as { conversationId: string }).conversationId).toBe(LEAD.conversationId);
		expect((call.body as { conversationId: string }).conversationId).not.toBe(LEAD.id);
		expect(call.url).toContain(LEAD.conversationId);
		expect(call.url).not.toContain(`/conversations/${LEAD.id}/`);
	});

	it("exibe a mensagem real do erro da API (data.message), não o fallback genérico", async () => {
		const REAL_MSG = "A janela de 24h do WhatsApp está fechada. Envie um template HSM para reabrir a conversa.";
		installFetchMock({
			ok: false,
			status: 429,
			json: async () => ({ error: "WindowClosed", message: REAL_MSG }),
		});

		render(<LeadDetailPanel lead={LEAD} open onClose={() => {}} />);
		await typeAndSend("mensagem fora da janela");

		expect(await screen.findByText(REAL_MSG)).toBeTruthy();
		expect(screen.queryByText("Falha ao enviar mensagem")).toBeNull();
	});
});
