// Camada de rota — `/api/admin/exportacao/<tipo>`.
//
// O que protege: (1) sem admin não sai arquivo; (2) com período, o download vem
// com `Content-Disposition` e as linhas do recorte; (3) o registro na auditoria
// conta quantas linhas saíram. O módulo de dados é mockado — o que está sob
// teste aqui é a casca HTTP, não a query (essa tem integration test próprio).

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/exportacao", () => ({
	ehTipoExportacao: vi.fn(),
	exportar: vi.fn(),
	gerar: vi.fn(),
}));
vi.mock("@/lib/exportacao/historico", () => ({ registrarExportacao: vi.fn() }));

let GET: typeof import("./route").GET;
let requireRole: Mock;
let ehTipoExportacao: Mock;
let exportar: Mock;
let gerar: Mock;
let registrarExportacao: Mock;

const params = Promise.resolve({ tipo: "conversas" });

beforeEach(async () => {
	({ GET } = await import("./route"));
	requireRole = vi.mocked((await import("@/lib/admin/require-role")).requireRole);
	const modulo = await import("@/lib/exportacao");
	ehTipoExportacao = vi.mocked(modulo.ehTipoExportacao);
	exportar = vi.mocked(modulo.exportar);
	gerar = vi.mocked(modulo.gerar);
	registrarExportacao = vi.mocked((await import("@/lib/exportacao/historico")).registrarExportacao);
	vi.clearAllMocks();

	requireRole.mockResolvedValue({
		error: null,
		session: { user: { id: "admin-1", email: "admin@aja.com.br", role: "admin" } },
		role: "admin",
	});
	ehTipoExportacao.mockReturnValue(true);
	exportar.mockResolvedValue([{ conversaId: "c1" }]);
	gerar.mockReturnValue("corpo-do-arquivo");
});

function url(query: string): string {
	return `http://localhost/api/admin/exportacao/conversas${query}`;
}

describe("GET /api/admin/exportacao/[tipo]", () => {
	it("sem admin devolve 403 e não exporta", async () => {
		requireRole.mockResolvedValueOnce({
			error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
			role: null,
		});
		const res = await GET(new Request(url("?from=2026-09-01&to=2026-09-10")), { params });
		expect(res.status).toBe(403);
		expect(exportar).not.toHaveBeenCalled();
	});

	it("tipo desconhecido devolve 404", async () => {
		ehTipoExportacao.mockReturnValueOnce(false);
		const res = await GET(new Request(url("?from=2026-09-01&to=2026-09-10")), { params });
		expect(res.status).toBe(404);
	});

	it("com período devolve o arquivo com cabeçalhos e registra a auditoria", async () => {
		const res = await GET(new Request(url("?from=2026-09-01&to=2026-09-10")), {
			params,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("text/csv");
		expect(res.headers.get("Content-Disposition")).toBe(
			'attachment; filename="aja-conversas-2026-09-01-2026-09-10.csv"',
		);
		expect(await res.text()).toBe("corpo-do-arquivo");
		expect(gerar).toHaveBeenCalledWith("csv", [{ conversaId: "c1" }]);
		expect(registrarExportacao).toHaveBeenCalledWith(
			expect.objectContaining({
				tipo: "conversas",
				formato: "csv",
				mascarado: true,
				linhas: 1,
				usuarioEmail: "admin@aja.com.br",
			}),
		);
	});

	it("formato=json e completo desligam a máscara e mudam a extensão", async () => {
		const res = await GET(
			new Request(url("?from=2026-09-01&to=2026-09-10&formato=json&completo=1")),
			{ params },
		);
		expect(res.headers.get("Content-Disposition")).toContain(".json");
		expect(exportar).toHaveBeenCalledWith(
			"conversas",
			expect.objectContaining({ mascarar: false }),
		);
		expect(registrarExportacao).toHaveBeenCalledWith(
			expect.objectContaining({ mascarado: false, formato: "json" }),
		);
	});
});
