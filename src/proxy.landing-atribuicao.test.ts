/**
 * A visita paga tem que ser gravada em TODA landing, não só na home.
 *
 * As três páginas de vertical (`/autos`, `/imoveis`, `/motos`) nasceram para ser
 * destino de campanha: é nelas que o anúncio de carro, moto e imóvel deve cair.
 * Enquanto o proxy só registrava `/`, quem chegasse por elas não existia para a
 * atribuição — o UTM ia embora com a primeira navegação e a conversa nascia
 * órfã de origem, sem nada quebrar na tela para denunciar.
 *
 * São dois invariantes, e os dois precisam valer junto: a decisão de "isto é
 * uma landing" e o `matcher`, que decide se o proxy chega a rodar. Acertar um e
 * esquecer o outro dá exatamente o mesmo silêncio de antes.
 */

import { pathToRegexp } from "path-to-regexp";
import { beforeEach, describe, expect, it, vi } from "vitest";

type EntradaDeVisita = { landingPath: string; params: Record<string, unknown> };

const recordWebVisit = vi.hoisted(() => vi.fn(async (_entrada: EntradaDeVisita) => {}));

vi.mock("@/lib/attribution/visit-store", () => ({ recordWebVisit }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { NextRequest } from "next/server";

import { config, ehLanding, LANDINGS, proxy } from "./proxy";

// A lista vem do próprio módulo, e não copiada para cá: assim uma vertical nova
// entra no teste sozinha e, se o `matcher` ficar para trás, cai aqui.
const ROTAS = [...LANDINGS];

function chegada(pathname: string, busca = "") {
	return new NextRequest(new URL(`https://ajaagora.com.br${pathname}${busca}`));
}

beforeEach(() => {
	recordWebVisit.mockClear();
});

describe("o proxy grava a chegada em toda landing", () => {
	it.each(ROTAS)("registra a visita em %s", async (pathname) => {
		await proxy(chegada(pathname, "?utm_source=meta&utm_campaign=carro-agosto"));

		expect(recordWebVisit).toHaveBeenCalledTimes(1);
		expect(recordWebVisit.mock.calls[0][0]).toMatchObject({
			landingPath: pathname,
			params: expect.objectContaining({ utmSource: "meta", utmCampaign: "carro-agosto" }),
		});
	});

	it("não conta como chegada uma rota que não é landing", async () => {
		await proxy(chegada("/politica-de-privacidade"));

		expect(recordWebVisit).not.toHaveBeenCalled();
	});
});

describe("o matcher deixa o proxy rodar onde ele precisa rodar", () => {
	// `config.matcher` é o filtro do Next: fora dele o proxy nem é chamado, e
	// nenhuma lógica de dentro tem chance de rodar. É o ponto onde a landing
	// nova é esquecida com mais facilidade, porque some sem erro.
	const casa = (pathname: string) =>
		config.matcher.some((padrao) => pathToRegexp(padrao).test(pathname));

	it.each(ROTAS)("cobre a landing %s", (pathname) => {
		expect(casa(pathname), `${pathname} está fora do matcher — o proxy não roda nela`).toBe(true);
	});

	it("cobre toda rota que `ehLanding` aceita", () => {
		// O par que precisa andar junto: se um dia entrar uma vertical nova em
		// `ehLanding` e o matcher ficar para trás, este teste cai antes de a
		// campanha ir ao ar.
		for (const pathname of ROTAS) {
			expect(ehLanding(pathname)).toBe(true);
			expect(casa(pathname)).toBe(true);
		}
	});

	it("continua guardando o admin, menos o login", () => {
		expect(casa("/admin/pipeline")).toBe(true);
		expect(casa("/admin/login")).toBe(false);
	});
});
