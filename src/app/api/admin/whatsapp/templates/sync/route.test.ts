// Camada 1/2 — FIX resiliência: a rota de sync chamava reconcileTemplateStatuses()
// SEM try/catch → quando a reconciliação lançava (ex: WABA_ID ausente, Meta 4xx,
// timeout) o Next respondia 500 com body vazio, sem pista pro admin. Deve virar
// 502 JSON com { error, message } — mesmo formato do [id]/submit/route.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: "test-admin", role: "admin" } },
	})),
}));

vi.mock("@/lib/whatsapp/template-sync", () => ({
	reconcileTemplateStatuses: vi.fn(),
}));

let POST: typeof import("./route").POST;
let reconcileTemplateStatuses: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	({ POST } = await import("./route"));
	const mod = await import("@/lib/whatsapp/template-sync");
	reconcileTemplateStatuses = mod.reconcileTemplateStatuses as ReturnType<typeof vi.fn>;
	reconcileTemplateStatuses.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("FIX resiliência — sync route resiliente a erro da reconciliação", () => {
	it("sucesso → 200 com ok:true e o resultado", async () => {
		reconcileTemplateStatuses.mockResolvedValueOnce({ updated: 2, checked: 5 });
		const res = await POST();
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; updated: number };
		expect(body.ok).toBe(true);
		expect(body.updated).toBe(2);
	});

	it("reconcile lança → 502 JSON com message (não 500 mudo)", async () => {
		reconcileTemplateStatuses.mockRejectedValueOnce(
			new Error("WHATSAPP_WABA_ID must be set"),
		);
		const res = await POST();
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error?: string; message?: string };
		expect(body.error).toBeTruthy();
		expect(body.message).toContain("WHATSAPP_WABA_ID");
	});
});
