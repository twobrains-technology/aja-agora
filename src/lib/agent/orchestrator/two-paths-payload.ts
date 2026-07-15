// FIX-229 (docs/02-cards-novos.md CARD 3 — two_paths): bifurcação A/B pra
// quem não vai dar lance. `docs/05-compliance-e-dados.md` proíbe QUALQUER
// métrica de chance/probabilidade de contemplação neste card — a coerção usa
// uma WHITELIST explícita de campos de saída (não spread cego), pra garantir
// que nenhum campo extra da LLM (probability/likelihood/chance) escape.

import type { RecommendedOfferSnapshot } from "./dial-payload";

const TWO_PATHS_DISCLAIMER =
	"Nenhuma das opções é garantia de contemplação — a decisão é sua, não tem certo ou errado.";

/** Coage o payload do `two_paths`: `monthlyPayment`/`administradora` vêm da
 * oferta real ancorada no turno. Whitelist de saída — qualquer campo extra
 * que a LLM mandar (inclusive métrica de chance/probabilidade) é descartado. */
export function coerceTwoPathsPayload(
	input: Record<string, unknown>,
	offer: RecommendedOfferSnapshot | null | undefined,
): Record<string, unknown> {
	// `Number(undefined)` = NaN e `NaN ?? 0` = NaN (o `??` não pega NaN) — sem o
	// guard, oferta ausente virava NaN → o card exibia "R$ 0,00". Filtra pra 0.
	const inputParcela = Number(input.monthlyPayment);
	const monthlyPayment =
		offer?.monthlyPayment ?? (Number.isFinite(inputParcela) ? inputParcela : 0);
	const administradora =
		offer?.administradora ??
		(typeof input.administradora === "string" ? input.administradora : "");
	return {
		monthlyPayment,
		administradora,
		disclaimer: TWO_PATHS_DISCLAIMER,
	};
}
