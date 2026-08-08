/**
 * Feedback do simulador → score `user_feedback` no Langfuse.
 * Estrutural (sem DB/rede): gates (simulador off ⇒ 404; role ⇒ 403; conversa
 * não-simulada ⇒ 404), payload do score (1/0, BOOLEAN, traceId vs sessionId)
 * e a lei "Langfuse desligado nunca vira 500".
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	// biome-ignore lint/suspicious/noExplicitAny: seams de teste com variantes (error/null, undefined)
	requireRole: vi.fn(
		async (): Promise<any> => ({ error: null, session: { user: { id: "admin-1" } } }),
	),
	isSimulatorEnabled: vi.fn(() => true),
	// biome-ignore lint/suspicious/noExplicitAny: seam de teste
	findFirst: vi.fn(async (): Promise<any> => ({ id: "conv-1", isSimulated: true })),
	scoreCreate: vi.fn(async () => undefined),
	getLangfuseClient: vi.fn((): unknown => ({ score: { create: mocks.scoreCreate } })),
}));

vi.mock("@/lib/admin/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/utils/env", () => ({ isSimulatorEnabled: mocks.isSimulatorEnabled }));
vi.mock("@/db", () => ({ db: { query: { conversations: { findFirst: mocks.findFirst } } } }));
vi.mock("@/lib/observability/langfuse/client", () => ({
	getLangfuseClient: mocks.getLangfuseClient,
}));

import type { NextRequest } from "next/server";
import { POST } from "./route";

function req(body: unknown): NextRequest {
	return new Request("http://test/api/admin/simulator/sessions/conv-1/feedback", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	}) as unknown as NextRequest;
}
const params = { params: Promise.resolve({ id: "conv-1" }) };

describe("POST /api/admin/simulator/sessions/[id]/feedback", () => {
	afterEach(() => {
		mocks.requireRole.mockClear();
		mocks.isSimulatorEnabled.mockReset();
		mocks.isSimulatorEnabled.mockReturnValue(true);
		mocks.findFirst.mockReset();
		mocks.findFirst.mockResolvedValue({ id: "conv-1", isSimulated: true });
		mocks.scoreCreate.mockClear();
		mocks.getLangfuseClient.mockReset();
		mocks.getLangfuseClient.mockReturnValue({ score: { create: mocks.scoreCreate } });
	});

	it("404 quando o simulador está desabilitado", async () => {
		mocks.isSimulatorEnabled.mockReturnValue(false);
		const res = await POST(req({ value: "up" }), params);
		expect(res.status).toBe(404);
	});

	it("bloqueia sem role admin", async () => {
		mocks.requireRole.mockResolvedValueOnce({
			error: Response.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
		});
		const res = await POST(req({ value: "up" }), params);
		expect(res.status).toBe(403);
		expect(mocks.requireRole).toHaveBeenCalledWith("admin");
	});

	it("404 quando a conversa não existe/não é simulada (guard is_simulated)", async () => {
		mocks.findFirst.mockResolvedValue(undefined);
		const res = await POST(req({ value: "up" }), params);
		expect(res.status).toBe(404);
	});

	it("400 em body inválido", async () => {
		const res = await POST(req({ value: "maybe" }), params);
		expect(res.status).toBe(400);
	});

	it("👍 com traceId → score BOOLEAN 1 no trace", async () => {
		const res = await POST(req({ value: "up", traceId: "t-9", comment: "boa resposta" }), params);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: true });
		expect(mocks.scoreCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "user_feedback",
				value: 1,
				dataType: "BOOLEAN",
				traceId: "t-9",
				comment: "boa resposta",
			}),
		);
	});

	it("👎 sem traceId → score 0 na SESSION (fallback)", async () => {
		const res = await POST(req({ value: "down" }), params);
		expect(res.status).toBe(200);
		const call = (mocks.scoreCreate.mock.calls[0] as unknown[])?.[0] as Record<string, unknown>;
		expect(call).toMatchObject({ name: "user_feedback", value: 0, sessionId: "conv-1" });
		expect(call.traceId).toBeUndefined();
	});

	it("Langfuse desligado → 200 {ok:false}, nunca 500", async () => {
		mocks.getLangfuseClient.mockReturnValue(null);
		const res = await POST(req({ value: "up" }), params);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: false, reason: "langfuse-disabled" });
	});

	it("erro do SDK → 200 {ok:false}, nunca 500", async () => {
		mocks.scoreCreate.mockRejectedValueOnce(new Error("api fora"));
		const res = await POST(req({ value: "up", traceId: "t-1" }), params);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ ok: false });
	});
});
