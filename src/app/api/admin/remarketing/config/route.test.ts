// Camada de rota — `GET`/`PUT /api/admin/remarketing/config` (o cadastro da régua).
//
// A escala de retomada é uma LISTA (uma linha CSV), não um escalar: por isso ela
// NÃO viaja dentro de `vigentes` — a tela renderiza um `<input type="number">`
// por vigente e, no save, reenviaria um CSV como remoção, apagando a escala. A
// resposta precisa de campo próprio (`escalaDeRetomada`) para a tela ter de onde
// ler a escala e para onde devolvê-la. Estes testes travam essa forma.
//
// Fronteiras de I/O mockadas: `requireRole` e o par ler/gravar do cadastro. A
// validação (`validarEntradas`) é pura e roda de verdade — é ela que recusa a
// escala decrescente.

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { PARAMETROS_DE_FABRICA } from "@/lib/remarketing/regua";

vi.mock("@/lib/admin/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/admin/remarketing-config", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/admin/remarketing-config")>();
	return {
		...real,
		lerCadastroDoRemarketing: vi.fn(),
		gravarCadastro: vi.fn(),
	};
});

const CHAVE_DA_ESCALA = "escala_retomada_minutos";

/** Uma leitura com a escala informada — o resto do cadastro não importa aqui. */
function leituraComEscala(escala: string) {
	return {
		parametros: PARAMETROS_DE_FABRICA,
		vigentes: [],
		escalaDeRetomada: {
			chave: CHAVE_DA_ESCALA,
			valor: escala,
			origem: "cadastro" as const,
			valorInvalido: null,
			minimo: 1,
			maximo: 1440,
			maximoDePassos: 5,
		},
	};
}

let GET: typeof import("./route").GET;
let PUT: typeof import("./route").PUT;
let requireRole: Mock;
let lerCadastroDoRemarketing: Mock;
let gravarCadastro: Mock;

beforeEach(async () => {
	({ GET, PUT } = await import("./route"));
	requireRole = vi.mocked((await import("@/lib/admin/require-role")).requireRole);
	({ lerCadastroDoRemarketing, gravarCadastro } = vi.mocked(
		await import("@/lib/admin/remarketing-config"),
	));
	vi.clearAllMocks();

	requireRole.mockResolvedValue({
		error: null,
		session: { user: { id: "admin-1", email: "admin@aja.com.br", role: "admin" } },
		role: "admin",
	});
	lerCadastroDoRemarketing.mockResolvedValue(leituraComEscala("90,180,300"));
	gravarCadastro.mockResolvedValue(leituraComEscala("90,180,300"));
});

describe("GET /api/admin/remarketing/config", () => {
	it("devolve a escala vigente junto dos parâmetros", async () => {
		const res = await GET();

		expect(res.status).toBe(200);
		const corpo = (await res.json()) as { parametros: unknown[]; escalaDeRetomada: { valor: string } };
		expect(corpo.escalaDeRetomada.valor).toBe("90,180,300");
	});
});

describe("PUT /api/admin/remarketing/config", () => {
	it("grava a escala como CSV e devolve a escala na resposta", async () => {
		gravarCadastro.mockResolvedValueOnce(leituraComEscala("60,120"));

		const res = await PUT(
			new Request("http://localhost/api/admin/remarketing/config", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					parametros: [{ chave: CHAVE_DA_ESCALA, valor: "60,120" }],
				}),
			}),
		);

		expect(res.status).toBe(200);
		expect(gravarCadastro).toHaveBeenCalledWith(
			expect.objectContaining({
				valores: expect.arrayContaining([{ chave: CHAVE_DA_ESCALA, valor: "60,120" }]),
			}),
			"admin-1",
		);
		const corpo = (await res.json()) as { escalaDeRetomada: { valor: string } };
		expect(corpo.escalaDeRetomada.valor).toBe("60,120");
	});

	it("recusa a escala decrescente com o erro no campo", async () => {
		const res = await PUT(
			new Request("http://localhost/api/admin/remarketing/config", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					parametros: [{ chave: CHAVE_DA_ESCALA, valor: "300,100" }],
				}),
			}),
		);

		expect(res.status).toBe(400);
		const corpo = (await res.json()) as { erros: Record<string, string> };
		expect(corpo.erros[CHAVE_DA_ESCALA]).toBeTruthy();
		expect(gravarCadastro).not.toHaveBeenCalled();
	});

	it("sem admin não lê o cadastro nem grava", async () => {
		requireRole.mockResolvedValueOnce({
			error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
			session: null,
			role: null,
		});

		const res = await PUT(
			new Request("http://localhost/api/admin/remarketing/config", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ parametros: [{ chave: CHAVE_DA_ESCALA, valor: "60,120" }] }),
			}),
		);

		expect(res.status).toBe(403);
		expect(gravarCadastro).not.toHaveBeenCalled();
	});
});