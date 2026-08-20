// Serialização do catálogo no formato que o Commerce Manager lê: RSS 2.0 com o
// namespace do Google Merchant Center (`xmlns:g`), o mesmo aceito pela Meta.
//
// Escolha do formato: XML em vez de CSV porque o feed é SERVIDO por rota
// (`/feed/meta.xml`) e buscado pela Meta em horário agendado — não há upload
// manual no meio, e um campo com vírgula (toda descrição tem) não corrompe a
// linha como corromperia num CSV.
//
// A moeda vai colada ao número (`719.00 BRL`, ISO 4217) porque é assim que a
// Meta lê `price`; e o preço é a PARCELA, não a carta — é o número que decide a
// compra em consórcio, e é o que aparece no card do anúncio.

import { SITE_URL } from "@/lib/seo/site";

import { type ItemCatalogo, itensDoCatalogo, ROTULO_DA_VERTICAL } from "./itens";

/** Os campos que a Meta exige em todo item, para anúncios e para Commerce. */
export const CAMPOS_OBRIGATORIOS_META = [
	"id",
	"title",
	"description",
	"availability",
	"condition",
	"price",
	"link",
	"image_link",
	"brand",
] as const;

export const MARCA = "Aja Agora";

/** Consórcio não sai de estoque nem tem estado de conservação, mas a Meta exige
 * os dois campos e só aceita valores do vocabulário dela. */
const DISPONIBILIDADE = "in stock";
const CONDICAO = "new";

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
};

/** Sem CDATA de propósito: o link carrega `&` das UTMs, e feed com `&` cru é o
 * jeito mais comum de a Meta recusar o arquivo inteiro por XML inválido. */
function escapar(texto: string): string {
	return texto.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function campo(nome: string, valor: string): string {
	return `      <g:${nome}>${escapar(valor)}</g:${nome}>`;
}

/** Nem todo campo do catálogo mora no namespace do Merchant Center. A doc da
 * Meta escreve `product_type` e `custom_label_*` SEM prefixo — com `g:` eles não
 * quebram o feed, mas são ignorados em silêncio, e é justamente por eles que se
 * monta conjunto de produtos por vertical no Gerenciador. */
function campoSemPrefixo(nome: string, valor: string): string {
	return `      <${nome}>${escapar(valor)}</${nome}>`;
}

function itemXml(item: ItemCatalogo): string {
	return [
		"    <item>",
		campo("id", item.id),
		campo("title", item.titulo),
		campo("description", item.descricao),
		campo("availability", DISPONIBILIDADE),
		campo("condition", CONDICAO),
		campo("price", `${item.parcelaMensal.toFixed(2)} BRL`),
		campo("link", item.link),
		campo("image_link", item.imagem),
		campo("brand", MARCA),
		// Não são obrigatórios, mas são o que permite montar conjunto de produtos
		// por vertical no Gerenciador sem depender de casar texto do título.
		campoSemPrefixo("product_type", `Consórcio > ${ROTULO_DA_VERTICAL[item.categoria]}`),
		campoSemPrefixo("custom_label_0", item.categoria),
		campoSemPrefixo("custom_label_1", String(item.valorDoBem)),
		"    </item>",
	].join("\n");
}

/**
 * O feed inteiro. Sem parâmetro, publica o catálogo completo.
 */
export function feedMetaXml(itens: ItemCatalogo[] = itensDoCatalogo()): string {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
		"  <channel>",
		`    <title>${escapar(`${MARCA} — cartas de consórcio`)}</title>`,
		`    <link>${escapar(SITE_URL.origin)}</link>`,
		`    <description>${escapar(
			"Cartas de crédito de consórcio de carro, moto e imóvel, com parcela estimada e simulação real no chat da Aja.",
		)}</description>`,
		...itens.map(itemXml),
		"  </channel>",
		"</rss>",
		"",
	].join("\n");
}
