import { describe, expect, it } from "vitest";

/**
 * P314 — O USAGE DO SDK NÃO É O DO LIVRO-CAIXA.
 *
 * O SDK 6 reporta `inputTokens` como TOTAL do prompt (cache lido e escrito já somados,
 * `convertAnthropicMessagesUsage`). O contrato que os chamadores precisam é a entrada
 * LÍQUIDA em `tokensInput` e o cache em colunas próprias, que é o que `pi/precos.ts`
 * precifica. Este arquivo fixa a conversão nos dois formatos que o SDK de fato entrega:
 * com `inputTokenDetails` e sem ele.
 */

import { normalizarUsoDoSdk } from "./uso-do-sdk";

describe("P314 — normalização do usage do AI SDK", () => {
	it("usage com cache: entrada líquida e parcelas separadas", () => {
		const uso = normalizarUsoDoSdk({
			// Forma do SDK: total = noCacheTokens + cacheReadTokens + cacheWriteTokens.
			inputTokens: 5_200,
			outputTokens: 240,
			inputTokenDetails: {
				noCacheTokens: 3_200,
				cacheReadTokens: 1_800,
				cacheWriteTokens: 200,
			},
		});

		expect(uso).toEqual({
			tokensInput: 3_200,
			tokensOutput: 240,
			cacheRead: 1_800,
			cacheWrite: 200,
		});
	});

	it("sem `inputTokenDetails`, subtrai o cache do total para achar o líquido", () => {
		const uso = normalizarUsoDoSdk({
			inputTokens: 5_000,
			outputTokens: 100,
			// Fallback de provider antigo.
			cachedInputTokens: 2_000,
		});

		expect(uso).toEqual({
			tokensInput: 3_000,
			tokensOutput: 100,
			cacheRead: 2_000,
			cacheWrite: null,
		});
	});

	it("provider que só reporta os totais: cache não medido, entrada é o total", () => {
		const uso = normalizarUsoDoSdk({ inputTokens: 5_200, outputTokens: 240 });

		expect(uso).toEqual({
			tokensInput: 5_200,
			tokensOutput: 240,
			cacheRead: null,
			cacheWrite: null,
		});
	});

	it("cache reportado como ZERO é medido (0), não ausente (null)", () => {
		const uso = normalizarUsoDoSdk({
			inputTokens: 1_000,
			outputTokens: 50,
			inputTokenDetails: { noCacheTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
		});

		expect(uso.cacheRead).toBe(0);
		expect(uso.cacheWrite).toBe(0);
		expect(uso.tokensInput).toBe(1_000);
	});

	it("total menor que o cache (provider inconsistente) não produz entrada negativa", () => {
		const uso = normalizarUsoDoSdk({
			inputTokens: 100,
			outputTokens: 10,
			inputTokenDetails: { cacheReadTokens: 900, cacheWriteTokens: 100 },
		});

		expect(uso.tokensInput).toBe(0);
	});

	it("usage ausente não inventa consumo", () => {
		expect(normalizarUsoDoSdk(undefined)).toEqual({
			tokensInput: 0,
			tokensOutput: 0,
			cacheRead: null,
			cacheWrite: null,
		});
	});
});
