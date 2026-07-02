/**
 * REV-C (auditoria adversarial 2026-06-28) — escalada de privilégio no CRUD de
 * atendentes. As mutações de /api/admin/attendants (criar/editar/desativar USERS —
 * envia convite, mexe em conta de login) usavam requireRole("admin", "attendant"),
 * permitindo que um próprio atendente gerenciasse a equipe. O CRUD de atendentes de
 * MESA é admin-only; gestão de equipe deve ser igual. Decisão do Kairo (2026-06-28):
 * mutações = só admin (o GET pode manter attendant para ver a lista).
 *
 * Teste structural (Camada 1, sem DB): verifica que cada mutação chama requireRole
 * SÓ com "admin" e aborta quando o gate nega. Determinístico — roda em todo PR.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireRoleMock: vi.fn(async () => ({
		error: Response.json({ error: "Forbidden" }, { status: 403 }),
		session: null,
	})),
}));

vi.mock("@/lib/admin/require-role", () => ({ requireRole: mocks.requireRoleMock }));
// Bordas com side-effect de import — neutralizadas (o handler aborta no gate antes de tocá-las).
vi.mock("@/lib/auth", () => ({ auth: { api: { signUpEmail: vi.fn() } } }));
vi.mock("@/lib/email/sendgrid", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/whatsapp/proxy", () => ({ invalidateAttendantCache: vi.fn() }));

import { DELETE, PATCH } from "./[id]/route";
import { POST } from "./route";

function req(body: unknown = {}) {
	return new Request("http://test/api/admin/attendants", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}
const params = { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) };

describe("CRUD de atendentes — mutações são admin-only (anti escalada de privilégio)", () => {
	afterEach(() => mocks.requireRoleMock.mockClear());

	it("POST exige requireRole('admin') — sem 'attendant'", async () => {
		const res = await POST(req({ name: "X", email: "x@x.com", phone: "5562999998888" }));
		expect(res.status).toBe(403);
		expect(mocks.requireRoleMock).toHaveBeenCalledWith("admin");
		expect(mocks.requireRoleMock).not.toHaveBeenCalledWith("admin", "attendant");
	});

	it("PATCH exige requireRole('admin') — sem 'attendant'", async () => {
		const res = await PATCH(req({ name: "Y" }), params);
		expect(res.status).toBe(403);
		expect(mocks.requireRoleMock).toHaveBeenCalledWith("admin");
		expect(mocks.requireRoleMock).not.toHaveBeenCalledWith("admin", "attendant");
	});

	it("DELETE exige requireRole('admin') — sem 'attendant'", async () => {
		const res = await DELETE(req(), params);
		expect(res.status).toBe(403);
		expect(mocks.requireRoleMock).toHaveBeenCalledWith("admin");
		expect(mocks.requireRoleMock).not.toHaveBeenCalledWith("admin", "attendant");
	});
});
