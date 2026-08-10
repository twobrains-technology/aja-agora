// @vitest-environment happy-dom
/**
 * Teclado do campo de mensagem — o do WhatsApp (pedido do Kairo, 2026-08-10).
 *
 * Enter envia, Shift+Enter quebra linha. Quem atende digita o dia inteiro; tirar
 * a mão do teclado pra clicar em "Enviar" custa em toda mensagem.
 *
 * O caso do IME não é preciosismo: em teclado com composição (acento, emoji,
 * japonês) o Enter CONFIRMA a palavra que está sendo composta. Enviar nesse Enter
 * corta a mensagem no meio da palavra — e em português, com acento em quase toda
 * frase, isso apareceria no primeiro dia de uso.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientChatBox } from "./client-chat-box";

const CONVERSA = "11111111-2222-3333-4444-555555555555";

interface Chamada {
	url: string;
	body: Record<string, unknown>;
}

function installFetch(): Chamada[] {
	const calls: Chamada[] = [];
	global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
		// A lista de templates é consultada quando a janela fecha — não conta.
		if (String(url).includes("/whatsapp/templates")) {
			return {
				ok: true,
				status: 200,
				json: async () => ({ templates: [] }),
			} as unknown as Response;
		}
		calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
		return {
			ok: true,
			status: 200,
			json: async () => ({ success: true, type: "text", messageId: "m1" }),
		} as unknown as Response;
	}) as unknown as typeof fetch;
	return calls;
}

function campo() {
	return screen.getByPlaceholderText(/digite sua mensagem para o cliente/i);
}

beforeEach(() => {
	document.body.innerHTML = "";
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("teclado do chat do atendente", () => {
	it("Enter envia a mensagem", async () => {
		const calls = installFetch();
		render(<ClientChatBox conversationId={CONVERSA} />);

		fireEvent.change(campo(), { target: { value: "boa, bora falar" } });
		fireEvent.keyDown(campo(), { key: "Enter" });

		await waitFor(() => expect(calls.length).toBe(1));
		expect(calls[0].body.text).toBe("boa, bora falar");
	});

	it("Shift+Enter NÃO envia — é quebra de linha", async () => {
		const calls = installFetch();
		render(<ClientChatBox conversationId={CONVERSA} />);

		fireEvent.change(campo(), { target: { value: "primeira linha" } });
		fireEvent.keyDown(campo(), { key: "Enter", shiftKey: true });

		// Espera de verdade: um envio indevido levaria alguns ticks pra aparecer.
		await new Promise((r) => setTimeout(r, 30));
		expect(calls.length).toBe(0);
	});

	it("Enter que fecha composição de acento não envia pela metade", async () => {
		const calls = installFetch();
		render(<ClientChatBox conversationId={CONVERSA} />);

		fireEvent.change(campo(), { target: { value: "vamos começ" } });
		fireEvent.keyDown(campo(), { key: "Enter", isComposing: true });

		await new Promise((r) => setTimeout(r, 30));
		expect(calls.length).toBe(0);
	});

	it("Enter com o campo vazio não dispara chamada nenhuma", async () => {
		const calls = installFetch();
		render(<ClientChatBox conversationId={CONVERSA} />);

		fireEvent.keyDown(campo(), { key: "Enter" });

		await new Promise((r) => setTimeout(r, 30));
		expect(calls.length).toBe(0);
	});

	it("só espaço em branco também não envia", async () => {
		const calls = installFetch();
		render(<ClientChatBox conversationId={CONVERSA} />);

		fireEvent.change(campo(), { target: { value: "   " } });
		fireEvent.keyDown(campo(), { key: "Enter" });

		await new Promise((r) => setTimeout(r, 30));
		expect(calls.length).toBe(0);
	});
});
