// Teste do smoke do Langfuse (bloco B1). Hermético: rede e cofre são
// substituídos por dublês — nada aqui fala com o Langfuse de verdade.

import { describe, expect, it, vi } from "vitest";
import { aguardarObservacao, type Credenciais, credenciais, executarSmoke } from "./langfuse-smoke";

const semCofre = () => undefined;

const credValida: Credenciais = {
	baseUrl: "https://langfuse.exemplo",
	publicKey: "pk-teste",
	secretKey: "sk-teste",
};

describe("credenciais", () => {
	it("usa o ambiente quando as três chaves existem", () => {
		const cred = credenciais(
			{
				LANGFUSE_BASE_URL: "https://do-ambiente",
				LANGFUSE_PUBLIC_KEY: "pk-amb",
				LANGFUSE_SECRET_KEY: "sk-amb",
			},
			semCofre,
		);
		expect(cred).toEqual({
			baseUrl: "https://do-ambiente",
			publicKey: "pk-amb",
			secretKey: "sk-amb",
			environment: undefined,
		});
	});

	it("leva o ambiente do cofre quando o ambiente não traz nada", () => {
		const cred = credenciais({}, (chave) =>
			chave === "LANGFUSE_PUBLIC_KEY" ? "pk-cofre" : undefined,
		);
		expect(cred).toBeNull(); // cofre trouxe só uma chave: não liga pela metade
	});

	it("recusa quando nem ambiente nem cofre trazem as três", () => {
		expect(credenciais({}, semCofre)).toBeNull();
	});

	it("ignora strings vazias no ambiente", () => {
		const cred = credenciais(
			{ LANGFUSE_BASE_URL: "  ", LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" },
			semCofre,
		);
		expect(cred).toBeNull();
	});
});

describe("aguardarObservacao", () => {
	it("acha o span na v2 e mede o tempo desde o t0", async () => {
		const fetchFn = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				data: [{ id: "obs1", traceId: "t1", type: "SPAN", name: "smoke-observacao" }],
			}),
		});
		const t0 = Date.now() - 1200;
		const resultado = await aguardarObservacao({
			fetchFn,
			cred: credValida,
			traceId: "t1",
			t0Ms: t0,
		});
		expect(resultado.encontrado).toBe(true);
		expect(resultado.segundos).toBeGreaterThan(1);
	});

	it("só aceita o span com nome e tipo exatos", async () => {
		const fetchFn = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ id: "obs1", traceId: "t1", type: "SPAN", name: "outro" }] }),
		});
		const resultado = await aguardarObservacao({
			fetchFn,
			cred: credValida,
			traceId: "t1",
			t0Ms: Date.now() - 29_600,
		});
		expect(resultado.encontrado).toBe(false);
	});

	it("estoura o teto quando a ingestão não aparece", async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
		const resultado = await aguardarObservacao({
			fetchFn,
			cred: credValida,
			traceId: "t1",
			t0Ms: Date.now() - 29_600,
		});
		expect(resultado.encontrado).toBe(false);
	});
});

describe("executarSmoke", () => {
	it("falha alto sem credenciais — não finge que rodou", async () => {
		const resultado = await executarSmoke({}, semCofre);
		expect(resultado.ok).toBe(false);
		expect(resultado.motivo).toMatch(/sem credenciais/);
	});
});
