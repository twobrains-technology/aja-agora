// FIX-186 (Kairo 2026-07-01) — erro de descoberta na Bevi vira DIRETIVA
// determinística (retry silencioso + marcador), NUNCA re-lança (que viraria
// tool-error narrado pelo modelo: "dificuldade técnica pontual"). Aqui provamos
// a camada de TOOL: runDiscovery faz 1 retry em erro transitório, retorna o
// marcador `__discoveryFailed` na falha (sem throw), e curto-circuita as tools
// de descoberta seguintes do MESMO turno (não martela a Bevi).
//
// Sem DB: injeta um adapter que lança via __setDiscoveryAdapterFactoryForTests.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { BeviApiError, BeviConfigError } from "@/lib/adapters/bevi/bevi-errors";
import {
	__setDiscoveryRetryDelayForTests,
	buildConsorcioTools,
	isDiscoveryFailedResult,
} from "./ai-sdk";

// biome-ignore lint/suspicious/noExplicitAny: contexto de tool do ai-sdk não é exportado
const TOOL_CTX = { toolCallId: "t", messages: [] } as any;

/** Adapter fake que conta chamadas e lança o erro escolhido em searchGroups
 * (search_groups e recommend_groups roteiam por aqui). Opcionalmente sucede a
 * partir da N-ésima tentativa. */
function throwingAdapter(opts: { error: unknown; succeedFromAttempt?: number }) {
	const state = { searchCalls: 0 };
	const adapter = {
		searchGroups: async () => {
			state.searchCalls++;
			if (opts.succeedFromAttempt && state.searchCalls >= opts.succeedFromAttempt) {
				return [];
			}
			throw opts.error;
		},
		simulateQuota: async () => {
			throw opts.error;
		},
		getRates: async () => {
			throw opts.error;
		},
		getGroupDetails: async () => {
			throw opts.error;
		},
	};
	return { adapter, state };
}

describe("FIX-186 — runDiscovery converte erro de descoberta em diretiva (retry + marcador)", () => {
	beforeEach(() => {
		__setDiscoveryRetryDelayForTests(0); // sem espera real no teste
	});
	afterEach(() => {
		__setDiscoveryAdapterFactoryForTests(null);
		__setDiscoveryRetryDelayForTests(null);
	});

	it("erro TRANSITÓRIO: 1 retry silencioso, e na falha retorna marcador (NUNCA lança)", async () => {
		const { adapter, state } = throwingAdapter({ error: new BeviApiError(503, "unavailable") });
		__setDiscoveryAdapterFactoryForTests(() => adapter as never);

		const tools = buildConsorcioTools({ conversationId: "conv-186-a" });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const out = await exec({ category: "auto", creditMin: 20_000, creditMax: 200_000 }, TOOL_CTX);

		expect(isDiscoveryFailedResult(out)).toBe(true);
		expect(state.searchCalls).toBe(2); // 1 tentativa + 1 retry
	});

	it("erro TRANSITÓRIO que cura no retry: retorna o resultado REAL (não marcador)", async () => {
		const { adapter, state } = throwingAdapter({
			error: new BeviApiError(500, "boom"),
			succeedFromAttempt: 2,
		});
		__setDiscoveryAdapterFactoryForTests(() => adapter as never);

		const tools = buildConsorcioTools({ conversationId: "conv-186-b" });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const out = await exec({ category: "auto", creditMin: 20_000, creditMax: 200_000 }, TOOL_CTX);

		expect(isDiscoveryFailedResult(out)).toBe(false);
		expect((out as { groups?: unknown[] }).groups).toEqual([]);
		expect(state.searchCalls).toBe(2);
	});

	it("erro DURO (config/403): SEM retry, marcador direto", async () => {
		const { adapter, state } = throwingAdapter({ error: new BeviConfigError("sem token", 403) });
		__setDiscoveryAdapterFactoryForTests(() => adapter as never);

		const tools = buildConsorcioTools({ conversationId: "conv-186-c" });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const out = await exec({ category: "auto", creditMin: 20_000, creditMax: 200_000 }, TOOL_CTX);

		expect(isDiscoveryFailedResult(out)).toBe(true);
		expect(state.searchCalls).toBe(1); // duro não retenta
	});

	it("curto-circuito: após a descoberta falhar no turno, a próxima tool NÃO toca a Bevi", async () => {
		const { adapter, state } = throwingAdapter({ error: new BeviApiError(503, "unavailable") });
		__setDiscoveryAdapterFactoryForTests(() => adapter as never);

		// MESMA instância de tools = mesmo turno/closure.
		const tools = buildConsorcioTools({ conversationId: "conv-186-d" });
		const searchExec = tools.search_groups.execute;
		const recExec = tools.recommend_groups.execute;
		if (!searchExec || !recExec) throw new Error("execute undefined");

		await searchExec({ category: "auto", creditMin: 20_000, creditMax: 200_000 }, TOOL_CTX);
		const callsAfterSearch = state.searchCalls; // 2 (1 + retry)

		const out2 = await recExec(
			{ category: "auto", creditMin: 20_000, creditMax: 200_000, budget: 1000, desiredTermMonths: 60 },
			TOOL_CTX,
		);
		expect(isDiscoveryFailedResult(out2)).toBe(true);
		// recommend_groups curto-circuitou — NÃO chamou o adapter de novo.
		expect(state.searchCalls).toBe(callsAfterSearch);
	});

	it("marcador carrega uma diretiva pro modelo (o modelo não narra erro cru — o sistema conduz)", async () => {
		const { adapter } = throwingAdapter({ error: new BeviApiError(503, "unavailable") });
		__setDiscoveryAdapterFactoryForTests(() => adapter as never);
		const tools = buildConsorcioTools({ conversationId: "conv-186-e" });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const out = (await exec(
			{ category: "auto", creditMin: 20_000, creditMax: 200_000 },
			TOOL_CTX,
		)) as { __discoveryFailed?: boolean; error?: string };

		expect(out.__discoveryFailed).toBe(true);
		expect(typeof out.error).toBe("string");
	});
});
