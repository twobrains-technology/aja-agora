// Traduz a ORIGEM clicada no painel numa condição sobre `conversations`.
//
// Existe para uma coisa só: clicar em "4 conversas" na linha do Instagram e
// abrir a lista com aquelas 4 — nem 3, nem 7. O que garante isso é a condição
// aqui usar a MESMA precedência do `rotularOrigem` (UTM > Click-to-WhatsApp >
// referência > direto). Se as duas divergirem, o número da tabela e a lista
// filtrada passam a discordar, e aí o painel vira adivinhação.
//
// A chave que entra é a mesma que o `agruparPorCanal` gera (`campanha:ig`,
// `direto`, `referencia`, `ctwa`), porque quem monta o link é a própria tabela.

import { type SQL, sql } from "drizzle-orm";

/** O prefixo que carrega a fonte da campanha na chave do canal. */
const PREFIXO_CAMPANHA = "campanha:";

/** A visita não tem NENHUM sinal de campanha — nem UTM, nem Click-to-WhatsApp. */
const SEM_CAMPANHA = sql`v.utm_source IS NULL AND v.ctwa_source_id IS NULL AND v.ctwa_headline IS NULL`;

/**
 * A condição de origem, ou `null` quando não há filtro.
 *
 * `null` é resposta legítima e não erro: chave desconhecida devolve `null` de
 * propósito — um link velho ou adulterado mostra a lista inteira, nunca uma
 * lista vazia que pareceria "nenhuma conversa veio daqui".
 */
export function condicaoDeOrigem(origem: string | null, campanha?: string | null): SQL | null {
	const chave = origem?.trim();
	if (!chave) return null;

	const predicado = predicadoDeOrigemNaVisita(chave, campanha?.trim() || null);
	if (!predicado) return null;

	// EXISTS correlacionado, e não JOIN: a rota já monta a lista com subqueries
	// de contagem, e um JOIN a mais mudaria a cardinalidade das linhas.
	return sql`EXISTS (
    SELECT 1 FROM visits v
    WHERE v.id = conversations.visit_id AND ${predicado}
  )`;
}

/**
 * O predicado sobre a linha de `visits` (alias `v`), sem o `EXISTS` em volta.
 *
 * Exportado para a tela de Percurso, que já parte de `visits` e não precisa
 * (nem pode) correlacionar de novo por `conversations.visit_id` — quem só
 * chegou e nunca abriu conversa sumiria do filtro justamente na tela feita para
 * mostrá-lo.
 */
export function predicadoDeOrigemNaVisita(chave: string, campanha: string | null): SQL | null {
	if (chave.startsWith(PREFIXO_CAMPANHA)) {
		const fonte = chave.slice(PREFIXO_CAMPANHA.length);
		if (!fonte) return null;
		// `lower()` dos dois lados: o que chega no `utm_source` é o que o
		// anunciante digitou, e "IG" e "ig" são a mesma campanha.
		const daFonte = sql`lower(v.utm_source) = lower(${fonte})`;
		return campanha ? sql`${daFonte} AND v.utm_campaign = ${campanha}` : daFonte;
	}

	switch (chave) {
		case "ctwa":
			return sql`(v.ctwa_source_id IS NOT NULL OR v.ctwa_headline IS NOT NULL)
        AND v.utm_source IS NULL`;
		case "referencia":
			return sql`${SEM_CAMPANHA} AND v.referrer IS NOT NULL AND v.referrer <> ''`;
		case "direto":
			return sql`${SEM_CAMPANHA} AND (v.referrer IS NULL OR v.referrer = '')`;
		default:
			return null;
	}
}
