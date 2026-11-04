import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/lib/admin/require-role", () => ({ requireRole: () => requireRole() }));

import { guardaDaSimulacao } from "./guarda";

beforeEach(() => {
	requireRole.mockReset();
	requireRole.mockResolvedValue({
		error: null,
		session: { user: { email: "op@aja.test" } },
	});
});
afterEach(() => vi.unstubAllEnvs());

describe("guardaDaSimulacao", () => {
	it("404 fora de dev", async () => {
		vi.stubEnv("TB_ENV", "prod");
		const g = await guardaDaSimulacao();
		expect(g.resposta?.status).toBe(404);
		expect(requireRole).not.toHaveBeenCalled();
	});

	it("admin em dev passa", async () => {
		vi.stubEnv("TB_ENV", "dev");
		const g = await guardaDaSimulacao();
		expect(g).toEqual({ resposta: null, email: "op@aja.test" });
	});

	it("sem admin devolve o erro do requireRole", async () => {
		vi.stubEnv("TB_ENV", "dev");
		requireRole.mockResolvedValue({ error: new Response("no", { status: 403 }) });
		const g = await guardaDaSimulacao();
		expect(g.resposta?.status).toBe(403);
	});
});
