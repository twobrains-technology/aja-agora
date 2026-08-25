/**
 * O prefetch do roteador não é uma pessoa chegando.
 *
 * Medido em produção em 24/08/2026, e reproduzido duas vezes no navegador: UMA
 * navegação até a home com UTM gravava QUATRO linhas em `visits`. A cadeia:
 *
 * 1. Depois da hidratação, o App Router dispara `fetch` de prefetch para a
 *    própria rota — três deles, no mesmo milissegundo. Como a URL corrente
 *    carrega os UTMs, o prefetch os carrega junto, e a única marca que o
 *    distingue de gente é o parâmetro `_rsc`.
 * 2. A trava que o proxy acreditava ter não dispara: medido contra produção e
 *    contra o ALB (sem o Cloudflare no meio), `rsc` e `next-router-prefetch`
 *    chegam ao roteador do Next mas voltam `null` em `request.headers` aqui
 *    dentro. Só `purpose: prefetch` funciona — e nenhum navegador atual manda
 *    esse header.
 * 3. `decideVisit` fecha a armadilha: com campanha na URL a visita é SEMPRE
 *    nova, então o cookie não absorve as repetições.
 *
 * O estrago não é cosmético. Em 24/08 foram 390 das 756 "chegadas" do dia —
 * 51,6% — e só no tráfego pago, que é 100% do investimento em mídia. A tela de
 * Performance dizia 756 chegadas e 1,1% de entrada no chat; sobre gente de
 * verdade o denominador é 261 e a taxa é o triplo. É a diferença entre demitir
 * uma campanha e renová-la.
 *
 * Por que a marca é o PARÂMETRO e não o header: o `_rsc` é o que o Next põe na
 * URL do prefetch (é ele que a doc manda o CDN usar como chave de cache), e é o
 * único sinal que este teste conseguiu observar chegando de verdade. Os headers
 * continuam checados porque são o contrato documentado — mas não dá para
 * depender só deles, e era exatamente isso que se fazia.
 */

import { pathToRegexp } from "path-to-regexp";
import { beforeEach, describe, expect, it, vi } from "vitest";

type EntradaDeVisita = { landingPath: string; params: Record<string, unknown> };

const recordWebVisit = vi.hoisted(() => vi.fn(async (_entrada: EntradaDeVisita) => {}));

vi.mock("@/lib/attribution/visit-store", () => ({ recordWebVisit }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

const UA_GENTE =
	"Mozilla/5.0 (Linux; Android 16; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";

/** Os UTMs que o anúncio traz — e que o prefetch copia junto, que é o problema. */
const UTM = "utm_source=ig&utm_medium=paid&utm_content=120250998207800104";

function requisicao(busca: string, cabecalhos: Record<string, string> = {}) {
	return new NextRequest(new URL(`https://ajaagora.com.br/?${busca}`), {
		headers: { "user-agent": UA_GENTE, ...cabecalhos },
	});
}

beforeEach(() => {
	recordWebVisit.mockClear();
});

describe("o prefetch do App Router não vira visita", () => {
	it("não grava chegada quando a URL traz `_rsc` — a marca do prefetch", async () => {
		// A forma EXATA observada no navegador em 24/08/2026: os UTMs presentes,
		// porque o prefetch herda a query da página, e `_rsc` como única diferença.
		await proxy(requisicao(`${UTM}&_rsc=1ab2c`));

		expect(recordWebVisit).not.toHaveBeenCalled();
	});

	it("uma navegação com três prefetches grava UMA visita, não quatro", async () => {
		// A rajada de produção, na ordem em que acontece.
		await proxy(requisicao(UTM));
		await proxy(requisicao(`${UTM}&_rsc=1ab2c`));
		await proxy(requisicao(`${UTM}&_rsc=9de4f`));
		await proxy(requisicao(`${UTM}&_rsc=7c0d1`));

		expect(recordWebVisit).toHaveBeenCalledTimes(1);
	});

	it("ignora o prefetch anunciado por `Sec-Purpose`, que é o header dos navegadores de hoje", async () => {
		// O código checava `purpose: prefetch`, que é a grafia antiga. Chrome manda
		// `Sec-Purpose: prefetch;prerender` desde as Speculation Rules.
		await proxy(requisicao(UTM, { "sec-purpose": "prefetch;prerender" }));

		expect(recordWebVisit).not.toHaveBeenCalled();
	});

	it.each([
		["rsc", "1"],
		["next-router-prefetch", "1"],
		["purpose", "prefetch"],
	])("continua ignorando o prefetch anunciado por `%s`", async (chave, valor) => {
		await proxy(requisicao(UTM, { [chave]: valor }));

		expect(recordWebVisit).not.toHaveBeenCalled();
	});
});

describe("a chegada de gente continua sendo gravada", () => {
	it("grava a navegação normal com campanha", async () => {
		await proxy(requisicao(UTM));

		expect(recordWebVisit).toHaveBeenCalledTimes(1);
		expect(recordWebVisit.mock.calls[0][0]).toMatchObject({
			landingPath: "/",
			params: expect.objectContaining({ utmSource: "ig", utmMedium: "paid" }),
		});
	});

	it("grava a chegada direta, sem parâmetro nenhum", async () => {
		await proxy(
			new NextRequest(new URL("https://ajaagora.com.br/"), {
				headers: { "user-agent": UA_GENTE },
			}),
		);

		expect(recordWebVisit).toHaveBeenCalledTimes(1);
	});

	it("um parâmetro parecido com `_rsc` não derruba a chegada", async () => {
		// Guarda contra um `startsWith`/`includes` frouxo: quem chega com
		// `?_rsca=1` ou `?rsc=1` é gente, e some do funil se a checagem for por
		// substring em vez de nome exato de parâmetro.
		await proxy(requisicao(`${UTM}&_rsca=1`));
		await proxy(requisicao(`${UTM}&rsc=1`));

		expect(recordWebVisit).toHaveBeenCalledTimes(2);
	});
});

describe("o matcher continua deixando o proxy rodar na home", () => {
	it("a rota `/` está no matcher — sem isso nada aqui é exercitado em produção", () => {
		const casa = config.matcher.some((padrao) => pathToRegexp(padrao).test("/"));

		expect(casa).toBe(true);
	});
});
