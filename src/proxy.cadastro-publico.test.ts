/**
 * Ninguém se cadastra sozinho no painel.
 *
 * `src/lib/auth.ts` liga `emailAndPassword` e NÃO passa `disableSignUp` — cujo
 * default no better-auth é `false`. Como `src/app/api/auth/[...all]/route.ts`
 * publica o handler inteiro, `POST /api/auth/sign-up/email` ficou aberto para a
 * internet. Conta criada por ali nasce com o default da coluna (`viewer`, em
 * `schema.ts`), e `viewer` tem `TODAS_AS_ROTAS` no `role-scope.ts`: funil,
 * conversas e dados de lead a um cadastro de distância.
 *
 * A trava mora AQUI, e não em `disableSignUp`, por um motivo concreto: aquela
 * opção é conferida dentro do próprio endpoint `/sign-up/email`, e é esse mesmo
 * endpoint que `auth.api.signUpEmail` executa quando o servidor cria uma conta.
 * Ligá-la derrubaria junto os cinco fluxos de convite que o produto usa para
 * existir — `/api/admin/attendants`, `/api/admin/mesa-attendants/[id]/acesso`,
 * `criar-acesso-admin.ts`, `seed-admin.ts` e `seed-mesa-externa.ts`.
 *
 * O proxy separa as duas coisas porque só a requisição que vem de FORA passa por
 * ele: a chamada `auth.api.signUpEmail` é in-process e não atravessa o matcher.
 * Porta fechada para a internet, convite intacto.
 *
 * São dois invariantes e os dois precisam valer juntos — a decisão de barrar, e
 * o `matcher`, que decide se o proxy chega a rodar. Acertar um e esquecer o
 * outro deixa a porta escancarada exatamente como antes, e sem nada na tela para
 * denunciar.
 */

import { pathToRegexp } from "path-to-regexp";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/attribution/visit-store", () => ({ recordWebVisit: vi.fn(async () => {}) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { NextRequest } from "next/server";

import { config, proxy } from "./proxy";

function requisicao(pathname: string, method = "POST") {
	return new NextRequest(new URL(`https://ajaagora.com.br${pathname}`), {
		method,
		headers: { "content-type": "application/json" },
	});
}

describe("o cadastro público está fechado", () => {
	it("barra POST /api/auth/sign-up/email com 403", async () => {
		const resposta = await proxy(requisicao("/api/auth/sign-up/email"));

		expect(resposta.status).toBe(403);
	});

	// Prefixo, e não rota exata: o better-auth serve toda a família de cadastro
	// sob `/sign-up`, e plugin novo (magic-link, passkey) entra por baixo dela.
	// Barrar só o `/email` seria fechar uma porta numa parede de portas.
	it.each([
		"/api/auth/sign-up",
		"/api/auth/sign-up/email",
		"/api/auth/sign-up/qualquer-coisa-nova",
	])("barra %s", async (pathname) => {
		const resposta = await proxy(requisicao(pathname));

		expect(resposta.status).toBe(403);
	});

	it("não atrapalha o login — quem já tem conta continua entrando", async () => {
		const resposta = await proxy(requisicao("/api/auth/sign-in/email"));

		expect(resposta.status).not.toBe(403);
	});

	it("não atrapalha o resto do better-auth (sessão, logout)", async () => {
		for (const pathname of ["/api/auth/get-session", "/api/auth/sign-out"]) {
			const resposta = await proxy(requisicao(pathname, "GET"));

			expect(resposta.status, `${pathname} não deveria ser barrada`).not.toBe(403);
		}
	});
});

describe("o matcher deixa o proxy rodar na rota de cadastro", () => {
	// Fora do matcher o proxy nem é chamado, e a trava acima vira decoração: os
	// testes de comportamento continuariam verdes com a porta aberta em produção.
	const casa = (pathname: string) =>
		config.matcher.some((padrao) => pathToRegexp(padrao).test(pathname));

	it.each([
		"/api/auth/sign-up",
		"/api/auth/sign-up/email",
		"/api/auth/sign-up/qualquer-coisa-nova",
	])("cobre %s", (pathname) => {
		expect(casa(pathname), `${pathname} está fora do matcher — o proxy não roda nela`).toBe(true);
	});

	it("não captura o login nem a sessão", () => {
		expect(casa("/api/auth/sign-in/email")).toBe(false);
		expect(casa("/api/auth/get-session")).toBe(false);
	});
});
