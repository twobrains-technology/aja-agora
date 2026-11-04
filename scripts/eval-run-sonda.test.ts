import { describe, expect, test } from "vitest";

import { alvoEhLocal, escolherSonda, motivoDaSondaPeloApp } from "./eval-run-sonda";

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
