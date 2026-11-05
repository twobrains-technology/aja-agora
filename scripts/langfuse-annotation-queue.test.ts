// Testes do script da annotation queue (bloco B14). Hermético: rede e cofre
// são dublês — nada aqui fala com o Langfuse de verdade.

import { describe, expect, it, vi } from "vitest";
import {
	executar,
	garantirFila,
	listarMarcados,
	type TraceMarcado,
} from "./langfuse-annotation-queue";

const cred = {
	baseUrl: "https://langfuse.exemplo",
	publicKey: "pk-teste",
	secretKey: "sk-teste",
};

const resposta = (corpo: unknown, status = 200) => ({
	ok: status >= 200 && status < 300,
	status,
	json: async () => corpo,
});

describe("garantirFila", () => {
	it("acha a fila no GET e não cria de novo (idempotente)", async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			resposta({
				data: [{ id: "fila-1", name: "calibracao-juiz", description: null, scoreConfigIds: [] }],
				meta: { page: 1, totalPages: 1 },
			}),
		);
		const { fila, criada } = await garantirFila(fetchFn, cred, ["cfg-1"]);
		expect(criada).toBe(false);
		expect(fila.id).toBe("fila-1");
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("cria quando o GET não traz a fila, com name e scoreConfigIds", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(resposta({ data: [], meta: { page: 1, totalPages: 1 } }))
			.mockResolvedValueOnce(resposta({ id: "fila-nova", name: "calibracao-juiz" }));
		const { fila, criada } = await garantirFila(fetchFn, cred, ["cfg-1", "cfg-2"]);
		expect(criada).toBe(true);
		expect(fila.id).toBe("fila-nova");
		const init = fetchFn.mock.calls[1]![1] as RequestInit;
		expect(JSON.parse(String(init.body))).toEqual({
			name: "calibracao-juiz",
			description: expect.stringContaining("calibração"),
			scoreConfigIds: ["cfg-1", "cfg-2"],
		});
	});
});

describe("listarMarcados", () => {
	it("pede o filtro por valor com dataType=BOOLEAN e value=true", async () => {
		const fetchFn = vi.fn().mockResolvedValue(resposta({ data: [], meta: {} }));
		await listarMarcados(fetchFn, cred, "numero_fora_da_cota");
		const [urlChamada] = fetchFn.mock.calls[0] as unknown as [string];
		expect(urlChamada).toContain("value=true&dataType=BOOLEAN");
		expect(urlChamada).toContain("name=numero_fora_da_cota");
	});

	it("segue o cursor do meta e deduplica por trace", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(
				resposta({
					data: [
						{ id: "s1", name: "numero_fora_da_cota", traceId: "t1" },
						{ id: "s2", name: "numero_fora_da_cota", traceId: "t1" },
					],
					meta: { cursor: "cur-1" },
				}),
			)
			.mockResolvedValueOnce(
				resposta({
					data: [
						{ id: "s3", name: "numero_fora_da_cota", traceId: "t1" },
						{ id: "s4", name: "numero_fora_da_cota", sessionId: "sess-9" },
					],
					meta: {},
				}),
			);
		const marcados = await listarMarcados(fetchFn, cred, "numero_fora_da_cota");
		expect(marcados).toEqual<TraceMarcado[]>([
			{ traceId: "t1", sessionId: null },
			{ traceId: null, sessionId: "sess-9" },
		]);
		expect(fetchFn).toHaveBeenCalledTimes(2);
		const [segunda] = fetchFn.mock.calls[1] as unknown as [string];
		expect(segunda).toContain("cursor=cur-1");
	});
});

describe("executar", () => {
	const credenciaisNoAmbiente = {
		LANGFUSE_BASE_URL: cred.baseUrl,
		LANGFUSE_PUBLIC_KEY: cred.publicKey,
		LANGFUSE_SECRET_KEY: cred.secretKey,
	};

	it("recusa sem credenciais no ambiente e no cofre", async () => {
		await expect(executar({}, () => undefined, vi.fn())).rejects.toThrow(/sem credenciais/);
	});

	it("recusa quando o score config do detector falta na instância", async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			resposta({
				data: [{ id: "c1", name: "numero_fora_da_cota" }],
				meta: { page: 1, totalPages: 1 },
			}),
		);
		await expect(executar(credenciaisNoAmbiente, () => undefined, fetchFn)).rejects.toThrow(
			/promessa_sem_fato/,
		);
	});

	it("enfileira traces marcados e não duplica o que já está na fila", async () => {
		const urls: string[] = [];
		const corpos: string[] = [];
		const fetchFn = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			urls.push(url);
			if (init?.method === "POST") corpos.push(String(init.body));
			if (url.includes("/annotation-queues/") && url.includes("/items?")) {
				return resposta({
					data: [{ objectId: "t1", objectType: "TRACE" }],
					meta: { page: 1, totalPages: 1 },
				});
			}
			if (url.includes("/annotation-queues")) {
				return resposta({
					data: [{ id: "fila-1", name: "calibracao-juiz", description: null, scoreConfigIds: [] }],
					meta: { page: 1, totalPages: 1 },
				});
			}
			if (url.includes("/score-configs")) {
				return resposta({
					data: [
						{ id: "c1", name: "numero_fora_da_cota" },
						{ id: "c2", name: "promessa_sem_fato" },
					],
					meta: { page: 1, totalPages: 1 },
				});
			}
			// scores: t1 marcado (já na fila), t2 marcado (novo)
			if (url.includes("name=numero_fora_da_cota")) {
				return resposta({ data: [{ id: "s1", name: "x", traceId: "t1" }], meta: {} });
			}
			return resposta({ data: [{ id: "s2", name: "x", traceId: "t2" }], meta: {} });
		});
		const resultado = await executar(credenciaisNoAmbiente, () => undefined, fetchFn);
		expect(resultado.ok).toBe(true);
		expect(resultado.pendenteDeDados).toBe(false);
		expect(resultado.jaNaFila).toBe(1);
		expect(resultado.enfileirados).toBe(1);
		expect(corpos.some((c) => JSON.parse(c).objectId === "t2")).toBe(true);
		expect(corpos.some((c) => JSON.parse(c).objectId === "t1")).toBe(false);
	});

	it("reporta PENDENTE de dados quando não há scores reais dos detectores", async () => {
		const fetchFn = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes("/annotation-queues/") && url.includes("/items?")) {
				return resposta({ data: [], meta: { page: 1, totalPages: 1 } });
			}
			if (url.includes("/annotation-queues")) {
				return resposta({
					data: [{ id: "fila-1", name: "calibracao-juiz", description: null, scoreConfigIds: [] }],
					meta: { page: 1, totalPages: 1 },
				});
			}
			if (url.includes("/score-configs")) {
				return resposta({
					data: [
						{ id: "c1", name: "numero_fora_da_cota" },
						{ id: "c2", name: "promessa_sem_fato" },
					],
					meta: { page: 1, totalPages: 1 },
				});
			}
			return resposta({ data: [], meta: {} });
		});
		const resultado = await executar(credenciaisNoAmbiente, () => undefined, fetchFn);
		expect(resultado.pendenteDeDados).toBe(true);
		expect(resultado.enfileirados).toBe(0);
	});
});
