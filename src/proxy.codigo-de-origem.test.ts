/**
 * O cookie que leva o código de origem até o botão do WhatsApp (item A3).
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * O carimbo `(ref a1b2c3d4)` tem três elos: o proxy grava o código num cookie
 * legível por JS, o botão flutuante o lê e o põe no `?text=` do `wa.me`, e o
 * webhook o resolve de volta para a visita. Os elos 2 e 3 estavam cobertos —
 * `codigo-de-origem.test.ts` prova a derivação e a extração,
 * `codigo-de-origem.integration.test.ts` prova a resolução contra o banco.
 *
 * **O elo 1 não tinha teste nenhum**, e é o único que vive no proxy: se o
 * cookie não for gravado, ou nascer `httpOnly`, o botão lê `null`, `carimbarOrigem`
 * devolve a fala intacta — e o item A3 inteiro vira no-op silencioso. Nada
 * quebra, nada fica vermelho, e as conversas de WhatsApp continuam órfãs de
 * origem exatamente como antes. Apontado na revisão crítica desta branch.
 *
 * O que se prova aqui:
 *   1. o cookie é gravado em toda landing;
 *   2. ele é LEGÍVEL por JavaScript — sem isso o botão não o alcança;
 *   3. ele carrega o prefixo do id da visita, e nada além;
 *   4. quem não é visita (robô, preview do painel) não recebe cookie nenhum.
 */

import { pathToRegexp } from "path-to-regexp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordWebVisit = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/attribution/visit-store", () => ({ recordWebVisit }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { NextRequest } from "next/server";

import { COOKIE_CODIGO, codigoDaVisita } from "@/lib/attribution/codigo-de-origem";
import { parseVisitCookie, VISIT_COOKIE } from "@/lib/attribution/visit-cookie";
import { PARAM_PREVIEW } from "@/lib/heatmap/events";
import { config, LANDINGS, proxy } from "./proxy";

/** Um navegador de verdade — sem isso a chegada é máquina, e máquina não é visita. */
const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function chegada(pathname = "/", busca = "", userAgent: string | null = UA_GENTE) {
	return new NextRequest(new URL(`https://ajaagora.com.br${pathname}${busca}`), {
		headers: userAgent ? { "user-agent": userAgent } : {},
	});
}

beforeEach(() => {
	recordWebVisit.mockClear();
});

describe("A3 — o proxy grava o código de origem num cookie legível", () => {
	it.each([...LANDINGS])("grava o cookie em %s", async (pathname) => {
		const resposta = await proxy(chegada(pathname));
		expect(resposta.cookies.get(COOKIE_CODIGO)?.value).toMatch(/^[0-9a-f]{8}$/);
	});

	it("o cookie é LEGÍVEL POR JAVASCRIPT — é o ponto inteiro dele", async () => {
		// O `aja_visit` continua `httpOnly` (é a âncora da visita). Este aqui NÃO
		// pode ser: quem o lê é o `<ChatFlutuante/>`, no navegador. Se nascer
		// httpOnly, `lerCodigoDeOrigemDoCookie` devolve null, a fala sai sem
		// carimbo e o item A3 vira no-op sem nada ficar vermelho.
		const resposta = await proxy(chegada());
		expect(resposta.cookies.get(COOKIE_CODIGO)?.httpOnly).toBe(false);
		// E o par: a âncora da visita continua fechada.
		expect(resposta.cookies.get(VISIT_COOKIE)?.httpOnly).toBe(true);
	});

	it("o código é o prefixo da visita gravada — os dois falam do mesmo objeto", async () => {
		const resposta = await proxy(chegada("/", "?utm_source=facebook&utm_campaign=bofu"));

		const visita = parseVisitCookie(resposta.cookies.get(VISIT_COOKIE)?.value);
		expect(visita).not.toBeNull();
		expect(resposta.cookies.get(COOKIE_CODIGO)?.value).toBe(
			codigoDaVisita(visita?.visitId as string),
		);
	});

	it("não carrega nada além do prefixo — nem UTM, nem id inteiro", async () => {
		// O cookie é público por construção. O que ele expõe tem que ser
		// exatamente o que já vai virar texto na tela do cliente, e nada mais.
		const resposta = await proxy(chegada("/", "?utm_source=facebook&fbclid=IwAR-x"));
		const valor = resposta.cookies.get(COOKIE_CODIGO)?.value ?? "";

		expect(valor).toHaveLength(8);
		expect(valor).not.toContain("-");
		expect(valor).not.toMatch(/facebook|IwAR/);
	});

	it("o cookie viaja em navegação de terceiro domínio (sameSite lax)", async () => {
		// O visitante chega do facebook.com. Com `strict` o cookie não viajaria na
		// navegação de entrada — o mesmo motivo pelo qual o `aja_visit` é lax.
		const resposta = await proxy(chegada());
		expect(resposta.cookies.get(COOKIE_CODIGO)?.sameSite).toBe("lax");
	});

	it("quem NÃO é visita não recebe código", async () => {
		// Robô declarado e o preview do painel não gravam visita — e sem visita não
		// existe origem para carimbar.
		const robo = await proxy(chegada("/", "", "Mozilla/5.0 (compatible; Googlebot/2.1)"));
		expect(robo.cookies.get(COOKIE_CODIGO)).toBeUndefined();

		const preview = await proxy(chegada("/", `?${PARAM_PREVIEW}=1`));
		expect(preview.cookies.get(COOKIE_CODIGO)).toBeUndefined();
	});

	it("rota que não é landing não grava nada", async () => {
		const resposta = await proxy(chegada("/politica-de-privacidade"));
		expect(resposta.cookies.get(COOKIE_CODIGO)).toBeUndefined();
	});

	it("toda landing que grava o cookie está no matcher — senão o proxy nem roda", async () => {
		// Mesmo invariante duplo que `proxy.landing-atribuicao.test.ts` protege: a
		// decisão de "isto é landing" e o `matcher`. Acertar um e esquecer o outro
		// dá o mesmo silêncio.
		for (const pathname of LANDINGS) {
			expect(
				config.matcher.some((padrao) => pathToRegexp(padrao).test(pathname)),
				`${pathname} está fora do matcher — o proxy não roda nela`,
			).toBe(true);
		}
	});
});
