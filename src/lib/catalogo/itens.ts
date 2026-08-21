// O catálogo de produtos que a Meta consome (Commerce Manager → feed agendado).
//
// Um item = uma CARTA DE CRÉDITO de uma vertical ("consórcio de carro, carta de
// R$ 50.000"). Não é oferta de administradora: a busca real na Bevi exige
// CPF + celular + LGPD antes de qualquer simulação
// (`bevi-self-contract-adapter.ts`), então não existe grupo real para publicar
// num arquivo público. O que vai no feed é a MESMA estimativa que a landing já
// mostra — `computePlanEstimate`, premissas de mercado documentadas — e é por
// isso que toda descrição diz, com todas as letras, que o número é estimado.
//
// As faixas saem de `CREDIT_BOUNDS` (a fonte do funil) e são filtradas pelo
// piso que a Bevi busca (`creditoBuscavel`). Anunciar carta de R$ 10.000 de moto
// seria vender o que o próprio funil barra no turno seguinte.

import type { Category } from "@/lib/agent/personas";
import { CREDIT_BOUNDS } from "@/lib/agent/qualify-config";
import { creditoBuscavel } from "@/lib/consorcio/credito-minimo";
import { computePlanEstimate } from "@/lib/consorcio/plan-estimate";
import { SITE_URL } from "@/lib/seo/site";

export const CATEGORIAS_DO_CATALOGO = [
	"auto",
	"moto",
	"imovel",
] as const satisfies readonly Category[];

/** Um item do catálogo, antes de virar XML. */
export interface ItemCatalogo {
	/** `auto-50000` — estável entre execuções: é a chave que casa o feed com os
	 * `content_ids` dos eventos de conversão (Meta CAPI). */
	id: string;
	categoria: Category;
	valorDoBem: number;
	/** Parcela estimada (R$/mês) — vem do plan-estimate, nunca escrita à mão. */
	parcelaMensal: number;
	prazoMeses: number;
	titulo: string;
	descricao: string;
	/** Absoluto, com o valor da carta e as UTMs da campanha. */
	link: string;
	/** Absoluto: a Meta baixa a imagem do lado dela, não resolve caminho relativo. */
	imagem: string;
}

/**
 * Escala comercial de valores — a régua com que as pessoas pensam em dinheiro
 * ("uns 80 mil", "meio milhão"), e não o `step` do slider.
 *
 * Usar o step (10k em auto) geraria 49 itens quase idênticos entre 80k e 90k, e
 * o algoritmo da Meta não teria o que distinguir. Esta série cobre a faixa
 * inteira com granularidade fina embaixo, onde está o volume, e grossa em cima.
 */
const ESCALA_COMERCIAL = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5] as const;

const POTENCIAS = [1e3, 1e4, 1e5, 1e6, 1e7] as const;

/** Distância mínima do teto da categoria para ele virar item próprio. Sem isso,
 * moto publicaria 75k e 80k lado a lado — dois anúncios que dizem a mesma coisa. */
const FOLGA_MINIMA_DO_TETO = 1.2;

export function faixasDeCredito(categoria: Category): number[] {
	const { min, max } = CREDIT_BOUNDS[categoria];

	const daEscala = POTENCIAS.flatMap((potencia) =>
		ESCALA_COMERCIAL.map((fator) => Math.round(fator * potencia)),
	)
		.filter((valor) => valor >= min && valor <= max)
		.filter((valor) => creditoBuscavel(valor));

	const maior = daEscala.at(-1);
	if (maior !== undefined && max >= maior * FOLGA_MINIMA_DO_TETO && creditoBuscavel(max)) {
		daEscala.push(max);
	}

	return [...new Set(daEscala)].sort((a, b) => a - b);
}

/** Reais em pt-BR, sem centavos. `Intl` com `style: "currency"` mete espaço
 * não-quebrável entre o símbolo e o número — invisível no editor e chato de
 * casar em teste; aqui o espaço é um espaço. */
export function formatarReais(valor: number): string {
	return `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(valor)}`;
}

/** A parcela vai com centavos no texto porque o `price` do XML vai com centavos
 * (`287.50 BRL`). Arredondar só na descrição faria o card do anúncio dizer um
 * número e a linha de baixo, outro. */
export function formatarReaisComCentavos(valor: number): string {
	return `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)}`;
}

const ROTA: Record<Category, string> = {
	auto: "/autos",
	moto: "/motos",
	imovel: "/imoveis",
};

// Colagem do hero de cada vertical: são as únicas artes acima de 500x500 em
// ambos os lados (mínimo da Meta) que representam a vertical inteira.
const IMAGEM: Record<Category, string> = {
	auto: "/kv/auto-hero-colagem.png",
	moto: "/kv/moto-hero-colagem.png",
	imovel: "/kv/imovel-hero-colagem.png",
};

/** Rótulo da vertical para a taxonomia do catálogo (`product_type`). */
export const ROTULO_DA_VERTICAL: Record<Category, string> = {
	auto: "Carro",
	moto: "Moto",
	imovel: "Imóvel",
};

const BEM: Record<Category, string> = {
	auto: "carro",
	moto: "moto",
	imovel: "imóvel",
};

const COBERTURA: Record<Category, string> = {
	auto: "para comprar carro novo ou usado, em concessionária ou de particular",
	moto: "para comprar moto nova ou usada, em concessionária ou de particular",
	imovel: "para comprar casa, apartamento, terreno ou construir",
};

function descricaoDoItem(categoria: Category, valorDoBem: number, parcela: number, prazo: number) {
	return (
		`Carta de crédito de ${formatarReais(valorDoBem)} ${COBERTURA[categoria]}. ` +
		`Parcela estimada de ${formatarReaisComCentavos(parcela)} por mês em ${prazo} meses, ` +
		"sem juros de financiamento — você paga a taxa de administração. " +
		"Converse com a Aja, compare as opções reais da administradora e contrate pelo próprio chat. " +
		"Parcela estimada por premissas de mercado; os valores oficiais vêm da administradora depois da simulação."
	);
}

function linkDoItem(categoria: Category, valorDoBem: number, id: string): string {
	const url = new URL(ROTA[categoria], SITE_URL.origin);
	url.searchParams.set("bem", String(valorDoBem));
	url.searchParams.set("utm_source", "meta");
	url.searchParams.set("utm_medium", "catalogo");
	url.searchParams.set("utm_campaign", `consorcio-${categoria}`);
	url.searchParams.set("utm_content", id);
	return url.toString();
}

/** O catálogo inteiro, em ordem estável (vertical, depois valor crescente). */
export function itensDoCatalogo(): ItemCatalogo[] {
	return CATEGORIAS_DO_CATALOGO.flatMap((categoria) =>
		faixasDeCredito(categoria).map((valorDoBem): ItemCatalogo => {
			// `targetMonth` não entra na conta da parcela — ele só move o lance
			// necessário, que o feed não publica. Fica em 1 para o número ser
			// reproduzível.
			const estimativa = computePlanEstimate({
				category: categoria,
				assetValue: valorDoBem,
				targetMonth: 1,
			});
			const id = `${categoria}-${valorDoBem}`;

			return {
				id,
				categoria,
				valorDoBem,
				parcelaMensal: estimativa.monthlyPayment,
				prazoMeses: estimativa.termMonths,
				titulo: `Consórcio de ${BEM[categoria]} — carta de ${formatarReais(valorDoBem)}`,
				descricao: descricaoDoItem(
					categoria,
					valorDoBem,
					estimativa.monthlyPayment,
					estimativa.termMonths,
				),
				link: linkDoItem(categoria, valorDoBem, id),
				imagem: `${SITE_URL.origin}${IMAGEM[categoria]}`,
			};
		}),
	);
}

/**
 * O item do catálogo que corresponde a um valor de bem REAL do funil.
 *
 * O feed publica faixas comerciais (R$ 75.000, R$ 100.000); o cliente pede
 * R$ 83.000. Para a Meta reconhecer o `content_id`, ele tem que ser um id que
 * EXISTE no catálogo — id inventado é ignorado em silêncio, que é o pior modo
 * de falhar. Por isso a correspondência é pela faixa mais próxima, e não pelo
 * valor cru.
 *
 * Empate (valor exatamente no meio de duas faixas) fica com a MENOR: o card
 * anunciado passa a ser o mais barato dos dois, que é o lado seguro para uma
 * promessa de parcela.
 */
export function idDoItemMaisProximo(
	categoria: Category,
	valorDoBem: number | null | undefined,
): string | null {
	if (valorDoBem == null || !Number.isFinite(valorDoBem) || valorDoBem <= 0) return null;

	const faixas = faixasDeCredito(categoria);
	if (faixas.length === 0) return null;

	const maisProxima = faixas.reduce((melhor, atual) =>
		Math.abs(atual - valorDoBem) < Math.abs(melhor - valorDoBem) ? atual : melhor,
	);

	return `${categoria}-${maisProxima}`;
}
