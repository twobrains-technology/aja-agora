/**
 * Quando uma seção conta como VISTA.
 *
 * Módulo puro (sem DOM, sem React) porque a regra é aritmética e porque o
 * defeito que ele existe para fechar era invisível no navegador: nada quebrava,
 * nada aparecia no console — a seção simplesmente não era contada, e o painel
 * mostrava zero como se ninguém tivesse passado por ela.
 *
 * ── O defeito ────────────────────────────────────────────────────────────────
 *
 * A regra era `threshold: 0.5` no `IntersectionObserver`: metade da SEÇÃO
 * precisava estar na tela. Isso funciona para uma seção do tamanho de uma tela e
 * **é impossível de satisfazer** para uma seção mais alta que duas telas — a
 * fração visível nunca chega a 50% da própria área, por mais que a pessoa role
 * devagar e leia tudo.
 *
 * A prova não precisou de teste: é geométrica, e saiu dos dados de produção de
 * 22 a 24/08/2026. Na home, a ordem física das seções é
 *
 *     kv-menu → kv-hero → kv-journey → kv-tipos → kv-contemplacao → kv-faq → ...
 *
 * e o painel mostrava `kv-contemplacao` com 8 pessoas e `kv-faq` com 10,
 * enquanto `kv-journey` e `kv-tipos` — que ficam ANTES delas — mostravam ZERO.
 * Ninguém alcança a quinta seção sem atravessar a terceira. O zero era do
 * instrumento.
 *
 * O estrago é de leitura, não de dados: a tela de Mapa de calor dizia que a
 * página morria no hero, e a conclusão que se tira disso ("corte a cauda da
 * landing") teria sido tomada sobre um número que nunca existiu.
 *
 * ── A correção ───────────────────────────────────────────────────────────────
 *
 * Duas condições, qualquer uma basta:
 *
 * 1. metade da SEÇÃO está na tela — a regra antiga, que serve às seções curtas;
 * 2. a parte visível da seção ocupa metade da TELA — a que faltava, e a única
 *    que uma seção alta consegue satisfazer.
 *
 * A segunda continua exigindo presença de verdade: meia tela de conteúdo não é
 * raspão, que era o que o limiar original queria evitar.
 */

/** Fração que conta como presença — da seção ou da tela, o que vier primeiro. */
export const LIMIAR_SECAO = 0.5;

export interface EntradaDeSecao {
	/** Fração da seção que está visível (0..1) — o `intersectionRatio`. */
	fracaoDaSecao: number;
	/** Altura, em px, do pedaço visível da seção. */
	alturaVisivelPx: number;
	/** Altura, em px, da janela. */
	alturaDaJanelaPx: number;
}

/**
 * A seção foi vista?
 *
 * Não recebe `isIntersecting`: quem chama já descartou o que não intersecta, e
 * uma seção com zero pixels na tela reprova nas duas condições de qualquer jeito.
 */
export function secaoFoiVista(entrada: EntradaDeSecao): boolean {
	const { fracaoDaSecao, alturaVisivelPx, alturaDaJanelaPx } = entrada;

	if (fracaoDaSecao >= LIMIAR_SECAO) return true;
	if (alturaDaJanelaPx <= 0) return false;

	return alturaVisivelPx / alturaDaJanelaPx >= LIMIAR_SECAO;
}
