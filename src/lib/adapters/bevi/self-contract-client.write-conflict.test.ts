import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// "write conflict" da Bevi — retry + serialização por proposta
// ----------------------------------------------------------------------------
// A Bevi de homologação usa UM único proposal-hash pra todas as conversas. Duas
// escritas concorrentes no mesmo proposal fazem a API devolver:
//
//   "Caused by :: Write conflict during plan execution and yielding is disabled.
//    :: Please retry your operation or multi-document transaction."
//
// Achado no QA ao vivo (2026-07-14): no turno do reveal o modelo chama
// search_groups + recommend_groups (+ simulate_quota) — cada um bate no MESMO
// proposal — e a jornada morre INTERMITENTEMENTE com "não consegui carregar as
// opções agora". A mesma jornada tinha funcionado minutos antes. É race pura.
//
// A própria mensagem da API manda retentar, e não havia retry nenhum pra esse
// caso (o único retry existente era `retryOn404`, do step de simulação).
// ============================================================================

const CONFIG = {
	baseUrl: "https://bevi.test",
	hash: "hash-teste",
	productId: "prod-1",
} as never;

const envOk = (data: unknown = { ok: true }) => ({ success: true, code: 200, data });
const ENV_WRITE_CONFLICT = {
	success: false,
	code: 500,
	message:
		"Caused by :: Write conflict during plan execution and yielding is disabled. :: Please retry your operation or multi-document transaction.",
};

const resp = (body: unknown) => ({ json: async () => body }) as unknown as Response;

describe("Bevi self-contract — write conflict", () => {
	beforeEach(() => {
		vi.resetModules();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("retenta quando a Bevi devolve write conflict (a própria API pede retry)", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce(resp(ENV_WRITE_CONFLICT))
			.mockResolvedValueOnce(resp(envOk()));
		vi.stubGlobal("fetch", fetchSpy);

		const { BeviSelfContractClient } = await import("./self-contract-client");
		const client = new BeviSelfContractClient(CONFIG);

		await expect(client.setSegment("auto")).resolves.toBeUndefined();
		expect(
			fetchSpy.mock.calls.length,
			"write conflict tem que ser retentado — não pode matar a jornada",
		).toBe(2);
	});

	it("escritas concorrentes na MESMA proposta são serializadas (é isso que gera o conflito)", async () => {
		let emVoo = 0;
		let maxConcorrente = 0;
		const fetchSpy = vi.fn().mockImplementation(async () => {
			emVoo += 1;
			maxConcorrente = Math.max(maxConcorrente, emVoo);
			await new Promise((r) => setTimeout(r, 5));
			emVoo -= 1;
			return resp(envOk());
		});
		vi.stubGlobal("fetch", fetchSpy);

		const { BeviSelfContractClient } = await import("./self-contract-client");
		const client = new BeviSelfContractClient(CONFIG);

		await Promise.all([
			client.setSegment("auto"),
			client.setSegment("moto"),
			client.setSegment("imovel"),
		]);

		expect(
			maxConcorrente,
			"duas escritas no mesmo proposal NÃO podem sair em paralelo — é exatamente a race que a Bevi rejeita",
		).toBe(1);
	});
});
