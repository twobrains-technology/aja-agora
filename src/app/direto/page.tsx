import type { Metadata } from "next";

import { HEROS } from "@/components/kv/heros";
import { LandingKv } from "@/components/kv/landing-kv";

/**
 * A home com o hero DIRETO — a variante em teste (comp "TESTE A", 2026-08-21).
 *
 * É a mesma landing da `/`, com a manchete e a linha de apoio trocadas (o
 * chapéu é o mesmo nas duas, de propósito: variar dois blocos ao mesmo tempo
 * impediria de saber qual deles moveu o resultado): só o registro de variantes
 * (`heros.tsx`) muda, o resto do arquivo é uma casca. Nada aqui deve virar uma
 * segunda landing.
 *
 * **Hoje ela serve para revisão**: o time abre `/direto` no celular e compara.
 * **Amanhã é o alvo do rewrite**: quando o sorteio entrar no `proxy.ts`, parte
 * dos visitantes de `/` recebe ESTE html sem que a URL mude. Por isso a rota
 * nasce com nome de gente e não `/b` — e por isso não precisa ser refeita
 * quando o experimento começar de verdade.
 *
 * `noindex` + canonical para `/`: sem isso o Google indexa a mesma landing duas
 * vezes e as duas competem entre si na busca. O canonical é o que a própria
 * documentação do Google pede em teste de página; o `noindex` é cinto e
 * suspensório, e não custa nada porque esta rota não existe para tráfego
 * orgânico.
 */
export const metadata: Metadata = {
	robots: { index: false, follow: false },
	alternates: { canonical: "/" },
};

export default function LandingDiretoPage() {
	// O mapa de calor grava como `/` de propósito, e não como `/direto`: é assim
	// que vai ser quando o rewrite estiver no ar, e a allowlist de seções
	// (`SECOES_POR_LANDING`, em src/lib/heatmap/events.ts) é indexada por path —
	// gravar `/direto` faria o servidor recusar toda seção em silêncio.
	return <LandingKv hero={HEROS.direto} heatPath="/" />;
}
