// Teste do custo por conversa (bloco B12). Hermético: rede e cofre
// substituídos por dublês — nada aqui fala com o Langfuse de verdade.

import { describe, expect, it, vi } from "vitest";
import {
	credenciais,
	custoPorSession,
	executar,
	gravarScoreCusto,
	JANELA_PADRAO_DIAS,
} from "./langfuse-custo-conversa";

const semCofre = () => undefined;

const credValida = {
	baseUrl: "https://langfuse.exemplo",
	publicKey: "pk-teste",
	secretKey: "sk-teste",
};

describe("credenciais", () => {
	it("usa o ambiente quando as três chaves existem", () => {
		expect(
			credenciais(
				{
					LANGFUSE_BASE_URL: "https://do-ambiente",
					LANGFUSE_PUBLIC_KEY: "pk-amb",
					LANGFUSE_SECRET_KEY: "sk-amb",
				},
				semCofre,
			),
		).toEqual({
			baseUrl: "https://do-ambiente",
			publicKey: "pk-amb",
			secretKey: "sk-amb",
		});
	});

	it("recusa quando nem ambiente nem cofre trazem as três", () => {
		expect(credenciais({}, semCofre)).toBeNull();
	});

	it("leva do cofre o que falta no ambiente", () => {
		expect(
			credenciais({ LANGFUSE_PUBLIC_KEY: "pk-amb", LANGFUSE_SECRET_KEY: "sk-amb" }, (chave) =>
				chave === "LANGFUSE_BASE_URL" ? "https://do-cofre" : undefined,
			),
		).toEqual({ baseUrl: "https://do-cofre", publicKey: "pk-amb", secretKey: "sk-amb" });
	});
});

describe("custoPorSession", () => {
	it("descarta sessionId nulo e devolve custo por session", async () => {
		const fetchFn = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				data: [
					{ sessionId: "sess-a", sum_totalCost: 0.0157 },
					{ sessionId: null, sum_totalCost: 0.5 },
					{ sessionId: "", sum_totalCost: 0.3 },
					{ sessionId: "sess-b", sum_totalCost: 0 },
				],
			}),
		});
		const linhas = await custoPorSession(fetchFn, credValida);
		expect(linhas).toEqual([
			{ sessionId: "sess-a", custo: 0.0157 },
			{ sessionId: "sess-b", custo: 0 },
		]);
		const url = fetchFn.mock.calls[0][0] as string;
		expect(url).toContain("/api/public/v2/metrics");
		expect(url).toContain("row_limit");
	});

	it("falha alto em HTTP não-2xx", async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
		await expect(custoPorSession(fetchFn, credValida)).rejects.toThrow("HTTP 500");
	});
});

describe("gravarScoreCusto", () => {
	it("faz POST em /api/public/scores com id determinístico de upsert", async () => {
		const fetchFn = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: "custo_conversa-sess-a" }),
		});
		const resultado = await gravarScoreCusto(fetchFn, credValida, "sess-a", 0.0157);
		expect(resultado.ok).toBe(true);
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toContain("/api/public/scores");
		const corpo = JSON.parse((init as RequestInit).body as string);
		expect(corpo).toMatchObject({
			id: "custo_conversa-sess-a",
			sessionId: "sess-a",
			name: "custo_conversa",
			value: 0.0157,
			dataType: "NUMERIC",
		});
	});

	it("reporta falha sem lançar", async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 409 });
		const resultado = await gravarScoreCusto(fetchFn, credValida, "sess-a", 1);
		expect(resultado).toEqual({ status: 409, ok: false });
	});
});

describe("executar", () => {
	it("é no-op sem credenciais (ok, nada gravado)", async () => {
		const fetchFn = vi.fn();
		const resultado = await executar({}, fetchFn, JANELA_PADRAO_DIAS, semCofre);
		expect(resultado).toEqual({ ok: true, noOp: expect.any(String), pontuadas: [], falhas: [] });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("pontua só sessions com custo > 0 e falha quando o POST falha", async () => {
		let chamadasPost = 0;
		const fetchFn = vi.fn().mockImplementation(async (url: string) => {
			if (String(url).includes("/v2/metrics")) {
				return {
					ok: true,
					json: async () => ({
						data: [
							{ sessionId: "sess-a", sum_totalCost: 0.02 },
							{ sessionId: "sess-b", sum_totalCost: 0 },
						],
					}),
				};
			}
			chamadasPost += 1;
			return {
				ok: false,
				status: 400,
				json: async () => ({}),
			};
		});
		const resultado = await executar(
			{
				LANGFUSE_BASE_URL: "https://do-ambiente",
				LANGFUSE_PUBLIC_KEY: "pk",
				LANGFUSE_SECRET_KEY: "sk",
			},
			fetchFn as unknown as typeof fetch,
		);
		expect(chamadasPost).toBe(1); // só a session com custo > 0
		expect(resultado.ok).toBe(false);
		expect(resultado.falhas[0]).toContain("sess-a");
	});
});
