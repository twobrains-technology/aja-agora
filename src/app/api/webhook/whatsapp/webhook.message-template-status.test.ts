// Camada 1 (estrutural, sem DB) — FIX-202: o webhook roteia o field
// `message_template_status_update` pro handler de sync SEM quebrar o parsing de
// `messages`/`statuses`.
//
// Nome NÃO começa com "route" de propósito: o gate `test:unit` exclui
// `route*.test.ts` (vão pro test:integration). Aqui exercitamos o `POST` real do
// webhook com todas as dependências de I/O mockadas, então roda no gate.
//
// Ver docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	applyTemplateStatusUpdate: vi.fn().mockResolvedValue({ updated: true }),
	parseTemplateStatusChange: vi.fn((v: unknown) => ({ parsed: v })),
	processTextMessage: vi.fn().mockResolvedValue(undefined),
	processInteractiveReply: vi.fn().mockResolvedValue(undefined),
	markAsRead: vi.fn().mockResolvedValue(undefined),
	updateLastInboundAt: vi.fn().mockResolvedValue(undefined),
	handleDocumentInbound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/whatsapp/template-sync", () => ({
	applyTemplateStatusUpdate: mocks.applyTemplateStatusUpdate,
	parseTemplateStatusChange: mocks.parseTemplateStatusChange,
}));
vi.mock("@/lib/whatsapp/processor", () => ({
	processTextMessage: mocks.processTextMessage,
	processInteractiveReply: mocks.processInteractiveReply,
}));
vi.mock("@/lib/whatsapp/api", () => ({ markAsRead: mocks.markAsRead }));
vi.mock("@/lib/whatsapp/document-inbound", () => ({
	handleDocumentInbound: mocks.handleDocumentInbound,
}));
vi.mock("@/app/actions/whatsapp", () => ({ updateLastInboundAt: mocks.updateLastInboundAt }));

import { POST } from "./route";

// Sem WHATSAPP_APP_SECRET a verificação de assinatura é pulada (dev/test).
function post(body: unknown): Request {
	return new Request("https://x/api/webhook/whatsapp", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	delete process.env.WHATSAPP_APP_SECRET;
	for (const m of Object.values(mocks)) m.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe("FIX-202 — webhook roteia message_template_status_update", () => {
	it("field de status de template → chama applyTemplateStatusUpdate com o value parseado", async () => {
		const value = {
			event: "APPROVED",
			message_template_id: "meta-1",
			message_template_name: "aja_confirmacao_v1",
			message_template_language: "pt_BR",
		};
		const res = await POST(
			// biome-ignore lint/suspicious/noExplicitAny: NextRequest aceita o shape de Request no teste
			post({ entry: [{ changes: [{ field: "message_template_status_update", value }] }] }) as any,
		);
		expect(res.status).toBe(200);
		await flush();
		expect(mocks.parseTemplateStatusChange).toHaveBeenCalledWith(value);
		expect(mocks.applyTemplateStatusUpdate).toHaveBeenCalledTimes(1);
		// não confunde com mensagem inbound
		expect(mocks.processTextMessage).not.toHaveBeenCalled();
	});

	it("mensagem inbound continua roteando pro processor (não-regressão)", async () => {
		const res = await POST(
			// biome-ignore lint/suspicious/noExplicitAny: shape de teste
			post({
				entry: [
					{
						changes: [
							{
								field: "messages",
								value: {
									messages: [{ from: "5562999", type: "text", id: "wamid.1", text: { body: "oi" } }],
								},
							},
						],
					},
				],
			}) as any,
		);
		expect(res.status).toBe(200);
		await flush();
		expect(mocks.processTextMessage).toHaveBeenCalledTimes(1);
		expect(mocks.applyTemplateStatusUpdate).not.toHaveBeenCalled();
	});

	it("status de entrega (statuses) continua sendo tratado sem chamar o sync (não-regressão)", async () => {
		const res = await POST(
			// biome-ignore lint/suspicious/noExplicitAny: shape de teste
			post({
				entry: [
					{
						changes: [
							{ field: "statuses", value: { statuses: [{ status: "delivered", id: "wamid.1", recipient_id: "5562999" }] } },
						],
					},
				],
			}) as any,
		);
		expect(res.status).toBe(200);
		await flush();
		expect(mocks.applyTemplateStatusUpdate).not.toHaveBeenCalled();
		expect(mocks.processTextMessage).not.toHaveBeenCalled();
	});
});
