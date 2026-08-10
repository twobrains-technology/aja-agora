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

	// 2026-08-10 — decisão do Kairo: escolher template deixou de ser trabalho do
	// atendente. Ele digita e manda; se a janela estiver fechada, o sistema
	// dispara o template de retomada SOZINHO. O seletor manual continua vivo,
	// mas só como plano B — quando não há nenhum template aprovado pra disparar.
	it("texto → 429 → o template de retomada sai SOZINHO, sem seletor", async () => {
		const fetchMock = installFetch();
		render(<ClientChatBox conversationId="conv-1" />);
		fireEvent.change(screen.getByPlaceholderText(/digite sua mensagem para o cliente/i), {
			target: { value: "oi" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

		// O POST do template acontece sem ninguém escolher nada.
		await waitFor(() => {
			const call = fetchMock.mock.calls.find(
				(c) => String(c[0]).includes("/message") && bodyOf(c[1] as RequestInit).templateName,
			);
			expect(call).toBeTruthy();
			const body = bodyOf(call?.[1] as RequestInit);
			// Só há um APPROVED no mock → é ele que vai (o PENDING nunca).
			expect(body.templateName).toBe("aja_reengajamento");
			expect(body.languageCode).toBe("pt_BR");
		});

		// E o atendente é avisado do que aconteceu com a mensagem dele.
		expect(await screen.findByText(/enviei um contato de retomada/i)).toBeTruthy();
		// Nada de seletor: o caminho automático resolveu.
		expect(screen.queryByRole("button", { name: "Enviar template" })).toBeNull();
	});

	it("a mensagem digitada NÃO é perdida — ela ainda não foi entregue", async () => {
		installFetch();
		render(<ClientChatBox conversationId="conv-1" />);
		const campo = screen.getByPlaceholderText(/digite sua mensagem para o cliente/i);
		fireEvent.change(campo, { target: { value: "preciso de um documento seu" } });
		fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

		await screen.findByText(/enviei um contato de retomada/i);
		// Limpar o campo faria o atendente achar que o cliente recebeu o texto.
		expect((campo as HTMLTextAreaElement).value).toBe("preciso de um documento seu");
	});

	it("sem NENHUM template aprovado, cai no seletor manual e explica a situação", async () => {
		// Só PENDING: não há o que disparar automaticamente.
		global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			if (String(url).includes("/whatsapp/templates")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						templates: [
							{
								id: "t2",
								metaName: "rascunho",
								language: "pt_BR",
								status: "PENDING",
								bodyPreview: "x",
							},
						],
					}),
				} as unknown as Response;
			}
			if (String(url).includes("/message") && bodyOf(init).text) {
				return {
					ok: false,
					status: 429,
					json: async () => ({ error: "WindowClosed", message: "janela fechada" }),
				} as unknown as Response;
			}
			return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
		}) as unknown as typeof fetch;

		render(<ClientChatBox conversationId="conv-1" />);
		fireEvent.change(screen.getByPlaceholderText(/digite sua mensagem para o cliente/i), {
			target: { value: "oi" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

		expect(await screen.findByRole("button", { name: "Enviar template" })).toBeTruthy();
		expect(await screen.findByText(/aprovado pela Meta/i)).toBeTruthy();
	});
});
