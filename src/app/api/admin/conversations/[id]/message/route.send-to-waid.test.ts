/**
 * REGRESSÃO (bloco-rev-d) — BUG: a rota do chat do Kanban enviava a mensagem do
 * operador para o `conversationId` (UUID da conversa) em vez do `waId` (número
 * WhatsApp do cliente). `sendTextMessage(to, ...)` / `sendTemplate(to, ...)`
 * esperam o waId; a Meta Graph API rejeita um UUID como destinatário, então a
 * mensagem do operador NUNCA chegava ao cliente — mesmo a API respondendo 200.
 *
 * O frontend (`lead-detail-panel.tsx`) manda `conversationId: lead.id` no body e
 * `lead.id` na URL; a rota tratava `conversationId` como destinatário. O caminho
 * correto é resolver o `waId` da conversa e enviar PARA ELE.
 *
 * Teste de route → excluído do `pnpm test:unit` (glob route*.test.ts). Roda
 * explicitamente: `pnpm exec vitest run src/app/api/admin/conversations/**​/message/route.send-to-waid.test.ts`.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTextMessage = vi.fn(async () => ({ messageId: "wamid.real-text" }));
const sendTemplate = vi.fn(async () => ({ messageId: "wamid.real-tmpl" }));
const isWindowOpen = vi.fn();

vi.mock("@/lib/whatsapp/api", () => ({ sendTextMessage, sendTemplate }));
vi.mock("@/lib/whatsapp/window", () => ({ isWindowOpen }));

const findFirst = vi.fn();
const returning = vi.fn(async () => [{ id: "msg-1", createdAt: new Date() }]);
const fakeDb = {
	query: { conversations: { findFirst } },
	insert: vi.fn(() => ({ values: vi.fn(() => ({ returning })) })),
};
vi.mock("@/db", () => ({ globalDb: fakeDb, db: fakeDb }));

const { POST } = await import("./route");

const CONV_ID = "11111111-1111-1111-1111-111111111111";
const WA_ID = "5562999990000";

function makeReq(body: unknown): NextRequest {
	return new NextRequest("http://localhost/api/admin/conversations/x/message", {
		method: "POST",
		headers: { "Content-Type": "application/json", authorization: "Bearer test-token" },
		body: JSON.stringify(body),
	});
}

const params = (id: string) => ({ params: { id } });

describe("admin message route — envia ao waId da conversa, NUNCA ao conversationId", () => {
	beforeEach(() => {
		sendTextMessage.mockClear();
		sendTemplate.mockClear();
		findFirst.mockReset();
		returning.mockClear();
	});

	it("janela ABERTA → texto livre vai pro waId, não pro conversationId", async () => {
		isWindowOpen.mockResolvedValue({ open: true, expiresAt: new Date(Date.now() + 3_600_000) });
		findFirst.mockResolvedValue({ id: CONV_ID, waId: WA_ID });

		const res = await POST(makeReq({ conversationId: CONV_ID, text: "Olá, tudo certo?" }), params(CONV_ID));

		expect(res.status).toBe(200);
		expect(sendTextMessage).toHaveBeenCalledTimes(1);
		expect(sendTextMessage).toHaveBeenCalledWith(WA_ID, "Olá, tudo certo?");
		// O destinatário JAMAIS pode ser o UUID da conversa.
		expect(sendTextMessage.mock.calls[0][0]).not.toBe(CONV_ID);
	});

	it("janela FECHADA → template HSM vai pro waId, não pro conversationId", async () => {
		isWindowOpen.mockResolvedValue({ open: false, expiresAt: null });
		findFirst.mockResolvedValue({ id: CONV_ID, waId: WA_ID });

		const res = await POST(
			makeReq({ conversationId: CONV_ID, templateName: "aja_reabrir", languageCode: "pt_BR" }),
			params(CONV_ID),
		);

		expect(res.status).toBe(200);
		expect(sendTemplate).toHaveBeenCalledTimes(1);
		expect(sendTemplate.mock.calls[0][0]).toBe(WA_ID);
		expect(sendTemplate.mock.calls[0][0]).not.toBe(CONV_ID);
	});

	it("conversa sem waId (canal web) → NÃO envia WhatsApp e responde erro claro", async () => {
		isWindowOpen.mockResolvedValue({ open: true, expiresAt: new Date(Date.now() + 3_600_000) });
		findFirst.mockResolvedValue({ id: CONV_ID, waId: null });

		const res = await POST(makeReq({ conversationId: CONV_ID, text: "oi" }), params(CONV_ID));

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(sendTextMessage).not.toHaveBeenCalled();
	});
});
