/**
 * A URL pública do site, em um lugar só.
 *
 * Serve ao `metadataBase` do layout raiz, ao sitemap e ao robots. Sem ela, o
 * Next resolve `openGraph.images` e `alternates.canonical` contra `localhost` e
 * o link compartilhado no WhatsApp aponta para a máquina de quem fez o build.
 *
 * A env existe para o ambiente de homologação não se anunciar como produção nem
 * disputar indexação com ela.
 */
export const SITE_URL = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ajaagora.com.br");
