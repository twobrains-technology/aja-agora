/**
 * Hardening — POST /api/leads com conversationId malformado.
 *
 * Antes: conversationId presente mas NÃO-UUID (ex.: "not-a-uuid") passava a
 * validação de presença e chegava na query `findFirst(conversations.id = ...)`,
 * que está FORA do try/catch → Postgres lança `invalid input syntax for type
 * uuid` → o handler explode (500/throw) em vez de um 400 limpo. Input malformado
 * é erro do cliente (400), não erro do servidor (500). Achado no QA noturno
 * (card docs/correcoes/inbox/2026-06-21-e2e-lead-capture-furados.md, obs. lateral).
 */
import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

function makeReq(body: unknown): NextRequest {
	return new Request("http://localhost/api/leads", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
		body: JSON.stringify(body),
	}) as unknown as NextRequest;
}

describe("POST /api/leads — validação de formato do conversationId", () => {
	it("conversationId não-UUID → 400 (não 500/throw do Postgres invalid uuid)", async () => {
		const res = await POST(
			makeReq({ conversationId: "not-a-uuid", name: "Ana Teste", phone: "11999998888" }),
		);
		expect(res.status).toBe(400);
	});

	it("conversationId UUID válido mas inexistente → 404 (formato ok, segue o fluxo)", async () => {
		const res = await POST(
			makeReq({
				conversationId: "00000000-0000-4000-8000-000000000000",
				name: "Ana Teste",
				phone: "11999998888",
			}),
		);
		expect(res.status).toBe(404);
	});
});
