// Camada 1/2 (structural) — Bloco 3: rota de upload da arte do header de template.
// Mocka o gate de role e o cliente da Meta. NUNCA bate na Graph real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireRole: vi.fn(),
	uploadTemplateHeaderMedia: vi.fn(),
}));

vi.mock("@/lib/admin/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/whatsapp/api", async () => {
	// `ErroDaMeta` é real: a rota faz `instanceof` nele pra mapear o status.
	const real = await vi.importActual<typeof import("@/lib/whatsapp/api")>("@/lib/whatsapp/api");
	return {
		ErroDaMeta: real.ErroDaMeta,
		uploadTemplateHeaderMedia: mocks.uploadTemplateHeaderMedia,
	};
});

import { ErroDaMeta } from "@/lib/whatsapp/api";
import { POST } from "./route";

function liberaParaAdmin() {
	mocks.requireRole.mockResolvedValue({
		error: null,
		session: { user: { id: "u1", role: "admin" } },
		role: "admin",
	});
}

function requisicaoComArte(arquivo: File | null) {
	const form = new FormData();
	if (arquivo) form.append("arte", arquivo);
	return new Request("http://localhost/api/admin/whatsapp/templates/media", {
		method: "POST",
		body: form,
	});
}

const ARTE_OK = new File([new Uint8Array([1, 2, 3])], "arte.png", { type: "image/png" });

beforeEach(() => {
	vi.clearAllMocks();
	liberaParaAdmin();
	process.env.WHATSAPP_APP_ID = "987654321";
	mocks.uploadTemplateHeaderMedia.mockResolvedValue("4::handle==:abc");
});

afterEach(() => {
	delete process.env.WHATSAPP_APP_ID;
});

describe("Bloco 3 — POST /api/admin/whatsapp/templates/media", () => {
	it("devolve o handle do upload resumable da Meta", async () => {
		const res = await POST(requisicaoComArte(ARTE_OK));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ handle: "4::handle==:abc" });
		expect(mocks.uploadTemplateHeaderMedia).toHaveBeenCalledTimes(1);
	});

	it("nega antes de subir qualquer coisa quando o gate nega", async () => {
		mocks.requireRole.mockResolvedValue({
			error: Response.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
			role: null,
		});
		const res = await POST(requisicaoComArte(ARTE_OK));
		expect(res.status).toBe(403);
		expect(mocks.uploadTemplateHeaderMedia).not.toHaveBeenCalled();
	});

	it("responde 503 explicando o que falta quando não há WHATSAPP_APP_ID", async () => {
		delete process.env.WHATSAPP_APP_ID;
		const res = await POST(requisicaoComArte(ARTE_OK));
		expect(res.status).toBe(503);
		expect(((await res.json()) as { error: string }).error).toContain("WHATSAPP_APP_ID");
		expect(mocks.uploadTemplateHeaderMedia).not.toHaveBeenCalled();
	});

	it("recusa sem arquivo e formato não suportado antes de ir à Meta", async () => {
		const semArquivo = await POST(requisicaoComArte(null));
		expect(semArquivo.status).toBe(400);

		const webp = new File([new Uint8Array([1])], "arte.webp", { type: "image/webp" });
		const res = await POST(requisicaoComArte(webp));
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toContain("JPEG ou PNG");
		expect(mocks.uploadTemplateHeaderMedia).not.toHaveBeenCalled();
	});

	it("mapeia erro de conteúdo da Meta (4xx) para 400 e falha dela (5xx) para 502", async () => {
		mocks.uploadTemplateHeaderMedia.mockRejectedValueOnce(new ErroDaMeta("Arte recusada", 400));
		const conteudo = await POST(requisicaoComArte(ARTE_OK));
		expect(conteudo.status).toBe(400);
		expect(((await conteudo.json()) as { error: string }).error).toBe("Arte recusada");

		mocks.uploadTemplateHeaderMedia.mockRejectedValueOnce(new ErroDaMeta("Internal error", 500));
		const falha = await POST(requisicaoComArte(ARTE_OK));
		expect(falha.status).toBe(502);
	});
});
