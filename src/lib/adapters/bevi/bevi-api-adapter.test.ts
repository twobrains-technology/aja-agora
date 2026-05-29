import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAdapter, resetAdapter } from "../index";
import { BeviApiAdapter, loadBeviConfigFromEnv } from "./bevi-api-adapter";

// Camada 1 — o adapter Bevi é scaffold seguro: SEM token, falha alto (nunca
// toca produção do parceiro às cegas). Com config explícita, constrói.

describe("BeviApiAdapter — proteção contra hit acidental em produção", () => {
	const prevToken = process.env.BEVI_API_TOKEN;
	const prevAdapter = process.env.ADMINISTRADORA_ADAPTER;

	beforeEach(() => {
		resetAdapter();
		process.env.BEVI_API_TOKEN = undefined;
		// biome-ignore lint/performance/noDelete: precisamos remover a chave, não setar undefined
		delete process.env.BEVI_API_TOKEN;
	});

	afterEach(() => {
		if (prevToken === undefined) delete process.env.BEVI_API_TOKEN;
		else process.env.BEVI_API_TOKEN = prevToken;
		if (prevAdapter === undefined) delete process.env.ADMINISTRADORA_ADAPTER;
		else process.env.ADMINISTRADORA_ADAPTER = prevAdapter;
		resetAdapter();
	});

	it("loadBeviConfigFromEnv lança sem BEVI_API_TOKEN", () => {
		expect(() => loadBeviConfigFromEnv()).toThrow(/token/i);
	});

	it("construir sem token (env) lança — não há fallback silencioso", () => {
		expect(() => new BeviApiAdapter()).toThrow(/não está disponível|token/i);
	});

	it("constrói com config explícita (quando o token chegar)", () => {
		const adapter = new BeviApiAdapter({
			baseUrl: "https://example.test",
			apiToken: "fake-token",
			productId: "prod-1",
		});
		expect(adapter).toBeInstanceOf(BeviApiAdapter);
	});

	it("factory: ADMINISTRADORA_ADAPTER=bevi sem token falha alto", () => {
		process.env.ADMINISTRADORA_ADAPTER = "bevi";
		expect(() => getAdapter()).toThrow(/token|disponível/i);
	});

	it("factory: adapter inválido lista 'mock, bevi' como válidos", () => {
		process.env.ADMINISTRADORA_ADAPTER = "xpto";
		expect(() => getAdapter()).toThrow(/mock, bevi/);
	});
});
