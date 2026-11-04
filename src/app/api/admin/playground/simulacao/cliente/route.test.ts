import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/lib/admin/require-role", () => ({ requireRole: () => requireRole() }));

import { __setGenerateObjectDoClienteForTests } from "@/lib/playground/simulacao/cliente-ia";
import { perfilPorId } from "@/lib/playground/simulacao/perfis-de-cliente";
import { POST } from "./route";

const req = (body: unknown) =>
	new Request("http://localhost/api", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});

const seam = vi.fn();

beforeEach(() => {
	vi.stubEnv("TB_ENV", "dev");
	seam.mockReset();
	requireRole.mockReset();
	requireRole.mockResolvedValue({ error: null, session: { user: { email: "op@aja.test" } } });
	__setGenerateObjectDoClienteForTests(seam as never);
});
afterEach(() => {
	vi.unstubAllEnvs();
	__setGenerateObjectDoClienteForTests(null);
});

const base = { perfilId: "objecao", historico: [], turno: 2 };

describe("POST simulacao/cliente", () => {
	it("404 fora de dev", async () => {
		vi.stubEnv("TB_ENV", "prod");
		expect((await POST(req(base))).status).toBe(404);
	});

	it("403 sem admin", async () => {
		requireRole.mockResolvedValue({ error: new Response("no", { status: 403 }) });
		expect((await POST(req(base))).status).toBe(403);
	});

	it("400 com corpo inválido", async () => {
		expect((await POST(req("{nao json"))).status).toBe(400);
		expect((await POST(req({ ...base, perfilId: "nada" }))).status).toBe(400);
		expect((await POST(req({ ...base, horaFixa: "3h" }))).status).toBe(400);
	});

	it("turno 0 devolve a semente sem chamar o seam", async () => {
		const r = await POST(req({ ...base, turno: 0 }));
		expect(await r.json()).toEqual({
			texto: perfilPorId("objecao").abertura,
			estado: "continua",
			origem: "semente",
		});
		expect(seam).not.toHaveBeenCalled();
	});

	it("turno 2 chama o seam", async () => {
		seam.mockResolvedValue({ object: { texto: "e o prazo?", estado: "continua" } });
		const r = await POST(req(base));
		expect(r.status).toBe(200);
		expect(await r.json()).toEqual({ texto: "e o prazo?", estado: "continua", origem: "ia" });
		expect(seam).toHaveBeenCalledOnce();
	});

	it("502 quando o seam lança", async () => {
		seam.mockRejectedValue(new Error("boom"));
		const r = await POST(req(base));
		expect(r.status).toBe(502);
		expect(await r.json()).toEqual({ error: "A IA-cliente falhou." });
	});
});
