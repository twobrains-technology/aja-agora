// Camada de rota — `GET /api/admin/exportacao` (o resumo da tela).
//
// Protege: só admin lê; e a resposta traz as contagens dos três recortes junto
// com as últimas exportações. Não gera arquivo nem grava auditoria — contar não
// é exportar.

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/exportacao", () => ({
	TIPOS_DE_EXPORTACAO: ["conversas", "percurso", "toques"],
	contar: vi.fn(),
}));
vi.mock("@/lib/exportacao/historico", () => ({ listarUltimasExportacoes: vi.fn() }));

let GET: typeof import("./route").GET;
let requireRole: Mock;
let contar: Mock;
let listarUltimasExportacoes: Mock;

beforeEach(async () => {
	({ GET } = await import("./route"));
	requireRole = vi.mocked((await import("@/lib/admin/require-role")).requireRole);
	contar = vi.mocked((await import("@/lib/exportacao")).contar);
	listarUltimasExportacoes = vi.mocked(
		(await import("@/lib/exportacao/historico")).listarUltimasExportacoes,
	);
	vi.clearAllMocks();

	requireRole.mockResolvedValue({
		error: null,
		session: { user: { id: "admin-1", email: "admin@aja.com.br", role: "admin" } },
		role: "admin",
	});
	contar.mockResolvedValue(7);
	listarUltimasExportacoes.mockResolvedValue([]);
});

describe("GET /api/admin/exportacao", () => {
	it("sem admin devolve 403", async () => {
		requireRole.mockResolvedValueOnce({
			error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
			role: null,
		});
		const res = await GET(
			new Request("http://localhost/api/admin/exportacao?from=2026-09-01&to=2026-09-10"),
		);
		expect(res.status).toBe(403);
		expect(contar).not.toHaveBeenCalled();
	});

	it("com período devolve a contagem dos três recortes e as últimas exportações", async () => {
		const res = await GET(
			new Request("http://localhost/api/admin/exportacao?from=2026-09-01&to=2026-09-10"),
		);
		expect(res.status).toBe(200);
		const corpo = (await res.json()) as {
			contagens: Record<string, number>;
			ultimas: unknown[];
		};
		expect(corpo.contagens).toEqual({ conversas: 7, percurso: 7, toques: 7 });
		expect(contar).toHaveBeenCalledTimes(3);
		expect(corpo.ultimas).toEqual([]);
	});
});
