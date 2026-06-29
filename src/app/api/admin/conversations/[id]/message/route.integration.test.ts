// REV-C (auditoria adversarial 2026-06-28) — BUGs no chat do operador (FIX-87),
// rota POST /api/admin/conversations/[id]/message.
//
// Defeitos do código de modelo fraco:
//  A3 (auth): o gate era um placeholder que só checava a EXISTÊNCIA de um header
//     `Authorization: Bearer ...` e aceitava QUALQUER token (sem validar sessão).
//     O componente nem manda esse header → toda chamada dava 401 → feature 100%
//     quebrada. Além de inseguro (não usava requireRole como todas as outras rotas).
//  A4 (roteamento): `sendTextMessage(conversationId, text)` passava o UUID da CONVERSA
//     onde a função espera o NÚMERO de telefone do destinatário (`to`). O outbound do
//     copiloto confirma o contrato: sendTextMessage(whatsapp, text). Mandava pro destino
//     errado (UUID como telefone).
//  A5 (Next 16): `params` era tratado como objeto síncrono (sem await).
//
// Mocka a borda externa (requireRole, WhatsApp, janela). DB REAL (workspace).

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireRoleMock: vi.fn(),
	sendTextMock: vi.fn().mockResolvedValue({ messageId: "wamid.TEST" }),
	sendTemplateMock: vi.fn().mockResolvedValue({ messageId: "wamid.TPL" }),
	isWindowOpenMock: vi.fn(),
}));

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: mocks.requireRoleMock,
}));
vi.mock("@/lib/whatsapp/api", () => ({
	sendTextMessage: mocks.sendTextMock,
	sendTemplate: mocks.sendTemplateMock,
}));
vi.mock("@/lib/whatsapp/window", () => ({
	isWindowOpen: mocks.isWindowOpenMock,
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { POST } from "./route";

function msgReq(conversationId: string, body: unknown, headers: Record<string, string> = {}) {
	// SEM header Authorization de propósito: o componente nunca o envia; a auth é por cookie/sessão.
	return new Request(`http://test/api/admin/conversations/${conversationId}/message`, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

async function seedConversation(opts: { waId: string | null }) {
	const [conv] = await db
		.insert(conversations)
		.values({ channel: opts.waId ? "whatsapp" : "web", waId: opts.waId })
		.returning();
	return conv.id;
}

const createdConvs: string[] = [];

describeIfDb("POST /conversations/[id]/message — auth por sessão + roteamento pro waId", () => {
	beforeEach(() => {
		mocks.requireRoleMock.mockReset();
		// Default: sessão admin válida (sem Bearer header).
		mocks.requireRoleMock.mockResolvedValue({ error: null, session: { user: { id: "admin-1" } } });
		mocks.sendTextMock.mockClear();
		mocks.sendTemplateMock.mockClear();
		mocks.isWindowOpenMock.mockReset();
		mocks.isWindowOpenMock.mockResolvedValue({ open: true, expiresAt: null });
	});

	afterEach(async () => {
		while (createdConvs.length) {
			const id = createdConvs.pop();
			if (!id) continue;
			await db.delete(messages).where(eq(messages.conversationId, id));
			await db.delete(conversations).where(eq(conversations.id, id));
		}
	});

	it("autentica por sessão (sem Bearer) e envia o texto pro waId do cliente — nunca pro conversationId", async () => {
		const waId = "5562999990000";
		const convId = await seedConversation({ waId });
		createdConvs.push(convId);

		const res = await POST(msgReq(convId, { text: "Olá!" }), {
			params: Promise.resolve({ id: convId }),
		});

		// ANTES: sem Authorization → 401 (feature quebrada). AGORA: 200 via sessão.
		expect(res.status).toBe(200);

		expect(mocks.sendTextMock).toHaveBeenCalledTimes(1);
		const [to, text] = mocks.sendTextMock.mock.calls[0] as [string, string];
		expect(to).toBe(waId);
		expect(to).not.toBe(convId); // não manda o UUID da conversa como telefone
		expect(text).toBe("Olá!");

		// Persistiu a mensagem do operador na conversa certa.
		const rows = await db.select().from(messages).where(eq(messages.conversationId, convId));
		expect(rows.length).toBe(1);
		expect(rows[0].role).toBe("assistant");
	});

	it("respeita o gate de role: requireRole negando → bloqueia e NÃO envia", async () => {
		const convId = await seedConversation({ waId: "5562999990001" });
		createdConvs.push(convId);

		mocks.requireRoleMock.mockResolvedValue({
			error: Response.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
		});

		const res = await POST(msgReq(convId, { text: "Oi" }), {
			params: Promise.resolve({ id: convId }),
		});

		expect(res.status).toBe(403);
		expect(mocks.sendTextMock).not.toHaveBeenCalled();
	});

	it("conversa sem WhatsApp (web, waId nulo): não envia e devolve erro legível", async () => {
		const convId = await seedConversation({ waId: null });
		createdConvs.push(convId);

		const res = await POST(msgReq(convId, { text: "Oi" }), {
			params: Promise.resolve({ id: convId }),
		});

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.status).toBeLessThan(500);
		const body = (await res.json()) as { message?: string };
		expect(body.message).toBeTruthy();
		expect(mocks.sendTextMock).not.toHaveBeenCalled();
	});
});
