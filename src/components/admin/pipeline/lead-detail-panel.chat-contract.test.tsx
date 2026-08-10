// @vitest-environment happy-dom
/**
 * REV-C (auditoria adversarial 2026-06-28) — BUG de contrato de shape no chat do
 * operador (FIX-87). Dois defeitos originais:
 *
 *  1. Ao enviar mensagem, passava o `lead.id` (id do LEAD) como `conversationId`
 *     na URL e no body de POST /api/admin/conversations/[id]/message. O id da
 *     CONVERSA é outro campo. Resultado: a janela de 24h e a persistência batiam
 *     na conversa ERRADA (ou inexistente).
 *
 *  2. No erro, lia `data.error?.message`, mas a rota devolve
 *     `{ error: string, message: string }`. Como `data.error` é string,
 *     `data.error?.message` era sempre undefined → o operador via o fallback
 *     genérico em vez do motivo real.
 *
 * 2026-08-10 — o chat saiu do rodapé do LeadDetailPanel e passou a viver no
 * modal de atendimento, sempre pelo `ClientChatBox`. Os dois invariantes acima
 * continuam valendo — mudou só ONDE se prova. Testar pelo painel agora seria
 * testar um componente que nem monta a caixa de envio.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientChatBox } from "./client-chat-box";

const CONVERSATION_ID = "11111111-2222-3333-4444-555555555555";
/** O id do LEAD, que NÃO pode aparecer na chamada. */
const LEAD_ID = "99999999-8888-7777-6666-000000000000";

interface Chamada {
	url: string;
	body: Record<string, unknown>;
}

function installFetchMock(resposta: {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
}): Chamada[] {
	const calls: Chamada[] = [];
	global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
		// A listagem de templates é consultada quando a janela fecha — não conta.
		if (String(url).includes("/whatsapp/templates")) {
			return {
				ok: true,
				status: 200,
				json: async () => ({ templates: [] }),
			} as unknown as Response;
		}
		calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
		return resposta as unknown as Response;
	}) as unknown as typeof fetch;
	return calls;
}

async function digitarEEnviar(texto: string) {
	fireEvent.change(screen.getByPlaceholderText(/digite sua mensagem para o cliente/i), {
		target: { value: texto },
	});
	fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

beforeEach(() => {
	document.body.innerHTML = "";
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("contrato do chat do operador (FIX-87)", () => {
	it("usa o id da CONVERSA na URL e no body — nunca o id do lead", async () => {
		const calls = installFetchMock({
			ok: true,
			status: 200,
			json: async () => ({ success: true, messageId: "wamid.OK" }),
		});

		render(<ClientChatBox conversationId={CONVERSATION_ID} />);
		await digitarEEnviar("Olá, tudo bem?");

		await waitFor(() => expect(calls.length).toBe(1));
		const call = calls[0];
		expect((call.body as { conversationId: string }).conversationId).toBe(CONVERSATION_ID);
		expect(call.url).toContain(CONVERSATION_ID);
		expect(call.url).not.toContain(LEAD_ID);
	});

	it("mostra o motivo real que a API deu, não um fallback genérico", async () => {
		const MOTIVO = "Este cliente não tem WhatsApp vinculado — não dá para enviar por aqui.";
		installFetchMock({
			ok: false,
			status: 422,
			json: async () => ({ error: "NoWhatsapp", message: MOTIVO }),
		});

		render(<ClientChatBox conversationId={CONVERSATION_ID} />);
		await digitarEEnviar("mensagem que vai falhar");

		expect(await screen.findByText(MOTIVO)).toBeTruthy();
		expect(screen.queryByText("Falha ao enviar mensagem")).toBeNull();
	});
});
