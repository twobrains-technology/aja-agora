import { beforeEach, describe, expect, test, vi } from "vitest";

import {
	alvoEhLocal,
	criarSessaoSimulada,
	ESPERA_MAXIMA_429_MS,
	ESPERA_PADRAO_429_MS,
	enviarTurnoComRetry,
	escolherSonda,
	esperaDoRetry,
	loginAdmin,
	motivoDaSondaPeloApp,
} from "./eval-run-sonda";

describe("escolherSonda", () => {
	test.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://aja-app-develop.orb.local"])(
		"alvo local %s → gateway",
		(url) => {
			expect(alvoEhLocal(url)).toBe(true);
			expect(escolherSonda(url)).toBe("gateway");
		},
	);

	test("alvo remoto → app", () => {
		expect(escolherSonda("https://tb-dev-aja-agora.twobrainstechnology.com")).toBe("app");
	});

	test("EVAL_SONDA força nos dois sentidos", () => {
		expect(escolherSonda("http://localhost:3000", "app")).toBe("app");
		expect(escolherSonda("https://tb-dev-aja-agora.twobrainstechnology.com", "gateway")).toBe(
			"gateway",
		);
		expect(escolherSonda("http://localhost:3000", "lixo")).toBe("gateway");
	});
});

describe("motivoDaSondaPeloApp", () => {
	test("200 com texto → ok", () => {
		expect(motivoDaSondaPeloApp({ httpStatus: 200, agentText: "Oi! Tudo bem?" })).toBeNull();
	});
	test("status ≠ 200, vazio e fala de reserva falham", () => {
		expect(motivoDaSondaPeloApp({ httpStatus: 500, agentText: "", error: "x" })).toMatch(
			/HTTP 500/,
		);
		expect(motivoDaSondaPeloApp({ httpStatus: 200, agentText: "  " })).toMatch(/vazio/);
		expect(
			motivoDaSondaPeloApp({
				httpStatus: 200,
				agentText: "Desculpa, me perdi aqui. Pode me contar de novo o que você quer?",
			}),
		).toMatch(/reserva/);
	});
});

describe("transporte: login único e reenvio em 429", () => {
	const sleep = async (ms: number) => {
		esperas.push(ms);
	};
	const esperas: number[] = [];
	beforeEach(() => {
		esperas.length = 0;
	});

	test("esperaDoRetry usa Retry-After, com teto, e a janela inteira sem header", () => {
		expect(esperaDoRetry("2")).toBe(2500);
		expect(esperaDoRetry("300")).toBe(ESPERA_MAXIMA_429_MS);
		expect(esperaDoRetry(null)).toBe(ESPERA_PADRAO_429_MS);
	});

	test("login faz 429 → espera → 200 e devolve o cookie", async () => {
		const respostas = [
			new Response("x", { status: 429, headers: { "retry-after": "1" } }),
			new Response("{}", { status: 200, headers: { "set-cookie": "a=b" } }),
		];
		const fetchImpl = vi.fn(async () => respostas.shift() as Response);
		const cookie = await loginAdmin("http://x", "e", "p", { fetchImpl, sleep });
		expect(cookie).toContain("a=b");
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(esperas).toEqual([1500]);
	});

	test("login desiste após 3 esperas de 429", async () => {
		const fetchImpl = vi.fn(async () => new Response("x", { status: 429 }));
		await expect(loginAdmin("http://x", "e", "p", { fetchImpl, sleep })).rejects.toThrow(
			"HTTP 429",
		);
		expect(fetchImpl).toHaveBeenCalledTimes(4);
		expect(esperas).toHaveLength(3);
	});

	test("criação de sessão reaproveita o cookie e tenta de novo no 429", async () => {
		const respostas = [
			new Response("x", { status: 429 }),
			new Response(JSON.stringify({ conversationId: "c1" }), { status: 200 }),
		];
		const fetchImpl = vi.fn(async () => respostas.shift() as Response);
		expect(await criarSessaoSimulada("http://x", "ck", { fetchImpl, sleep })).toBe("c1");
		const init = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect((init[1].headers as Record<string, string>).Cookie).toBe("ck");
	});

	test("turno 429 é reenviado e passa; esgotado fica inconclusivo", async () => {
		const seq = [{ httpStatus: 429 }, { httpStatus: 200 }];
		const ok = await enviarTurnoComRetry(async () => seq.shift() as { httpStatus: number }, {
			sleep,
		});
		expect(ok).toEqual({ r: { httpStatus: 200 }, inconclusivo: false });

		const enviar = vi.fn(async () => ({ httpStatus: 429, retryAfterMs: 2000 }));
		const ruim = await enviarTurnoComRetry(enviar, { sleep });
		expect(ruim.inconclusivo).toBe(true);
		expect(enviar).toHaveBeenCalledTimes(4);
	});

	test("erro que não é 429 não reenvia", async () => {
		const enviar = vi.fn(async () => ({ httpStatus: 500 }));
		const r = await enviarTurnoComRetry(enviar, { sleep });
		expect(r.inconclusivo).toBe(false);
		expect(enviar).toHaveBeenCalledTimes(1);
	});
});
