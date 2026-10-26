// O USAGE DO AI SDK NÃO É O DO NOSSO LIVRO-CAIXA.
//
// O SDK 6 reporta `inputTokens` como o TOTAL do prompt: o que veio do cache e o que foi
// gravado nele já estão somados ali (`convertAnthropicMessagesUsage` do `@ai-sdk/anthropic`
// devolve `total = noCache + cacheRead + cacheWrite`). O livro-caixa (`uso_de_ia`, lido por
// `admin/custo-de-ia.ts` e precificado por `pi/precos.ts`) guarda a entrada LÍQUIDA em
// `tokensInput` e as parcelas de cache em colunas próprias — porque o provedor cobra o token
// relido e o token gravado com preço diferente do token comum.
//
// Quem repassa o usage cru grava o prompt inteiro como entrada de preço cheio: um turno com
// cache fica com custo ERRADO (para mais) em vez de não medido (P314). A normalização mora
// aqui para os chamadores de fora do vendedor terem uma única leitura do contrato.
//
// O recorte fino vem em `inputTokenDetails`; provider que não o reporta cai na subtração pelo
// total. Ausente continua ausente (`null` = não medido) e zero continua zero (medido) — a
// coluna distingue os dois casos, e o custo de um modelo sem preço de cache é `null`, não 0.

import type { LanguageModelUsage } from "ai";

/**
 * O usage que o SDK entrega, aceitando as duas formas reais: o `LanguageModelUsage` completo
 * das chamadas do SDK e o objeto mínimo (só os dois totais) que um provider antigo ou um
 * dublê de teste devolve.
 */
export type UsageDoModelo = Pick<LanguageModelUsage, "inputTokens" | "outputTokens"> & {
	inputTokenDetails?: Partial<LanguageModelUsage["inputTokenDetails"]> | null;
	/** @deprecated no AI SDK 6 (é `inputTokenDetails.cacheReadTokens`) — fallback de provider antigo. */
	cachedInputTokens?: number | null;
};

/** O consumo de uma chamada, na forma que `registrarUsoDeIa` e `pi/precos.ts` esperam. */
export type UsoNormalizado = {
	/** Entrada LÍQUIDA de cache — o que foi cobrado como token de prompt comum. */
	tokensInput: number;
	tokensOutput: number;
	/** Cache lido no provedor. `null` = o provedor não reportou (não é o mesmo que 0). */
	cacheRead: number | null;
	/** Cache gravado no provedor. `null` = o provedor não reportou. */
	cacheWrite: number | null;
};

/** Token reportado: inteiro ≥ 0. Ausente, nulo ou não numérico é `null` (não medido). */
function tokenReportado(valor: number | null | undefined): number | null {
	if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
	return Math.max(0, Math.round(valor));
}

/**
 * Separa o usage do SDK em entrada líquida + parcelas de cache.
 *
 * `usage` ausente (chamada que não reportou nada) devolve zeros e cache `null`: o registrador
 * descarta a linha vazia, em vez de gravar consumo que não houve.
 */
export function normalizarUsoDoSdk(usage: UsageDoModelo | null | undefined): UsoNormalizado {
	const cacheRead = tokenReportado(
		usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens,
	);
	const cacheWrite = tokenReportado(usage?.inputTokenDetails?.cacheWriteTokens);

	const totalInput = tokenReportado(usage?.inputTokens) ?? 0;
	// O detalhamento é a fonte quando existe; sem ele, o líquido é o total menos o que o
	// provedor disse ter vindo/ido para o cache. Se o total vier menor que o cache (provider
	// inconsistente), o líquido é 0 — nunca negativo na coluna.
	const tokensInput =
		tokenReportado(usage?.inputTokenDetails?.noCacheTokens) ??
		Math.max(0, totalInput - (cacheRead ?? 0) - (cacheWrite ?? 0));

	return {
		tokensInput,
		tokensOutput: tokenReportado(usage?.outputTokens) ?? 0,
		cacheRead,
		cacheWrite,
	};
}
