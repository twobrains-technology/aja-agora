// O PREÇO DO TURNO — o livro-caixa do `uso_de_ia`.
//
// `custoUsdCents` existia na tabela e NUNCA era escrito: o turno registrava tokens e a
// coluna ficava `null`. O padrão do repo (ver `admin/custo-de-ia.ts`) é o que vale aqui:
// preço desconhecido é "não calculável", nunca zero. Zero é custo medido; `null` é preço que
// não se sabe.
//
// ── Duas funções, e a diferença entre elas é a precisão ─────────────────────
//
// `custoDoTurnoUsd` / `custoDoTurnoCentsExatos` devolvem o valor EXATO, com a fração de
// centavo preservada. `custoDoTurnoCents` é a versão ARREDONDADA, que existe só porque o
// campo da tabela (`uso_de_ia.custo_usd_cents`) é inteiro em centavos. Quem soma custo (a
// agregação do admin) usa a versão EXATA e arredonda uma vez no fim — arredondar por beat
// antes de somar zera consumo de modelo barato, que é justamente o default do vendedor.
//
// Modelo sem preço cadastrado NÃO vira zero: a função devolve `null` e o modelo é avisado
// no log (uma vez por modelo e processo, para não inundar o log de um turno com dezenas de
// beats).

/** Preço em DÓLAR por MILHÃO de tokens, por modelo. Só entra quem tem preço CONHECIDO. */
export const PRECO_USD_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
	"claude-haiku-4-5": { entrada: 1.0, saida: 5.0 },
	// O modelo DEFAULT do vendedor em dev — `AI_MODEL` do `.env.example` e o fallback de
	// `pi/sessao.ts` (`modeloDoAgente`) e `pi/turno-livre.ts`. Sem esta linha, TODO turno do
	// vendedor saía sem custo e o CPC não fechava (`modelo_sem_preco` na tela de custo).
	// Tabela pública do provedor (Alibaba DashScope, faixa de contexto até 128K).
	"qwen3.6-flash": { entrada: 0.05, saida: 0.4 },
};

/** Os modelos que já foram avisados como "sem preço" — o log avisa uma vez, não por beat. */
const MODELOS_SEM_PRECO_JA_AVISADOS = new Set<string>();

/**
 * A chave de preço de um id de modelo: minúsculo, sem espaço e sem o sufixo de DATA que
 * o provedor carimba (`claude-haiku-4-5-20251001` é o mesmo modelo que `claude-haiku-4-5`).
 */
function chaveDoModelo(modelo: string): string {
	return modelo
		.trim()
		.toLowerCase()
		.replace(/-\d{8}$/, "");
}

/** O preço do modelo, ou `null` quando ele não está cadastrado. */
export function precoDoModelo(modelo: string): { entrada: number; saida: number } | null {
	return PRECO_USD_POR_MILHAO[chaveDoModelo(modelo)] ?? null;
}

/** Avisa no log que o modelo não tem preço — uma vez por modelo, por processo. */
function avisarModeloSemPreco(modelo: string): void {
	const chave = chaveDoModelo(modelo);
	if (MODELOS_SEM_PRECO_JA_AVISADOS.has(chave)) return;
	MODELOS_SEM_PRECO_JA_AVISADOS.add(chave);
	console.warn(
		`[precos] modelo sem preço cadastrado: "${modelo}" — custo fica null (não calculável), nunca 0. Cadastre em PRECO_USD_POR_MILHAO.`,
	);
}

/**
 * O custo do turno em DÓLAR, EXATO (sem arredondar), ou `null` quando o modelo não tem
 * preço cadastrado. Nunca `0` por ausência.
 */
export function custoDoTurnoUsd(args: {
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
}): number | null {
	const preco = precoDoModelo(args.modelo);
	if (!preco) {
		avisarModeloSemPreco(args.modelo);
		return null;
	}

	return (
		(args.tokensInput / 1_000_000) * preco.entrada + (args.tokensOutput / 1_000_000) * preco.saida
	);
}

/**
 * O custo do turno em centavos de DÓLAR, EXATO — a fração de centavo é preservada, para
 * que a soma de vários beats não perca o consumo deles.
 */
export function custoDoTurnoCentsExatos(args: {
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
}): number | null {
	const usd = custoDoTurnoUsd(args);
	return usd === null ? null : usd * 100;
}

/**
 * O custo do turno em centavos INTEIROS — o que o campo `uso_de_ia.custo_usd_cents`
 * aceita hoje. Este é o ÚNICO ponto que arredonda o valor gravado; quem soma usa
 * `custoDoTurnoCentsExatos`.
 */
export function custoDoTurnoCents(args: {
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
}): number | null {
	const centavos = custoDoTurnoCentsExatos(args);
	return centavos === null ? null : Math.round(centavos);
}
