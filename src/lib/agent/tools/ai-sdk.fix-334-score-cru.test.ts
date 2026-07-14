// FIX-334 (rodada 2, loop-de-goal desamarra, veredito Sonnet rodada 1 —
// dossiê imóvel): o agente citou "score de 73%" na fala, regressão contra
// decisão de produto já registrada (FIX-7, `score-label.ts`) — o card NUNCA
// mostra o % numérico, só o rótulo qualitativo ("boa aderência"), justamente
// porque "% numérico baixo mina a confiança". A regra existia pro CARD, mas
// nada impedia o MODELO de falar o número: `recommend_groups` devolvia
// `score`/`scoreBreakdown` CRUS (0-1) no tool-result, e o `system-prompt.ts`
// (linha ~677) até instruía o modelo a ler esse número pra escolher palavras.
//
// Correção: o payload que o MODELO recebe de `recommend_groups` deixa de
// carregar `score`/`scoreBreakdown` numéricos — só o `scoreLabel` qualitativo
// (mesma função `recommendationFitLabel` do card). O card em si não perde
// nada: `coerceRecommendationPayload` passa a RECALCULAR score/breakdown a
// partir do grupo real (scoreGroup, recommendation.ts), nunca do que o
// modelo ecoou.

import { afterEach, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { fixtureDiscoveryAdapter } from "../../../../tests/helpers/fixture-discovery-adapter";
import { buildConsorcioTools } from "./ai-sdk";

// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx não é exportado publicamente
const FAKE_TOOL_CTX = { toolCallId: "t", messages: [] } as any;

afterEach(() => {
	__setDiscoveryAdapterFactoryForTests(null);
});

describe("FIX-334 — score numérico cru não chega ao modelo via recommend_groups", () => {
	it("payload de recommend_groups não contém score nem scoreBreakdown numéricos — só scoreLabel", async () => {
		const adapter = fixtureDiscoveryAdapter();
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const tools = buildConsorcioTools({
			conversationId: "00000000-0000-4000-8000-000000000020",
		});
		const recommendExec = tools.recommend_groups.execute;
		if (!recommendExec) throw new Error("recommend_groups.execute undefined");

		const result = (await recommendExec(
			{
				category: "auto",
				creditMin: 20_000,
				creditMax: 60_000,
				budget: 1_200,
				desiredTermMonths: 0,
			},
			FAKE_TOOL_CTX,
		)) as {
			recommendations: Array<Record<string, unknown>>;
		};

		expect(result.recommendations.length).toBeGreaterThan(0);
		for (const rec of result.recommendations) {
			expect(rec.score).toBeUndefined();
			expect(rec.scoreBreakdown).toBeUndefined();
			expect(typeof rec.scoreLabel).toBe("string");
			expect((rec.scoreLabel as string).length).toBeGreaterThan(0);
		}
		// Nenhum valor no JSON inteiro parece um score cru 0-1 vazando por outro
		// nome — serializa e garante que não sobrou "0.xx" solto nos campos.
		expect(JSON.stringify(result)).not.toMatch(/"score":\s*0\.\d+/);
	});
});
