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

import { and, inArray, or, type SQL, sql } from "drizzle-orm";
import { type Campanhas, normalizarCampanhas } from "./campanhas";

/** O prefixo que carrega a fonte da campanha na chave do canal. */
const PREFIXO_CAMPANHA = "campanha:";

/**
 * A chave da conversa SEM origem conhecida — a que o funil de mídia exclui por
 * construção (`conversations.visit_id IS NULL`).
 *
 * A tela de Performance conta quantas são (a cobertura de atribuição) e agora
 * LINKA para elas: `ⓘ 9 conversas sem origem conhecida ficam fora deste funil ·
 * Ver as 9` → `/admin/conversations?origem=desconhecida` (AJA-17). Sem este
 * valor, o link cairia no caso de chave desconhecida — que devolve `null` — e
 * abriria a lista INTEIRA fingindo ser um recorte.
 */
export const ORIGEM_SEM_ORIGEM = "desconhecida";

/** A visita não tem NENHUM sinal de campanha — nem UTM, nem Click-to-WhatsApp. */
const SEM_CAMPANHA = sql`v.utm_source IS NULL AND v.ctwa_source_id IS NULL AND v.ctwa_headline IS NULL`;

/**
 * A condição de origem, ou `null` quando não há filtro.
 *
 * `null` é resposta legítima e não erro: chave desconhecida devolve `null` de
 * propósito — um link velho ou adulterado mostra a lista inteira, nunca uma
 * lista vazia que pareceria "nenhuma conversa veio daqui".
 *
 * `campanhas` aceita uma campanha só (`"camp-1"`) ou a lista da querystring
 * (`"camp-1,camp-2"`, ou o array que o nuqs separou). Lista vazia é "não
 * filtrar por campanha" — NUNCA `IN ()`.
 */
export function condicaoDeOrigem(origem: string | null, campanhas?: Campanhas): SQL | null {
	const chave = origem?.trim();
	if (!chave) return null;

	// "Desconhecida" não é uma origem: é a AUSÊNCIA dela. Não dá para perguntar
	// isso a `visits` (a visita sempre existe, é justamente ela que falta) — a
	// pergunta é sobre a coluna que liga a conversa à visita.
	if (chave === ORIGEM_SEM_ORIGEM) {
		return sql`conversations.visit_id IS NULL`;
	}

	const predicado = predicadoDeOrigemNaVisita(chave, campanhas);
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
 *
 * `ORIGEM_SEM_ORIGEM` devolve `null` aqui de propósito: esta função recebe uma
 * linha de `visits`, e visita sem origem não existe (a própria visita É a
 * origem). Quem trata a ausência é `condicaoDeOrigem`, sobre `conversations`.
 */
export function predicadoDeOrigemNaVisita(chave: string, campanhas: Campanhas): SQL | null {
	if (chave.startsWith(PREFIXO_CAMPANHA)) {
		const fonte = chave.slice(PREFIXO_CAMPANHA.length);
		if (!fonte) return null;
		// `lower()` dos dois lados: o que chega no `utm_source` é o que o
		// anunciante digitou, e "IG" e "ig" são a mesma campanha.
		const daFonte = sql`lower(v.utm_source) = lower(${fonte})`;
		const daCampanha = predicadoDeCampanhas(campanhas);
		return daCampanha ? (and(daFonte, daCampanha) ?? daFonte) : daFonte;
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

/**
 * O recorte por campanha, sobre a linha de `visits` (alias `v`), ou `null`
 * quando não há campanha escolhida.
 *
 * Duas decisões que valem a leitura:
 *
 * 1. **A lista vazia sai daqui como `null`**, antes de chegar no `inArray`. É
 *    deliberado: `inArray` com lista vazia vira `false` no SQL, e um filtro
 *    vazio esconderia tudo em vez de não filtrar nada. Ver `campanhas.ts`.
 * 2. **Casa `utm_campaign` E `campaign_id`.** A campanha tem duas identidades
 *    possíveis na visita: o texto que o anunciante digitou na UTM e o id
 *    determinístico da Meta (ver `meta-ads/resolver.ts`, "as três chaves por
 *    força"). O filtro aceita as duas porque as duas nomeiam a mesma campanha;
 *    recortar por só uma delas deixaria de fora quem chegou pela outra.
 *
 * `inArray` parametriza a lista (`$1, $2, ...`) e é o que impede um `OR` de
 * SQL montado à mão — a lista é dado, não texto colado na query.
 */
function predicadoDeCampanhas(campanhas: Campanhas): SQL | null {
	const lista = normalizarCampanhas(campanhas);
	if (lista.length === 0) return null;

	return or(inArray(sql`v.utm_campaign`, lista), inArray(sql`v.campaign_id`, lista)) ?? null;
}
