// O PREÇO DO TURNO — o livro-caixa do `uso_de_ia`.
//
// `custoUsdCents` existia na tabela e NUNCA era escrito: o turno registrava tokens e a
// coluna ficava `null`. O padrão do repo (ver `admin/custo-de-ia.ts`) é o que vale aqui:
// preço desconhecido é "não calculável", nunca zero. Zero é custo medido; `null` é preço que
// não se sabe.

/** Preço em DÓLAR por MILHÃO de tokens, por modelo. Só entra quem tem preço CONHECIDO. */
export const PRECO_USD_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
	"claude-haiku-4-5": { entrada: 1.0, saida: 5.0 },
};

/**
 * O custo do turno em centavos de dólar, ou `null` quando o modelo não tem preço
 * cadastrado. Nunca `0` por ausência.
 */
export function custoDoTurnoCents(args: {
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
}): number | null {
	const preco = PRECO_USD_POR_MILHAO[args.modelo];
	if (!preco) return null;

	const usd =
		(args.tokensInput / 1_000_000) * preco.entrada + (args.tokensOutput / 1_000_000) * preco.saida;
	return Math.round(usd * 100);
}
