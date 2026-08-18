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

import { PARAM_PREVIEW } from "@/lib/heatmap/events";
import { config, ehLanding, LANDINGS, proxy } from "./proxy";

// A lista vem do próprio módulo, e não copiada para cá: assim uma vertical nova
// entra no teste sozinha e, se o `matcher` ficar para trás, cai aqui.
const ROTAS = [...LANDINGS];

/** Um navegador de verdade — sem isso a chegada é máquina, e máquina não é visita. */
const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function chegada(pathname: string, busca = "", userAgent: string | null = UA_GENTE) {
	return new NextRequest(new URL(`https://ajaagora.com.br${pathname}${busca}`), {
		headers: userAgent ? { "user-agent": userAgent } : {},
	});
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

	// A outra metade do mesmo invariante: a landing certa, com a chegada errada.
	//
	// Medido em produção em 15/08/2026: 38.792 das 40.796 visitas de 30 dias
	// eram máquina, e 33.382 delas o health check do NOSSO ALB — que bate em `/`
	// a cada 30 segundos, exatamente a rota que o matcher acima cobre. A taxa de
	// visita → conversa aparecia como 0,056% quando sobre gente é 1,15%.
	it.each([
		["ELB-HealthChecker/2.0", "o health check do nosso ALB"],
		["facebookexternalhit/1.1", "o crawler da Meta"],
		["curl/8.7.1", "cliente de linha de comando"],
	])("não grava visita de %s (%s)", async (userAgent) => {
		await proxy(chegada("/", "?utm_source=meta", userAgent));

		expect(recordWebVisit).not.toHaveBeenCalled();
	});

	it("não grava chegada sem user-agent — navegador real sempre manda", async () => {
		await proxy(chegada("/", "", null));

		expect(recordWebVisit).not.toHaveBeenCalled();
	});

	// O painel embute a landing para desenhar o mapa de calor por cima dela
	// (`visor-do-mapa.tsx`). Aquele iframe é uma requisição HTTP igual às outras:
	// medido em 18/08/2026, abrir a tela do mapa com o cookie de visita vencido
	// levava `visits` de 1 para 2 — o operador entrava no próprio denominador do
	// funil, sem UTM, e derrubava a taxa de conversão de toda campanha.
	it("não conta o preview do mapa de calor como chegada de gente", async () => {
		await proxy(chegada("/", `?${PARAM_PREVIEW}=1`));

		expect(recordWebVisit).not.toHaveBeenCalled();
	});

	it("segue gravando a chegada de verdade na mesma landing", async () => {
		await proxy(chegada("/", "?utm_source=meta"));

		expect(recordWebVisit).toHaveBeenCalledTimes(1);
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
