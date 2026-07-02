// Camada 1 (unit de rota) — FIX-206: POST /sync devolvia 500 MUDO quando
// reconcileTemplateStatuses lançava (getWabaConfig sem WHATSAPP_WABA_ID/token).
// Deve virar 502 JSON acionável com `message`, igual ao [id]/submit.
//
// Roda em test:unit (nome != route*.test.ts / *.integration.test.ts). requireRole
// e template-sync mockados — não toca auth real nem DB nem Graph.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: "test-admin", role: "admin" } },
	})),
}));

vi.mock("@/lib/whatsapp/template-sync", () => ({
	reconcileTemplateStatuses: vi.fn(),
}));

describe("FIX-206 — POST /sync não devolve 500 mudo em erro da Meta/config", () => {
	it("erro em reconcileTemplateStatuses vira 502 JSON com message (não 500 mudo)", async () => {
		const { reconcileTemplateStatuses } = await import("@/lib/whatsapp/template-sync");
		(reconcileTemplateStatuses as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_WABA_ID must be set"),
		);
		const { POST } = await import("./route");

		const res = await POST();

		expect(res.status).toBe(502);
		expect(res.headers.get("content-type")).toContain("application/json");
		const body = (await res.json()) as { error?: string; message?: string };
		expect(body.message).toContain("must be set");
		expect(body.error).toBeTruthy();
	});

	it("sucesso continua respondendo 200 com { ok: true, ...result }", async () => {
		const { reconcileTemplateStatuses } = await import("@/lib/whatsapp/template-sync");
		(reconcileTemplateStatuses as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			updated: 2,
		});
		const { POST } = await import("./route");

		const res = await POST();

		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; updated: number };
		expect(body.ok).toBe(true);
		expect(body.updated).toBe(2);
	});
});
