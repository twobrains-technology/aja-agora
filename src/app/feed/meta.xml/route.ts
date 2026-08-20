// O feed que a Meta busca sozinha (Commerce Manager → Fontes de dados → Feed
// agendado, apontando para https://ajaagora.com.br/feed/meta.xml).
//
// É rota, e não arquivo subido à mão, por um motivo prático: o catálogo é
// DERIVADO do código (faixas de crédito do funil + estimativa de parcela). Se
// o teto de auto mudar em `CREDIT_BOUNDS`, o feed muda no deploy seguinte, sem
// ninguém lembrar de reexportar planilha.
//
// `force-static`: a saída não depende de requisição nenhuma — é a mesma para a
// Meta, para o robô e para quem abrir no navegador. Renderiza no build e a
// revalidação diária existe só para o caso de a página ficar servida por um
// runtime de longa duração.

import { feedMetaXml } from "@/lib/catalogo/meta-feed";

export const dynamic = "force-static";
export const revalidate = 86_400;

export function GET(): Response {
	return new Response(feedMetaXml(), {
		headers: {
			// `application/xml` e não `text/xml`: alguns validadores da Meta rejeitam
			// o segundo quando o charset não vem declarado.
			"content-type": "application/xml; charset=utf-8",
			"cache-control": "public, max-age=3600, s-maxage=86400",
		},
	});
}
