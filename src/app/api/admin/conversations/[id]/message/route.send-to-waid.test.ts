/**
 * REGRESSÃO (bloco-rev-d) — BUG: a rota do chat do Kanban enviava a mensagem do
 * operador para o `conversationId` (UUID da conversa) em vez do `waId` (número
 * WhatsApp do cliente). `sendTextMessage(to, ...)` / `sendTemplate(to, ...)`
 * esperam o waId; a Meta Graph API rejeita um UUID como destinatário, então a
 * mensagem do operador NUNCA chegava ao cliente — mesmo a API respondendo 200.
 *
 * Teste UNIT (mocka DB + auth + WhatsApp) → cobre o roteamento pro waId nos dois
 * estados de janela SEM precisar de banco. A versão final da rota (revisão
 * mesa-kanban) resolve o waId via `db.select(...).from(conversations)` e exige
 * `requireRole` (auth por sessão) — este teste mocka ambos. O caminho com DB real
 * + auth está em `route.integration.test.ts`.
 *
 * Teste de route → excluído do `pnpm test:unit` (glob route*.test.ts). Roda
 * explicitamente: `pnpm exec vitest run "src/app/api/admin/conversations"`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTextMessage = vi.fn(async (_to: string, _text: string) => ({
	messageId: "wamid.real-text",
}));
const sendTemplate = vi.fn(
	async (_to: string, _templateName: string, _languageCode: string, _components?: unknown[]) => ({
		messageId: "wamid.real-tmpl",
	}),
);
const isWindowOpen = vi.fn();
const requireRole = vi.fn();

vi.mock("@/lib/whatsapp/api", () => ({ sendTextMessage, sendTemplate }));
vi.mock("@/lib/whatsapp/window", () => ({ isWindowOpen }));
vi.mock("@/lib/admin/require-role", () => ({ requireRole }));

// A rota resolve o waId via `db.select({waId}).from(conversations).where(eq).limit(1)`
// e persiste via `db.insert(messages).values(...)`. O fake reproduz essa chain.
const limit = vi.fn();
const fakeDb = {
	select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) })),
	insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
};
vi.mock("@/db", () => ({ globalDb: fakeDb, db: fakeDb }));

const { POST } = await import("./route");

const CONV_ID = "11111111-1111-1111-1111-111111111111";
const WA_ID = "5562999990000";

function makeReq(body: unknown): Request {
	return new Request("http://localhost/api/admin/conversations/x/message", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("admin message route — envia ao waId da conversa, NUNCA ao conversationId", () => {
	beforeEach(() => {
		sendTextMessage.mockClear();
		sendTemplate.mockClear();
		isWindowOpen.mockReset();
		limit.mockReset();
		// Default: sessão admin válida (auth por sessão, sem Bearer header).
		requireRole.mockReset();
		requireRole.mockResolvedValue({ error: null, session: { user: { id: "admin-1" } } });
	});

	it("janela ABERTA → texto livre vai pro waId, não pro conversationId", async () => {
		isWindowOpen.mockResolvedValue({ open: true, expiresAt: new Date(Date.now() + 3_600_000) });
		limit.mockResolvedValue([{ waId: WA_ID }]);

		const res = await POST(makeReq({ text: "Olá, tudo certo?" }), params(CONV_ID));

		expect(res.status).toBe(200);
		expect(sendTextMessage).toHaveBeenCalledTimes(1);
		expect(sendTextMessage).toHaveBeenCalledWith(WA_ID, "Olá, tudo certo?");
		// O destinatário JAMAIS pode ser o UUID da conversa.
		expect(sendTextMessage.mock.calls[0][0]).not.toBe(CONV_ID);
	});

	it("janela FECHADA → template HSM vai pro waId, não pro conversationId", async () => {
		isWindowOpen.mockResolvedValue({ open: false, expiresAt: null });
		limit.mockResolvedValue([{ waId: WA_ID }]);

		const res = await POST(
			makeReq({ templateName: "aja_reabrir", languageCode: "pt_BR" }),
			params(CONV_ID),
		);

		expect(res.status).toBe(200);
		expect(sendTemplate).toHaveBeenCalledTimes(1);
		expect(sendTemplate.mock.calls[0][0]).toBe(WA_ID);
		expect(sendTemplate.mock.calls[0][0]).not.toBe(CONV_ID);
	});

	it("conversa sem waId (canal web) → NÃO envia WhatsApp e responde erro claro", async () => {
		isWindowOpen.mockResolvedValue({ open: true, expiresAt: new Date(Date.now() + 3_600_000) });
		limit.mockResolvedValue([{ waId: null }]);

		const res = await POST(makeReq({ text: "oi" }), params(CONV_ID));

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(sendTextMessage).not.toHaveBeenCalled();
	});

	it("auth negada (requireRole) → bloqueia e NÃO envia", async () => {
		requireRole.mockResolvedValue({
			error: Response.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
		});

		const res = await POST(makeReq({ text: "oi" }), params(CONV_ID));

		expect(res.status).toBe(403);
		expect(sendTextMessage).not.toHaveBeenCalled();
		expect(sendTemplate).not.toHaveBeenCalled();
	});
});
