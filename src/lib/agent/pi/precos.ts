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
//
// ── O CACHE DO PROMPT ENTRA NA CONTA ────────────────────────────────────────
//
// O provedor cobra três coisas, não duas: entrada, saída e o CACHE do prompt (o token
// relido do cache sai mais barato, o token gravado nele sai mais caro). O turno do vendedor
// repete a mesma caixa de prompt a cada beat, então o cache é a parcela que decide o custo
// real — deixá-lo fora do livro-caixa subestimava o gasto de IA (P217/P273).
//
// Preço de cache só entra na tabela para o modelo cujo provedor PUBLICA esse preço. Se o
// turno gastou cache e o modelo não tem o preço correspondente, o custo do turno é
// DESCONHECIDO (`null`) — somar só entrada e saída seria um número inventado com cara de
// medição.

/**
 * O preço de UM modelo, em DÓLAR por MILHÃO de tokens.
 *
 * `cacheLeitura`/`cacheEscrita` só existem quando o provedor PUBLICA preço próprio para o
 * cache do prompt. Modelo que não publica tem o cache a preço DESCONHECIDO (ver
 * `custoDoTurnoUsd`), nunca a zero.
 */
export interface PrecoDoModelo {
	entrada: number;
	saida: number;
	/** Token relido do cache do provedor (o prompt repetido que não é cobrado como entrada). */
	cacheLeitura?: number;
	/** Token gravado NO cache do provedor — o provedor cobra a escrita mais caro que a entrada. */
	cacheEscrita?: number;
}

/** Preço em DÓLAR por MILHÃO de tokens, por modelo. Só entra quem tem preço CONHECIDO. */
export const PRECO_USD_POR_MILHAO: Record<string, PrecoDoModelo> = {
	// Tabela pública do provedor: cache lido a 10% da entrada, cache escrito a 125%.
	"claude-haiku-4-5": { entrada: 1.0, saida: 5.0, cacheLeitura: 0.1, cacheEscrita: 1.25 },
	// O modelo DEFAULT do vendedor em dev — `AI_MODEL` do `.env.example` e o fallback de
	// `pi/sessao.ts` (`modeloDoAgente`) e `pi/turno-livre.ts`. Sem esta linha, TODO turno do
	// vendedor saía sem custo e o CPC não fechava (`modelo_sem_preco` na tela de custo).
	// Tabela pública do provedor (Alibaba DashScope, faixa de contexto até 128K). O provedor
	// não publica preço de CACHE para este modelo — então ele fica de fora, e turno com
	// cache reportado por ele tem custo DESCONHECIDO (nunca inventado).
	"qwen3.6-flash": { entrada: 0.05, saida: 0.4 },
};

/** Os modelos que já foram avisados como "sem preço" — o log avisa uma vez, não por beat. */
const MODELOS_SEM_PRECO_JA_AVISADOS = new Set<string>();

/** Idem, para o preço de CACHE — o aviso é outro, e a ação de quem opera também. */
const MODELOS_SEM_PRECO_DE_CACHE_JA_AVISADOS = new Set<string>();

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
export function precoDoModelo(modelo: string): PrecoDoModelo | null {
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

/** Avisa que o modelo gastou cache e não tem preço de cache cadastrado. Uma vez por modelo. */
function avisarModeloSemPrecoDeCache(modelo: string): void {
	const chave = chaveDoModelo(modelo);
	if (MODELOS_SEM_PRECO_DE_CACHE_JA_AVISADOS.has(chave)) return;
	MODELOS_SEM_PRECO_DE_CACHE_JA_AVISADOS.add(chave);
	console.warn(
		`[precos] modelo sem preço de CACHE cadastrado: "${modelo}" — o gasto de cache é desconhecido, então o custo do turno fica null (nunca 0). Cadastre cacheLeitura/cacheEscrita em PRECO_USD_POR_MILHAO.`,
	);
}

/**
 * O que UM turno (ou beat) consumiu do modelo.
 *
 * `cacheRead`/`cacheWrite` são o recorte de CACHE do prompt que o provedor reportou. Ausentes
 * ou zero = o provedor não cobrou cache — e não é o mesmo que "não medido": quem decide isso é
 * quem chama, que grava `null` na coluna em vez de 0.
 */
export type ConsumoDoTurno = {
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
	cacheRead?: number;
	cacheWrite?: number;
};

/**
 * O custo do turno em DÓLAR, EXATO (sem arredondar), ou `null` quando não é calculável.
 *
 * Não é calculável em dois casos, e os dois são a MESMA lei: `null`, nunca `0`.
 *   - o modelo não tem preço de entrada/saída cadastrado;
 *   - o turno gastou cache e o modelo não tem preço de cache — somar entrada e saída sem ele
 *     daria um número com cara de medição que omite justamente a parcela maior do custo.
 */
export function custoDoTurnoUsd(args: ConsumoDoTurno): number | null {
	const preco = precoDoModelo(args.modelo);
	if (!preco) {
		avisarModeloSemPreco(args.modelo);
		return null;
	}

	const cacheRead = args.cacheRead ?? 0;
	const cacheWrite = args.cacheWrite ?? 0;
	if (
		(cacheRead > 0 && preco.cacheLeitura === undefined) ||
		(cacheWrite > 0 && preco.cacheEscrita === undefined)
	) {
		avisarModeloSemPrecoDeCache(args.modelo);
		return null;
	}

	return (
		(args.tokensInput / 1_000_000) * preco.entrada +
		(args.tokensOutput / 1_000_000) * preco.saida +
		(cacheRead / 1_000_000) * (preco.cacheLeitura ?? 0) +
		(cacheWrite / 1_000_000) * (preco.cacheEscrita ?? 0)
	);
}

/**
 * O custo do turno em centavos de DÓLAR, EXATO — a fração de centavo é preservada, para
 * que a soma de vários beats não perca o consumo deles.
 */
export function custoDoTurnoCentsExatos(args: ConsumoDoTurno): number | null {
	const usd = custoDoTurnoUsd(args);
	return usd === null ? null : usd * 100;
}

/**
 * O custo do turno em centavos INTEIROS — o que o campo `uso_de_ia.custo_usd_cents`
 * aceita hoje. Este é o ÚNICO ponto que arredonda o valor gravado; quem soma usa
 * `custoDoTurnoCentsExatos`.
 */
export function custoDoTurnoCents(args: ConsumoDoTurno): number | null {
	const centavos = custoDoTurnoCentsExatos(args);
	return centavos === null ? null : Math.round(centavos);
}
