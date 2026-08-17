/**
 * Conta desativada não entra — nem na tela, nem nos dados.
 *
 * "Tirar do ar" no painel é `isActive: false`: é o que faz o
 * `DELETE /api/admin/attendants/[id]`, e é o caminho que
 * `api/admin/mesa-attendants/[id]` documenta como a forma de tirar alguém de
 * circulação (apagar estouraria a FK).
 *
 * Só que o campo era escrito e nunca lido. Nem `proxy.ts`, nem `require-role.ts`,
 * nem `lib/auth.ts` olhavam para ele — grep vazio nos três. Quem já tinha
 * definido a senha continuava com sessão válida e entrava normalmente depois de
 * desativado. O admin clicava em desativar, a linha mudava no banco, a tela
 * dizia que estava feito, e nada acontecia de fato.
 *
 * As duas camadas são testadas juntas de propósito: o proxy tira do MENU, o
 * `requireRole` tira dos DADOS. Fechar só a navegação deixa o `fetch` direto na
 * API funcionando, que é o acesso que importa quando alguém foi desligado.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type UsuarioDaSessao = { id: string; role?: string; isActive?: boolean };

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/attribution/visit-store", () => ({ recordWebVisit: vi.fn(async () => {}) }));

import { NextRequest } from "next/server";

import { proxy } from "../../proxy";
import { requireRole } from "./require-role";

function sessaoDe(user: UsuarioDaSessao) {
	return { user, session: { id: "sess-1" } };
}

function navegacao(pathname: string) {
	return new NextRequest(new URL(`https://ajaagora.com.br${pathname}`));
}

beforeEach(() => {
	getSession.mockReset();
});

describe("requireRole barra a conta desativada", () => {
	it("devolve 403 mesmo com o papel certo", async () => {
		getSession.mockResolvedValue(sessaoDe({ id: "u1", role: "admin", isActive: false }));

		const { error, session } = await requireRole("admin");

		expect(error?.status).toBe(403);
		expect(session).toBeNull();
	});

	it("deixa passar quem está ativo", async () => {
		getSession.mockResolvedValue(sessaoDe({ id: "u1", role: "admin", isActive: true }));

		const { error, role } = await requireRole("admin");

		expect(error).toBeNull();
		expect(role).toBe("admin");
	});

	// Conta antiga, anterior ao campo chegar na sessão, não pode ser expulsa do
	// painel por omissão: ausente é ativo, e só o `false` explícito barra.
	it("trata a ausência do campo como conta ativa", async () => {
		getSession.mockResolvedValue(sessaoDe({ id: "u1", role: "viewer" }));

		const { error } = await requireRole("viewer");

		expect(error).toBeNull();
	});
});

describe("o proxy barra a conta desativada na navegação", () => {
	it("manda para o login em vez de abrir o painel", async () => {
		getSession.mockResolvedValue(sessaoDe({ id: "u1", role: "admin", isActive: false }));

		const resposta = await proxy(navegacao("/admin/performance"));

		expect(resposta.status).toBe(307);
		expect(resposta.headers.get("location")).toContain("/admin/login");
	});

	it("não atrapalha quem está ativo", async () => {
		getSession.mockResolvedValue(sessaoDe({ id: "u1", role: "admin", isActive: true }));

		const resposta = await proxy(navegacao("/admin/performance"));

		expect(resposta.headers.get("location")).toBeNull();
	});
});
