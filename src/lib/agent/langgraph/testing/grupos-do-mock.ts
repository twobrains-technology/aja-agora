// Grupos REAIS do mock de referência (`aja-dois-cenarios_3.html`, os arrays
// `G120`/`G171`/`G90`). Usados como fixture da busca nos cenários de jornada —
// assim o que o teste vê é o mesmo conjunto que o mock desenha, e uma
// divergência de ordem/card não fica escondida atrás de dado inventado.
import type { BuscaGrupos } from "../nodes/discovery";

type GrupoMock = { n: string; carta: number; p: number; l: number };

/** Corolla ~R$ 120 mil (cenário Madalena, antes da carta maior). */
export const G120: GrupoMock[] = [
	{ n: "CANOPUS", carta: 119_500, p: 1_092, l: 71_000 },
	{ n: "ITAÚ", carta: 123_300, p: 1_625, l: 66_000 },
	{ n: "RODOBENS", carta: 121_000, p: 1_508, l: 60_300 },
	{ n: "BANCO DO BRASIL", carta: 128_100, p: 2_178, l: 73_000 },
	{ n: "ÂNCORA", carta: 122_400, p: 1_452, l: 71_000 },
	{ n: "PORTO", carta: 120_900, p: 1_379, l: 60_000 },
];

/** Carta MAIOR (cenário Madalena, pós-embutido: o embutido na de 120 deixaria
 * o crédito abaixo do preço do Corolla). */
export const G171: GrupoMock[] = [
	{ n: "CANOPUS", carta: 170_000, p: 1_092.94, l: 134_827 },
	{ n: "ANCORA", carta: 171_000, p: 2_503.44, l: 141_759 },
	{ n: "ITAU", carta: 171_043, p: 3_066.08, l: 128_282 },
	{ n: "RODOBENS", carta: 171_000, p: 2_719.11, l: 89_946 },
];

/** Usado ~R$ 90 mil (cenário Mario). */
export const G90: GrupoMock[] = [
	{ n: "CANOPUS", carta: 90_000, p: 812, l: 57_000 },
	{ n: "RODOBENS", carta: 90_000, p: 1_186, l: 47_000 },
	{ n: "PORTO", carta: 91_000, p: 998, l: 54_000 },
];

/** Converte o grupo do mock no shape que `indexRevealGroups` consome
 * (`recommend_groups` → `recommendations[]`). `termMonths` vem do prazo que o
 * próprio mock mostra nos cards de proposta. */
function paraRecommendation(g: GrupoMock, i: number, termMonths: number) {
	return {
		id: `mock-${g.n.toLowerCase().replace(/[^a-z]/g, "")}-${i}`,
		administradora: g.n,
		creditValue: g.carta,
		monthlyPayment: g.p,
		termMonths,
		avgBidValue: g.l,
		availableSlots: 3,
		rank: i,
	};
}

/** Busca injetável que devolve os grupos do mock. Escolhe a lista pela faixa
 * pedida — é o que permite o cenário da Madalena ver `G120` na primeira busca
 * e `G171` depois da carta maior, sem roteiro extra. */
export function buscaDoMock(termMonths = 96): BuscaGrupos {
	return async (args) => {
		const alvo = args.creditMax ?? 0;
		const lista = alvo >= 150_000 ? G171 : alvo >= 100_000 ? G120 : G90;
		return { recommendations: lista.map((g, i) => paraRecommendation(g, i, termMonths)) };
	};
}
