// FIX-291 (a) — cap agregado de tempo pra descoberta de UM turno. Antes deste
// fix, `runDiscovery` só limitava a 1 retry silencioso, mas SEM teto de tempo:
// se o adapter (client+adapter Bevi) demorar/martelar indefinidamente em cada
// tentativa, o tempo total até o marcador de falha soma (tentativa + retry) ×
// (o que quer que o adapter demore) — sem nenhum teto agregado cruzando as
// camadas. Este teste prova que `runDiscovery` agora aborta e degrada
// honestamente dentro de um orçamento agregado curto, mesmo com um adapter que
// nunca resolve (equivalente ao retry empilhado de client+adapter na Bevi
// real: self-contract-client SIM_RETRY×SIM_TIMEOUT_MS + adapter 2 chamadas
// sequenciais — pior caso teórico ~480s sem cap).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import {
	__setDiscoveryBudgetForTests,
	__setDiscoveryRetryDelayForTests,
	buildConsorcioTools,
	isDiscoveryFailedResult,
} from "./ai-sdk";

// biome-ignore lint/suspicious/noExplicitAny: contexto de tool do ai-sdk não é exportado
const TOOL_CTX = { toolCallId: "t", messages: [] } as any;

/** Adapter que NUNCA resolve (simula client+adapter Bevi martelando retry
 * indefinidamente/cold-start crônico) — o pior caso real que o cap agregado
 * precisa conter. */
function hangingAdapter() {
	const state = { searchCalls: 0 };
	const adapter = {
		searchGroups: async () => {
			state.searchCalls++;
			return new Promise<never>(() => {}); // nunca resolve nem rejeita
		},
		simulateQuota: async () => new Promise<never>(() => {}),
		getRates: async () => new Promise<never>(() => {}),
		getGroupDetails: async () => new Promise<never>(() => {}),
	};
	return { adapter, state };
}

describe("FIX-291 (a) — teto agregado de tempo em runDiscovery", () => {
	beforeEach(() => {
		__setDiscoveryRetryDelayForTests(0);
	});
	afterEach(() => {
		__setDiscoveryAdapterFactoryForTests(null);
		__setDiscoveryRetryDelayForTests(null);
		__setDiscoveryBudgetForTests(null);
	});

	it("adapter que nunca resolve: search_groups degrada honestamente DENTRO do orçamento agregado (não fica pendurado)", async () => {
		__setDiscoveryBudgetForTests(50); // teto curto pro teste não esperar 45s reais
		const { adapter } = hangingAdapter();
		__setDiscoveryAdapterFactoryForTests(() => adapter as never);

		const tools = buildConsorcioTools({ conversationId: "conv-291-a" });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");

		const startedAt = Date.now();
		const out = await exec({ category: "auto", creditMin: 20_000, creditMax: 200_000 }, TOOL_CTX);
		const elapsedMs = Date.now() - startedAt;

		expect(isDiscoveryFailedResult(out)).toBe(true);
		// Teto agregado de 50ms: a tentativa + retry (se houver) tem que respeitar
		// o orçamento total, nunca somar tempos independentes por camada. Margem
		// generosa (500ms) só pra jitter do event loop/CI, nunca pra 2×orçamento.
		expect(elapsedMs).toBeLessThan(500);
	});

	it("orçamento já esgotado pela 1ª tentativa: NÃO faz o retry silencioso (nada a ganhar, só mais espera)", async () => {
		__setDiscoveryBudgetForTests(30);
		const { adapter, state } = hangingAdapter();
		__setDiscoveryAdapterFactoryForTests(() => adapter as never);

		const tools = buildConsorcioTools({ conversationId: "conv-291-b" });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");

		await exec({ category: "auto", creditMin: 20_000, creditMax: 200_000 }, TOOL_CTX);
		// 1 chamada real (a 1ª) — o "retry" não reexecuta a função inteira quando
		// o orçamento agregado já não sobra nada (a duplicação que dobrava o pior
		// caso teórico pra ~480s no root cause do FIX-291).
		expect(state.searchCalls).toBe(1);
	});
});
