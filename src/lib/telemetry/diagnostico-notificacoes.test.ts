// @vitest-environment happy-dom
/**
 * Diagnóstico dos avisos de mensagem.
 *
 * Existe porque "não consigo ativar a notificação" chegava sem nenhum rastro: o
 * botão some sozinho quando o navegador não tem a API, a permissão negada não
 * conta o motivo, e o construtor da notificação lança calado em Chrome Android.
 * Do nosso lado, nada.
 *
 * O que estes testes prendem é a única propriedade que importa num diagnóstico:
 * **ele não pode ser o motivo da queda**. Sem `fetch`, com a rede caindo, sem
 * `Notification`, sem `AudioContext` — a tela do atendente continua de pé.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	motivoDeBloqueio,
	motivoDeIndisponibilidade,
	registrarDiagnostico,
	snapshotDeAvisos,
	zerarDiagnostico,
} from "./diagnostico-notificacoes";

function semNotification() {
	(globalThis as { Notification?: unknown }).Notification = undefined;
}

function comNotification(permissao: NotificationPermission) {
	// Função, e não classe: o que o snapshot lê é `Notification.permission` — o
	// construtor nunca é chamado aqui.
	const fake = (() => {}) as unknown as {
		permission: NotificationPermission;
		requestPermission: unknown;
	};
	fake.permission = permissao;
	fake.requestPermission = vi.fn(async () => permissao);
	(globalThis as { Notification?: unknown }).Notification = fake;
}

function contextoSeguro(valor: boolean) {
	Object.defineProperty(window, "isSecureContext", { configurable: true, get: () => valor });
}

function agente(ua: string) {
	Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => ua });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	zerarDiagnostico();
	contextoSeguro(true);
	comNotification("default");
	fetchMock = vi.fn(async () => ({ ok: true }) as Response);
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
	semNotification();
	vi.restoreAllMocks();
});

describe("snapshot do ambiente", () => {
	it("lê o estado que decide se o aviso funciona", () => {
		comNotification("granted");
		const amb = snapshotDeAvisos();
		expect(amb.temApiDeNotificacao).toBe(true);
		expect(amb.permissao).toBe("granted");
		expect(amb.contextoSeguro).toBe(true);
		expect(amb.protocolo).toBeTruthy();
	});

	it("navegador sem a API não quebra a leitura — só marca a ausência", () => {
		semNotification();
		const amb = snapshotDeAvisos();
		expect(amb.temApiDeNotificacao).toBe(false);
		expect(amb.permissao).toBe("sem-api");
	});
});

describe("motivo de indisponibilidade", () => {
	it("com a API presente não há motivo a exibir", () => {
		comNotification("default");
		expect(motivoDeIndisponibilidade(snapshotDeAvisos())).toBeNull();
	});

	it("página fora de HTTPS: o navegador é quem corta, e o texto diz isso", () => {
		semNotification();
		contextoSeguro(false);
		const motivo = motivoDeIndisponibilidade(snapshotDeAvisos());
		expect(motivo).toMatch(/HTTPS|endereço seguro/i);
	});

	it("iPhone fora da tela de início: o aviso só existe com o painel instalado", () => {
		semNotification();
		contextoSeguro(true);
		agente(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
		);
		const motivo = motivoDeIndisponibilidade(snapshotDeAvisos());
		expect(motivo).toMatch(/tela de início/i);
	});
});

describe("motivo do bloqueio", () => {
	it("em página sem HTTPS o conselho do cadeado é INÚTIL — o texto aponta o real", () => {
		comNotification("denied");
		contextoSeguro(false);
		expect(motivoDeBloqueio(snapshotDeAvisos())).toMatch(/HTTPS|endereço seguro/i);
	});

	it("com HTTPS, aí sim o caminho é o cadeado da barra de endereço", () => {
		comNotification("denied");
		contextoSeguro(true);
		expect(motivoDeBloqueio(snapshotDeAvisos())).toMatch(/cadeado/i);
	});
});

describe("registro do diagnóstico", () => {
	it("manda o evento pro servidor com etapa, ambiente e detalhe", async () => {
		registrarDiagnostico("clique", { resultado: "granted" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/api/admin/diagnostico/notificacoes");
		expect(init.method).toBe("POST");
		const corpo = JSON.parse(String(init.body));
		expect(corpo.etapa).toBe("clique");
		expect(corpo.detalhe.resultado).toBe("granted");
		expect(corpo.ambiente.temApiDeNotificacao).toBe(true);
	});

	it("falha de rede no envio NÃO sobe pra tela", async () => {
		fetchMock.mockRejectedValue(new Error("offline"));
		expect(() => registrarDiagnostico("montagem")).not.toThrow();
		await Promise.resolve();
	});

	it("ambiente sem fetch (SSR, webview capada) não quebra", () => {
		(globalThis as { fetch?: unknown }).fetch = undefined;
		expect(() => registrarDiagnostico("montagem")).not.toThrow();
	});

	it("evento repetido não vira enxurrada de POST — mas o clique do usuário sempre vai", () => {
		registrarDiagnostico("aviso", { motivo: "aba-visivel" });
		registrarDiagnostico("aviso", { motivo: "aba-visivel" });
		registrarDiagnostico("aviso", { motivo: "aba-visivel" });
		expect(fetchMock).toHaveBeenCalledTimes(1);

		registrarDiagnostico("clique", { resultado: "default" });
		registrarDiagnostico("clique", { resultado: "default" });
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("motivos diferentes do mesmo evento são eventos diferentes", () => {
		registrarDiagnostico("aviso", { motivo: "aba-visivel" });
		registrarDiagnostico("aviso", { motivo: "sem-permissao" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("tem teto por sessão: painel aberto o dia inteiro não vira canhão de log", () => {
		for (let i = 0; i < 200; i++) registrarDiagnostico("aviso", { motivo: `m${i}` });
		expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(60);
		expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
	});

	it("mesmo sem enviar, o console guarda tudo — é o que o DevTools mostra", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		registrarDiagnostico("aviso", { motivo: "aba-visivel" });
		registrarDiagnostico("aviso", { motivo: "aba-visivel" });
		expect(info).toHaveBeenCalledTimes(2);
		expect(String(info.mock.calls[0][0])).toContain("[notificacoes]");
	});
});
