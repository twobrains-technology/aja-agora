// @vitest-environment happy-dom
/**
 * Camada 1 — ClientChatBox: quando a janela de 24h fecha, o operador precisa poder
 * ENVIAR UM TEMPLATE HSM dali mesmo (não só ver o erro). Fluxo: texto → 429 WindowClosed
 * → box troca pro modo template (lista só os APPROVED via GET /api/admin/whatsapp/templates)
 * → "Enviar template" faz POST {templateName, languageCode} na rota de mensagem. Render puro.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientChatBox } from "./client-chat-box";

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
	try {
		return JSON.parse(String(init?.body ?? "{}"));
	} catch {
		return {};
	}
}

function installFetch() {
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		if (String(url).includes("/whatsapp/templates")) {
			return {
				ok: true,
				status: 200,
				json: async () => ({
					templates: [
						{
							id: "t1",
							metaName: "aja_reengajamento",
							language: "pt_BR",
							status: "APPROVED",
							bodyPreview: "Olá! Podemos continuar seu cadastro?",
						},
						{
							id: "t2",
							metaName: "rascunho_pendente",
							language: "pt_BR",
							status: "PENDING",
							bodyPreview: "x",
						},
					],
				}),
			} as unknown as Response;
		}
		if (String(url).includes("/message")) {
			const body = bodyOf(init);
			if (body.text) {
				return {
					ok: false,
					status: 429,
					json: async () => ({
						error: "WindowClosed",
						message:
							"A janela de 24h do WhatsApp está fechada. Envie um template HSM para reabrir a conversa.",
					}),
				} as unknown as Response;
			}
			return {
				ok: true,
				status: 200,
				json: async () => ({ success: true, type: "template", messageId: "m1" }),
			} as unknown as Response;
		}
		return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
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

describe("ClientChatBox — envio de template quando a janela de 24h está fechada", () => {
	it("modo texto por padrão: textarea + botão Enviar", () => {
		installFetch();
		render(<ClientChatBox conversationId="conv-1" />);
		expect(screen.getByPlaceholderText(/digite sua mensagem para o cliente/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Enviar" })).toBeTruthy();
	});

	it("texto → 429 WindowClosed → troca pro modo template listando só os APPROVED", async () => {
		installFetch();
		render(<ClientChatBox conversationId="conv-1" />);
		fireEvent.change(screen.getByPlaceholderText(/digite sua mensagem para o cliente/i), {
			target: { value: "oi" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

		// aparece o seletor de template + botão de enviar template
		const select = await screen.findByRole("combobox", { name: /template/i });
		expect(select).toBeTruthy();
		expect(screen.getByRole("button", { name: "Enviar template" })).toBeTruthy();
		// só o APPROVED vira opção (carrega async após o 429); o PENDING não
		expect(await screen.findByRole("option", { name: /aja_reengajamento/i })).toBeTruthy();
		expect(screen.queryByRole("option", { name: /rascunho_pendente/i })).toBeNull();
	});

	it("selecionar um template e enviar → POST {templateName, languageCode} na rota de mensagem", async () => {
		const fetchMock = installFetch();
		render(<ClientChatBox conversationId="conv-1" />);
		fireEvent.change(screen.getByPlaceholderText(/digite sua mensagem para o cliente/i), {
			target: { value: "oi" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

		const select = await screen.findByRole("combobox", { name: /template/i });
		await screen.findByRole("option", { name: /aja_reengajamento/i });
		fireEvent.change(select, { target: { value: "t1" } });
		fireEvent.click(screen.getByRole("button", { name: "Enviar template" }));

		await waitFor(() => {
			const call = fetchMock.mock.calls.find(
				(c) => String(c[0]).includes("/message") && bodyOf(c[1] as RequestInit).templateName,
			);
			expect(call).toBeTruthy();
			const body = bodyOf(call?.[1] as RequestInit);
			expect(body.templateName).toBe("aja_reengajamento");
			expect(body.languageCode).toBe("pt_BR");
		});
	});
});
