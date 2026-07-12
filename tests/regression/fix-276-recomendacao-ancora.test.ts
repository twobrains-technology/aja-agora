import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { buildConsorcioTools } from "@/lib/agent/tools/ai-sdk";
import { fixtureDiscoveryAdapter } from "../helpers/fixture-discovery-adapter";

// ============================================================================
// FIX-276 (QA do dono, 2026-07-11 — conversa f6c5aec0): pedido de R$ 120.000
// recomendou ITAÚ R$ 150.000 (25% acima do pedido) em vez do BB R$ 120.000
// exato — a recomendação era ancorada no `budget` mensal INVENTADO pelo LLM
// (o usuário nunca informa orçamento, só o valor do bem), não no valor
// pedido. Camada 2: end-to-end pelo limite real da tool (`recommend_groups`
// via `buildConsorcioTools`), com dados REAIS capturados da Bevi (captura
// AUTOS de 2026-05-27, mesma usada por ai-sdk.test.ts) — não são números
// sintéticos, são as 3 ofertas reais da loja-piloto (BB R$ 50.000, ITAÚ
// R$ 54.832, ÂNCORA R$ 42.000).
//
// O `budget` do cenário casa EXATAMENTE a parcela do ITAÚ (R$ 1.009,36) — o
// pior caso possível pra este fix: o budget "inventado" maximiza o
// monthlyFit da carta mais cara/distante do pedido (score 1.0). Mesmo assim,
// a carta que bate o pedido (BB, R$ 50.000 exato) tem que vencer.
//
// Sem o fix, este cenário reproduz o padrão exato do bug real: ITAÚ (mais
// caro, mais distante do pedido) vence BB (bate o pedido) porque
// monthlyFit tinha 40% do peso.
// ============================================================================

describe("FIX-276 — recommend_groups ancora no valor pedido, não no budget inventado (dados reais Bevi)", () => {
	beforeAll(() => __setDiscoveryAdapterFactoryForTests(() => fixtureDiscoveryAdapter()));
	afterAll(() => __setDiscoveryAdapterFactoryForTests(null));

	it("pedido de R$ 50.000 (bate com BB) recomenda BB, não ITAÚ (R$ 54.832, mais caro) mesmo com budget casando a parcela do ITAÚ", async () => {
		const tools = buildConsorcioTools({ conversationId: "00000000-0000-4000-8000-000000000002" });
		const exec = tools.recommend_groups.execute;
		if (!exec) throw new Error("recommend_groups.execute is undefined");
		const result = (await exec(
			{
				category: "auto",
				creditMax: 50_000,
				// Pior caso: budget "inventado" casa EXATAMENTE a parcela do ITAÚ (a
				// carta mais cara/distante do pedido) — o máximo que monthlyFit pode
				// favorecer a opção errada.
				budget: 1_009.36,
				desiredTermMonths: 0,
			},
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as {
			recommendations: Array<{ id: string; administradora: string; creditValue: number }>;
		};

		const recommended = result.recommendations[0];
		// Dado REAL da captura — nunca fictício (mesma garantia do ai-sdk.test.ts).
		expect(["BANCO DO BRASIL", "ITAÚ", "ÂNCORA"]).toContain(recommended.administradora);
		expect(recommended.administradora).toBe("BANCO DO BRASIL");
		expect(recommended.creditValue).toBe(50_000);
		// Invariante do fix: a recomendada não fica acima do valor pedido quando
		// existe opção que bate o pedido.
		expect(recommended.creditValue).toBeLessThanOrEqual(50_000);

		// A opção mais cara/distante do pedido (ITAÚ) não fica na frente da que
		// bate o pedido.
		const itauIndex = result.recommendations.findIndex((r) => r.administradora === "ITAÚ");
		expect(itauIndex, "captura real deveria trazer ITAÚ como alternativa mais cara").toBeGreaterThan(
			0,
		);
	});
});
