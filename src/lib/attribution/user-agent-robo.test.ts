import { describe, expect, it } from "vitest";
import { ehRoboDeclarado, PADRAO_ROBO_SQL } from "./user-agent-robo";

// O que motivou este módulo, medido no banco de produção em 2026-08-15, em 30
// dias: 40.796 visitas registradas, das quais 38.792 (95%) eram robô. Só o
// `ELB-HealthChecker` do nosso próprio ALB — que faz health check em `/` a cada
// 30 segundos, e o matcher do proxy inclui `/` — respondia por 33.382.
//
// O efeito no painel: a taxa visita → conversa aparecia como 0,056% quando a
// real, sobre gente, é 1,15%. Vinte vezes menor. Ninguém decide verba com isso.
describe("ehRoboDeclarado", () => {
	it("reconhece o health check do nosso ALB — a maior fonte de sujeira", () => {
		expect(ehRoboDeclarado("ELB-HealthChecker/2.0")).toBe(true);
	});

	it("reconhece o crawler da Meta, que busca preview de link anunciado", () => {
		expect(
			ehRoboDeclarado("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"),
		).toBe(true);
	});

	it("reconhece cliente de linha de comando e headless", () => {
		expect(ehRoboDeclarado("curl/8.7.1")).toBe(true);
		expect(ehRoboDeclarado("Wget/1.21.3")).toBe(true);
		expect(ehRoboDeclarado("python-requests/2.31.0")).toBe(true);
		expect(ehRoboDeclarado("Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0")).toBe(true);
		expect(ehRoboDeclarado("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
		expect(ehRoboDeclarado("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
	});

	it("trata user-agent ausente ou vazio como robô", () => {
		// Navegador real sempre manda UA. Ausência é cliente programático — e no
		// banco de produção esses 7 registros tinham 1,00 visita por visitante e
		// zero conversas.
		expect(ehRoboDeclarado(null)).toBe(true);
		expect(ehRoboDeclarado("")).toBe(true);
		expect(ehRoboDeclarado("   ")).toBe(true);
	});

	it("NÃO derruba navegador de gente", () => {
		const reais = [
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
			"Mozilla/5.0 (Linux; Android 15; 23129RA5FL Build/AQ3A.240829) AppleWebKit/537.36",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
		];
		for (const ua of reais) {
			expect(ehRoboDeclarado(ua), ua).toBe(false);
		}
	});

	it("não confunde palavra que CONTÉM o token com o token", () => {
		// O caso que quebraria de verdade: "Mozilla/5.0 ... Abbott/1.0" contém
		// "bot" no meio de uma palavra. Casar substring solta derrubaria gente.
		expect(ehRoboDeclarado("Mozilla/5.0 (Windows NT 10.0) Abbott/1.0")).toBe(false);
		expect(ehRoboDeclarado("Mozilla/5.0 (Macintosh) Elaborate/2.0")).toBe(false);
	});

	it("o padrão SQL casa exatamente o que a função casa", () => {
		// Esta é a asserção que impede a duplicação de regra: o proxy filtra em
		// TypeScript e o painel filtra em SQL, e os dois PRECISAM concordar —
		// senão a tela conta como gente o que o proxy jogou fora, ou o contrário.
		const re = new RegExp(PADRAO_ROBO_SQL, "i");
		const amostras = [
			"ELB-HealthChecker/2.0",
			"facebookexternalhit/1.1",
			"curl/8.7.1",
			"Googlebot/2.1",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",
			"Mozilla/5.0 (Windows NT 10.0) Abbott/1.0",
		];
		for (const ua of amostras) {
			expect(re.test(ua), ua).toBe(ehRoboDeclarado(ua));
		}
	});
});
