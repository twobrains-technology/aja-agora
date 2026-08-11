import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo/site";

/**
 * O mapa do site para os buscadores.
 *
 * Existe porque as verticais não são alcançáveis por navegação: nada na home
 * aponta para elas hoje, então, sem sitemap, um buscador só chegaria a `/autos`
 * se alguém publicasse o link em algum lugar. Nasceram para receber campanha, e
 * a campanha não deixa rastro que o robô siga.
 *
 * `/admin` fica de fora por não ser público, e a página 404 não entra por
 * definição — o Next responde 404 nela, e URL que não existe não se anuncia.
 */
export default function sitemap(): MetadataRoute.Sitemap {
	const base = SITE_URL.origin;

	return [
		{ url: base, changeFrequency: "weekly", priority: 1 },
		{ url: `${base}/autos`, changeFrequency: "weekly", priority: 0.9 },
		{ url: `${base}/imoveis`, changeFrequency: "weekly", priority: 0.9 },
		{ url: `${base}/motos`, changeFrequency: "weekly", priority: 0.9 },
		{ url: `${base}/termos-de-uso`, changeFrequency: "yearly", priority: 0.3 },
		{ url: `${base}/politica-de-privacidade`, changeFrequency: "yearly", priority: 0.3 },
	];
}
