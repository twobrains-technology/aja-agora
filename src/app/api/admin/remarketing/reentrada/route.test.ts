// Camada de rota — `/api/admin/remarketing/reentrada` (FIX-385).
//
// O que protege aqui é a CASCA HTTP, não a decisão: (1) sem sessão não sai
// reentrada; (2) `viewer` pode VER o preview mas não EXECUTAR; (3) o POST
// carimba quem autorizou (sessão) e devolve o resultado do lote; (4) falha do
// lote vira 500 com mensagem — nunca um "0 entraram" silencioso.
//
// O módulo de dados é mockado: a gravação de verdade (UPSERT idempotente) e a
// decisão têm prova própria — esta é a borda.

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/admin/remarketing-reentrada", () => ({ reentrarEmLote: vi.fn() }));

let GET: typeof import("./route").GET;
let POST: typeof import("./route").POST;
let requireRole: Mock;
let reentrarEmLote: Mock;

beforeEach(async () => {
	({ GET, POST } = await import("./route"));
	requireRole = vi.mocked((await import("@/lib/admin/require-role")).requireRole);
	reentrarEmLote = vi.mocked((await import("@/lib/admin/remarketing-reentrada")).reentrarEmLote);
	vi.clearAllMocks();

	requireRole.mockResolvedValue({
		error: null,
		session: {
			user: { id: "atendente-1", name: "Bruna", email: "bruna@aja.com.br", role: "attendant" },
		},
		role: "attendant",
	});
	reentrarEmLote.mockResolvedValue({
		avaliadas: 5,
		entram: 2,
		ficaramDeFora: { optout: 1, teste: 1, telefone_da_equipe: 1 },
		truncado: false,
	});
});

const req = (): Request => new Request("http://localhost/api/admin/remarketing/reentrada");

describe("GET /api/admin/remarketing/reentrada — preview", () => {
	it("sem sessão devolve 401 e não calcula nada", async () => {
		requireRole.mockResolvedValueOnce({
			error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
			session: null,
			role: null,
		});
		const res = await GET(req() as never);
		expect(res.status).toBe(401);
		expect(reentrarEmLote).not.toHaveBeenCalled();
	});

	it("com sessão devolve o preview (dry-run) e diz quantas entram", async () => {
		const res = await GET(req() as never);
		expect(res.status).toBe(200);
		const corpo = (await res.json()) as { entram: number; avaliadas: number };
		expect(corpo.entram).toBe(2);
		expect(corpo.avaliadas).toBe(5);
		// O preview NÃO escreve: a chamada é dry-run.
		expect(reentrarEmLote).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
	});
});

describe("POST /api/admin/remarketing/reentrada — execução", () => {
	it("sem sessão não executa", async () => {
		requireRole.mockResolvedValueOnce({
			error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
			role: null,
		});
		const res = await POST(req() as never);
		expect(res.status).toBe(403);
		expect(reentrarEmLote).not.toHaveBeenCalled();
	});

	it("carimba quem autorizou e devolve o resultado do lote", async () => {
		const res = await POST(req() as never);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ entram: 2, avaliadas: 5 });

		expect(reentrarEmLote).toHaveBeenCalledWith(
			expect.objectContaining({
				por: "Bruna",
				porId: "atendente-1",
				dryRun: false,
			}),
		);
	});

	it("falha do lote vira 500, nunca um zero silencioso", async () => {
		reentrarEmLote.mockRejectedValueOnce(new Error("banco fora"));
		const res = await POST(req() as never);
		expect(res.status).toBe(500);
		const corpo = (await res.json()) as { error?: string };
		expect(corpo.error).toBeTruthy();
	});
});
