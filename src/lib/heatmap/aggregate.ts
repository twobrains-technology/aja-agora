// src/lib/heatmap/aggregate.ts
//
// Transforma as contagens cruas do banco no que a tela mostra. Módulo PURO —
// dá pra provar o funil inteiro sem subir Postgres.
//
// A regra que atravessa o arquivo: o painel nunca omite uma linha por ela estar
// zerada. Seção que ninguém alcançou é o achado mais valioso do funil de
// scroll; sumir com ela transformaria o pior resultado em silêncio.

import { secoesDe } from "./events";

/**
 * Fatia de raiva que faz o alvo virar suspeito.
 *
 * Um terço e não metade: rage click é raro por natureza (exige três batidas em
 * menos de um segundo no MESMO alvo), então exigir maioria só acenderia o
 * alarme depois que o elemento já estivesse insuportável. A 30% ele acende
 * enquanto ainda é um defeito, não um escândalo.
 */
const LIMIAR_SUSPEITO = 0.3;

export interface ContagemSecao {
	section: string;
	visitantes: number;
}

export interface DegrauDoFunil {
	section: string;
	visitantes: number;
	/** Percentual sobre quem viu a PRIMEIRA seção do funil. */
	pct: number;
	/** Quanto se perdeu em relação à seção imediatamente anterior. */
	quedaPct: number;
}

export interface ContagemAlvo {
	selector: string | null;
	label: string;
	section: string | null;
	cliques: number;
	rageCliques: number;
}

export interface AlvoDoMapa extends ContagemAlvo {
	/** Fatia deste alvo sobre todos os cliques do período. */
	sharePct: number;
	/** Maioria dos cliques foi raiva ⇒ parece clicável e não responde. */
	suspeito: boolean;
}

function arredondar(valor: number): number {
	return Math.round(valor * 10) / 10;
}

/**
 * Monta o funil de scroll na ordem da landing.
 *
 * O denominador é quem viu a PRIMEIRA seção com audiência, não quem carregou a
 * página: aba aberta em segundo plano carrega e nunca dispara `section_view`.
 * Ancorar em carregamento inflaria a evasão com gente que sequer olhou.
 */
export function montarFunilDeSecoes(contagens: ContagemSecao[], path: string): DegrauDoFunil[] {
	const porSecao = new Map(contagens.map((c) => [c.section, c.visitantes]));

	const degraus = secoesDe(path).map((section) => ({
		section,
		visitantes: porSecao.get(section) ?? 0,
	}));

	const base = degraus.find((d) => d.visitantes > 0)?.visitantes ?? 0;

	// A queda compara com o degrau IMEDIATAMENTE anterior, e só depois que a
	// audiência começou. As duas metades desta regra saíram de defeitos reais:
	//
	// - "só depois que começou": `kv-menu` é barra fixa e costuma vir zerada. Sem
	//   isso, a primeira seção de verdade reportaria queda a partir do zero.
	// - "imediatamente anterior", e não "último com audiência": medido no banco em
	//   17/08/2026, uma audiência que morria em `kv-depoimentos` fazia as QUATRO
	//   seções seguintes acusarem −100% cada. A página perde a pessoa num lugar
	//   só, e quatro alarmes mandariam procurar quatro defeitos onde há um.
	let anterior: number | null = null;

	return degraus.map((degrau) => {
		const quedaPct =
			anterior !== null && anterior > 0
				? arredondar(((anterior - degrau.visitantes) / anterior) * 100)
				: 0;

		// A cadeia só começa na primeira seção com audiência; antes dela, cada
		// degrau zerado é "ainda não chegou", não "perdemos aqui".
		if (anterior !== null || degrau.visitantes > 0) anterior = degrau.visitantes;

		return {
			...degrau,
			pct: base > 0 ? arredondar((degrau.visitantes / base) * 100) : 0,
			quedaPct,
		};
	});
}

/**
 * Ordena os alvos por clique e calcula a fatia de cada um.
 *
 * O alvo sem rótulo cai no seletor: linha vazia no painel é linha que ninguém
 * consegue interpretar, e imagem ou ícone clicado costuma não ter texto.
 *
 * `totalDeCliques` é o total do PERÍODO, e é parâmetro justamente porque não dá
 * para deduzi-lo daqui: a consulta corta a cauda longa em `MAX_ALVOS`, então a
 * soma do que chega nesta função é menor que os cliques da página. Somando o que
 * recebia, cada fatia saía inflada na proporção do que foi cortado — na home da
 * produção, 40 alvos cobriam 73,2% dos cliques e o líder aparecia com 5,4% em
 * vez de 3,9%. As fatias fechavam 100% entre si e não fechavam com o número de
 * cliques impresso uma linha acima, na mesma tela.
 */
export function montarAlvos(contagens: ContagemAlvo[], totalDeCliques: number): AlvoDoMapa[] {
	return contagens
		.map((contagem) => ({
			...contagem,
			label: contagem.label || contagem.selector || "(sem rótulo)",
			sharePct: totalDeCliques > 0 ? arredondar((contagem.cliques / totalDeCliques) * 100) : 0,
			suspeito:
				contagem.cliques + contagem.rageCliques > 0 &&
				contagem.rageCliques / (contagem.cliques + contagem.rageCliques) > LIMIAR_SUSPEITO,
		}))
		.sort((a, b) => b.cliques - a.cliques);
}
