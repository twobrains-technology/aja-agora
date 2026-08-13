/**
 * A ponte entre "o navegador da atendente" e "o log que a gente consegue ler".
 *
 * O diagnóstico do aviso nasce no cliente, onde ninguém da equipe está olhando.
 * Esta rota é o único jeito de ele chegar até nós sem depender de alguém abrir o
 * DevTools e mandar print — e o que os testes prendem é isso: o evento sai
 * IDENTIFICADO (quem, que papel), rota fechada por sessão, e nenhum corpo torto
 * derruba a requisição.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireRoleMock: vi.fn(),
}));

vi.mock("@/lib/admin/require-role", () => ({ requireRole: mocks.requireRoleMock }));

import { POST } from "./route";

function sessaoDe(nome: string, email: string, role = "mesa_externa") {
	return {
		error: null,
		session: { user: { id: "u1", name: nome, email } },
		role,
	};
}

function pedido(corpo: unknown) {
	return new Request("http://local/api/admin/diagnostico/notificacoes", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
	});
}

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	mocks.requireRoleMock.mockResolvedValue(sessaoDe("Junya Ishigaki Pires", "junya@aja.com.br"));
	log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/admin/diagnostico/notificacoes", () => {
	it("registra o evento com QUEM é a pessoa — sem isso o log não serve pra nada", async () => {
		const res = await POST(
			pedido({
				etapa: "permissao",
				detalhe: { resultado: "denied" },
				ambiente: { temApiDeNotificacao: true, permissao: "denied", contextoSeguro: true },
			}),
		);

		expect(res.status).toBe(200);
		const linha = String(log.mock.calls[0][0]);
		expect(linha).toContain("[notificacoes]");
		expect(linha).toContain("junya@aja.com.br");
		expect(linha).toContain("mesa_externa");
		expect(linha).toContain("permissao");
		expect(linha).toContain("denied");
	});

	it("sem sessão não passa — diagnóstico não é rota aberta", async () => {
		mocks.requireRoleMock.mockResolvedValue({
			error: Response.json({ error: "Unauthorized" }, { status: 401 }),
			session: null,
			role: null,
		});
		const res = await POST(pedido({ etapa: "montagem" }));
		expect(res.status).toBe(401);
		expect(log).not.toHaveBeenCalled();
	});

	it("JSON quebrado responde erro em vez de estourar", async () => {
		const res = await POST(pedido("{isto não é json"));
		expect(res.status).toBe(400);
	});

	it("etapa desconhecida é recusada — o log tem vocabulário fechado", async () => {
		const res = await POST(pedido({ etapa: "" }));
		expect(res.status).toBe(400);
	});

	it("corpo enorme é barrado antes de virar linha de log", async () => {
		const res = await POST(pedido({ etapa: "montagem", detalhe: { lixo: "x".repeat(20_000) } }));
		expect(res.status).toBe(413);
		expect(log).not.toHaveBeenCalled();
	});

	it("valor longo entra cortado — user agent não ocupa a tela do log", async () => {
		await POST(
			pedido({
				etapa: "montagem",
				ambiente: { navegador: "M".repeat(1_000) },
			}),
		);
		const linha = String(log.mock.calls[0][0]);
		expect(linha).not.toContain("M".repeat(500));
		expect(linha).toContain("MMMM");
	});
});
