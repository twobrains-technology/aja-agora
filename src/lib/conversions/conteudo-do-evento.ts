// De qual CARTA este marco do funil está falando?
//
// A Meta só liga a conversão ao anúncio de catálogo se o evento carregar um
// `content_id` que EXISTE no feed. O funil, porém, não guarda "o item do
// catálogo": guarda o que aconteceu de verdade — a proposta na Bevi, o valor
// que o cliente pediu, a landing por onde ele entrou. Este módulo é a tradução
// entre as duas coisas, e é PURO de propósito: quem lê o banco é o registry.
//
// A ordem das fontes não é estética, é de confiabilidade decrescente:
//
//   1. A PROPOSTA da Bevi — segmento e crédito reais da administradora. Se
//      existe, é a verdade: o cliente já escolheu.
//   2. A LANDING de origem (`/autos`) — ele entrou pela vertical, então é dela
//      que se trata, mesmo sem proposta ainda.
//   3. A CAMPANHA (`utm_campaign=consorcio-auto`) — o que o próprio feed
//      carimbou no link do anúncio.
//
// Sem nenhuma das três, devolve `null` e o evento vai como ia antes: sem
// `content_ids`. Chutar a categoria seria pior do que não mandar — um `Purchase`
// atribuído à carta errada ensina o algoritmo a procurar o cliente errado.

import type { Category } from "@/lib/agent/personas";
import { idDoItemMaisProximo } from "@/lib/catalogo/itens";

const CATEGORIAS: readonly Category[] = ["auto", "moto", "imovel"];

/** Landing da vertical → categoria. Fonte: as rotas de `src/app/(verticais)`. */
const POR_LANDING: Record<string, Category> = {
	"/autos": "auto",
	"/motos": "moto",
	"/imoveis": "imovel",
};

/** Segmento da Bevi → categoria. Os seis segmentos dela colapsam em três; o que
 * não é imóvel nem moto (PESADOS, SERVICOS, OUTROS BENS) cai em auto, como já
 * faz `beviSegmentToCategory` no adapter. Repetido aqui em vez de importado
 * porque lá a função LANÇA em segmento desconhecido — e atribuição nunca pode
 * derrubar o caminho do dinheiro. */
function categoriaDoSegmento(segmento: string | null | undefined): Category | null {
	if (!segmento) return null;
	const s = segmento.trim().toUpperCase();
	if (!s) return null;
	if (s === "IMOVEL") return "imovel";
	if (s === "MOTOS") return "moto";
	if (s === "AUTOS" || s === "SERVICOS" || s === "PESADOS" || s === "OUTROS BENS") return "auto";
	return null;
}

/** `consorcio-auto` (o que o feed carimba) ou qualquer campanha que termine com
 * o nome da vertical. */
function categoriaDaCampanha(utmCampaign: string | null | undefined): Category | null {
	if (!utmCampaign) return null;
	const c = utmCampaign.trim().toLowerCase();
	return CATEGORIAS.find((cat) => c.endsWith(`-${cat}`) || c === cat) ?? null;
}

export interface FontesDoConteudo {
	/** Segmento da proposta Bevi, quando já existe proposta. */
	segmentoBevi?: string | null;
	/** Crédito da proposta Bevi — tem precedência sobre o valor declarado. */
	creditoDaProposta?: number | null;
	/** Valor do bem declarado pelo lead. */
	creditoDoLead?: number | null;
	/** `/autos`, `/motos`, `/imoveis` — a landing por onde a visita entrou. */
	landingPath?: string | null;
	utmCampaign?: string | null;
}

export function categoriaDoEvento(fontes: FontesDoConteudo): Category | null {
	return (
		categoriaDoSegmento(fontes.segmentoBevi) ??
		POR_LANDING[(fontes.landingPath ?? "").trim()] ??
		categoriaDaCampanha(fontes.utmCampaign) ??
		null
	);
}

/**
 * O `content_id` do evento — o id de um item que existe no feed, ou `null`.
 */
export function contentIdDoEvento(fontes: FontesDoConteudo): string | null {
	const categoria = categoriaDoEvento(fontes);
	if (!categoria) return null;

	const valor = fontes.creditoDaProposta ?? fontes.creditoDoLead ?? null;
	return idDoItemMaisProximo(categoria, valor);
}

/** `numeric` do Postgres chega como string. Converte sem inventar zero: valor
 * ausente tem que continuar ausente, senão vira carta de R$ 0 no evento. */
export function numeroOuNulo(valor: string | number | null | undefined): number | null {
	if (valor === null || valor === undefined) return null;
	const n = typeof valor === "number" ? valor : Number(valor);
	return Number.isFinite(n) && n > 0 ? n : null;
}
