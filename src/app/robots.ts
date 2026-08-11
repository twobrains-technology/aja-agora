import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo/site";

/**
 * O que o robô pode varrer.
 *
 * `/admin` e `/api` ficam fora do índice: são a operação da mesa e os endpoints
 * do agente, nada ali é resultado de busca. Bloquear no robots não é controle de
 * acesso — quem faz isso é o `proxy.ts` com o `role-scope` —, é só evitar que o
 * painel apareça no Google.
 */
export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: ["/admin", "/api", "/onboarding"],
		},
		sitemap: `${SITE_URL.origin}/sitemap.xml`,
	};
}
