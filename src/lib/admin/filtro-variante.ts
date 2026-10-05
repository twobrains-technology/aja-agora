// O recorte por BRAÇO de experimento A/B — a parte que toca SQL.
//
// ── O que este módulo faz ────────────────────────────────────────────────────
//
// Traduz o recorte (`?ab=<experimento>:<braço>`, ou o cookie `aja_ab`) em
// condição SQL, nos dois níveis que o painel usa:
//
//   • CONVERSA (`condicaoDeBracoNaConversa`): a linha da tela É uma conversa
//     (lista de Conversas, Remarketing, export `conversas`/`toques`, handoff por
//     lead). Predicado direto no metadata da própria conversa.
//   • PESSOA (`condicaoDeBracoDaPessoa`, `cteDoBracoDaPessoa`): a tela conta
//     PESSOAS (funis, Percurso, export `percurso`). A pessoa é atribuída ao braço
//     da conversa que a fez AVANÇAR a etapa âncora do experimento — e, quando ela
//     nunca avançou, ao braço da última conversa com braço do período.
//
// ── O que este módulo NÃO faz ────────────────────────────────────────────────
//
// **Lê SÓ o metadata.** Não existe aqui — nem pode existir — derivar braço por
// hash: o cartão do teste do telefone (FIX-403) chuta um braço a partir do id da
// visita, e um chute no painel vira afirmação. No recorte, conversa sem braço
// gravado é `sem variante`, ponto.
//
// ── Precedência, e por que o inválido não desce ──────────────────────────────
//
//   1. querystring `ab`  — o link compartilhado carrega o recorte;
//   2. cookie `aja_ab`   — é o que faz o recorte atravessar a navegação;
//   3. `[]`              — nenhum recorte (o default; nenhum número que a
//                          operação lê hoje se move — C4).
//
// Um valor INVÁLIDO na querystring NÃO desce para o cookie: vira `[]` ("todas").
// É o mesmo que o seletor mostra nessa situação, então servidor e cliente não
// podem discordar sobre o que o recorte é.

import { type SQL, sql } from "drizzle-orm";
import {
	COOKIE_DO_RECORTE_AB,
	EXPERIMENTOS,
	type Experimento,
	lerRecorteAB,
	PARAMETRO_DO_RECORTE_AB,
	type RecorteAB,
	SEM_BRACO,
} from "@/lib/experimentos/registro";
import { fatoDaEtapaNaConversa } from "./sinais-do-funil";

/** O nome do CTE que resolve o braço por pessoa (Percurso e export `percurso`). */
export const NOME_DO_CTE_DO_BRACO_DA_PESSOA = "braco_da_pessoa";

/** Lê o valor de UM cookie do cabeçalho `Cookie:` cru.
 *
 *  Sem `next/headers` de propósito: assim o helper roda em qualquer `Request`
 *  (inclusive um `new Request` de teste, sem subir servidor). O `try/catch` em
 *  volta do `decodeURIComponent` é o detalhe que importa: `%` solto no cookie
 *  lança `URIError` e derrubaria a tela inteira por causa de um recorte — aqui
 *  ele só devolve o valor cru. */
function cookieDaRequisicao(cabecalho: string | null | undefined, nome: string): string | null {
	if (!cabecalho) return null;

	for (const parte of cabecalho.split(";")) {
		const separador = parte.indexOf("=");
		if (separador < 0) continue;

		if (parte.slice(0, separador).trim() !== nome) continue;

		const valor = parte.slice(separador + 1).trim();
		try {
			return decodeURIComponent(valor);
		} catch {
			return valor;
		}
	}

	return null;
}

/**
 * UMA linha para as rotas: lê querystring + cookie e devolve o recorte.
 *
 * `const recorte = recorteDaRequisicao(request);`
 */
export function recorteDaRequisicao(requisicao: Request): RecorteAB {
	const { searchParams } = new URL(requisicao.url);
	const daUrl = searchParams.get(PARAMETRO_DO_RECORTE_AB);

	// Parâmetro PRESENTE manda — mesmo inválido. Só na ausência o cookie é lido.
	if (daUrl !== null) return lerRecorteAB(daUrl);

	return lerRecorteAB(cookieDaRequisicao(requisicao.headers.get("cookie"), COOKIE_DO_RECORTE_AB));
}

/** Os braços do experimento, prontos para um `IN (...)` de SQL. */
function bracosDoExperimento(experimento: Experimento): SQL {
	return sql.join(
		experimento.bracos.map((braco) => sql`${braco}`),
		sql`, `,
	);
}

/** A LEITURA crua do braço de uma conversa (o valor que está no metadata). */
function leituraDoBraco(experimento: Experimento, conversa: SQL): SQL {
	return sql`${conversa}.metadata -> ${experimento.id} ->> 'variante'`;
}

/**
 * O predicado de "braço FORÇADO" — `?variante=` (QA/dono) grava `forcada: true`.
 *
 * Forçar não consome a fila e não é entrada do experimento: para o painel, a
 * conversa conta como `sem variante` (D4) — senão o teste manual do dono vira
 * "resultado" e contamina a leitura que ele mesmo vai ler.
 */
function bracoForcado(experimento: Experimento, conversa: SQL): SQL {
	return sql`(${conversa}.metadata -> ${experimento.id} ->> 'forcada') = 'true'`;
}

/**
 * A EXPRESSÃO do braço de uma conversa — `'A'` | `'B'` | NULL, **com allowlist**.
 *
 * O `CASE WHEN … IN (…) THEN … END` sem `ELSE` devolve NULL para qualquer valor
 * fora da lista: um `"C"` legado no metadata cai em `sem variante` em vez de não
 * cair em balde nenhum — é o que mantém `A + B + sem variante = total`.
 *
 * O braço FORÇADO (`forcada: true`, FIX-434/D4) também devolve NULL: está fora do
 * teste.
 *
 * Recebe a referência SQL da tabela/alias porque quem chama já tem um JOIN
 * montado e o filtro tem que falar sobre a MESMA linha.
 */
export function bracoDaConversaSql(experimento: Experimento, conversa: SQL): SQL {
	const leitura = leituraDoBraco(experimento, conversa);
	return sql`CASE
    WHEN ${bracoForcado(experimento, conversa)} THEN NULL
    WHEN ${leitura} IN (${bracosDoExperimento(experimento)}) THEN ${leitura}
  END`;
}

/**
 * O predicado de recorte para as telas cuja linha É uma conversa (D10).
 *
 * `[]` (todas) devolve `null` de propósito: sem recorte, NENHUM SQL novo entra na
 * consulta — é o que faz o default não mover número nenhum.
 *
 * Vários experimentos no mesmo recorte são um E lógico.
 */
export function condicaoDeBracoNaConversa(
	recorte: RecorteAB,
	conversa: SQL = sql`conversations`,
): SQL | null {
	return conjuncao(
		paresValidos(recorte).map(({ experimento, braco }) => {
			const expressao = bracoDaConversaSql(experimento, conversa);
			return braco === SEM_BRACO ? sql`${expressao} IS NULL` : sql`${expressao} = ${braco}`;
		}),
	);
}

/** Onde a pessoa (sua chave) é resolvida — o mesmo caminho do `chaveDaPessoa`. */
export interface OpcoesDeBracoDaPessoa {
	/** Início da janela (instante). */
	de: Date;
	/** Fim da janela (instante). */
	ate: Date;
	/** A EXPRESSÃO da chave da pessoa na consulta de fora (o `chaveDaPessoa`). */
	chave: SQL;
	/** A coluna do visitante na consulta de fora; default `v.visitor_id`. */
	colunaVisitor?: SQL;
}

/**
 * A ordenação canônica do refino 3 (§4): primeiro quem AVANÇOU a etapa âncora
 * (entre essas, a PRIMEIRA); não havendo, a ÚLTIMA exposição. `id` desempata.
 */
function ordenacaoDaPessoa(fato: SQL | null, prefixo: SQL): SQL {
	if (!fato) {
		// Etapa sem fato de avanço (visitas/conversas): só exposição — a última.
		return sql`${prefixo}.created_at DESC, ${prefixo}.id ASC`;
	}
	return sql`${fato} DESC NULLS LAST,
    (CASE WHEN ${fato} THEN ${prefixo}.created_at END) ASC,
    (CASE WHEN NOT ${fato} THEN ${prefixo}.created_at END) DESC,
    ${prefixo}.id ASC`;
}

/**
 * A forma ESCALAR correlacionada: o braço da pessoa, por linha da consulta de
 * fora. Irmã do `chaveDaPessoa` — as duas resolvem a MESMA identidade.
 *
 * A correlação usa os DOIS lados da chave: o visitante (pelo `colunaVisitor`) e o
 * contato (`c2.contact_id::text = chave`). Só por visitante, uma pessoa que
 * chegou por dois aparelhos — ou o visitante WhatsApp de um contato que é web —
 * cairia em `sem variante` e contaria em dois baldes.
 */
export function bracoDaPessoaSql(experimento: Experimento, opcoes: OpcoesDeBracoDaPessoa): SQL {
	const braco = bracoDaConversaSql(experimento, sql`c2`);
	const fato = fatoDaEtapaNaConversa(experimento.etapaAncora, sql`c2`);
	const visitante = opcoes.colunaVisitor ?? sql`v.visitor_id`;

	return sql`(
    SELECT ${braco}
    FROM conversations c2
    JOIN visits vp ON vp.id = c2.visit_id
    WHERE c2.is_simulated = false
      AND c2.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}
      AND ${braco} IS NOT NULL
      AND (${visitante} = vp.visitor_id OR c2.contact_id::text = ${opcoes.chave})
    ORDER BY ${ordenacaoDaPessoa(fato, sql`c2`)}
    LIMIT 1
  )`;
}

/**
 * O predicado de recorte no nível PESSOA, para os funis (Performance/Porta/
 * Origens/Campanhas/Mapa).
 *
 * `[]` ⇒ `null` (nenhum SQL novo). Vários experimentos ⇒ E lógico.
 */
export function condicaoDeBracoDaPessoa(
	recorte: RecorteAB,
	opcoes: OpcoesDeBracoDaPessoa,
): SQL | null {
	return conjuncao(
		paresValidos(recorte).map(({ experimento, braco }) => {
			const escalar = bracoDaPessoaSql(experimento, opcoes);
			return braco === SEM_BRACO ? sql`${escalar} IS NULL` : sql`${escalar} = ${braco}`;
		}),
	);
}

/** Onde o CTE do braço por pessoa é montado (Percurso e export `percurso`). */
export interface OpcoesDaCteDoBracoDaPessoa {
	/** Início da janela (instante). */
	de: Date;
	/** Fim da janela (instante). */
	ate: Date;
	/** A EXPRESSÃO da chave, já computada sobre a FONTE (`pv`) — a mesma do
	 *  `por_visita`: não se reimplementa resolução de identidade. */
	chave: SQL;
	/** A relação que dá o `id` que casa com `conversations.visit_id`. */
	fonte: SQL;
}

/**
 * O CTE `braco_da_pessoa(chave, braco)` — uma linha por pessoa, na forma do
 * refino 3 §4a. Quem monta o `WITH` faz o `LEFT JOIN` pela `chave`.
 *
 * `DISTINCT ON (chave)` com a ordenação canônica garante **no máximo uma linha
 * por pessoa**: cada pessoa ocupa exatamente um balde, e `A + B + sem variante =
 * total` fecha por construção.
 */
export function cteDoBracoDaPessoa(
	experimento: Experimento,
	opcoes: OpcoesDaCteDoBracoDaPessoa,
): SQL {
	const braco = bracoDaConversaSql(experimento, sql`c`);
	const fato = fatoDaEtapaNaConversa(experimento.etapaAncora, sql`c`);

	return sql`${sql.raw(NOME_DO_CTE_DO_BRACO_DA_PESSOA)} AS (
    SELECT DISTINCT ON (chave) chave, braco
    FROM (
      SELECT ${opcoes.chave} AS chave,
             ${braco} AS braco,
             c.id AS id,
             c.created_at AS created_at,
             ${fato ?? sql`false`} AS avancou
      FROM conversations c
      JOIN ${opcoes.fonte} pv ON pv.id = c.visit_id
      WHERE c.is_simulated = false
        AND c.created_at BETWEEN ${opcoes.de} AND ${opcoes.ate}
        AND ${braco} IS NOT NULL
    ) s
    ORDER BY chave, ${ordemDoCte(fato)}
  )`;
}

function ordemDoCte(fato: SQL | null): SQL {
	if (!fato) return sql`created_at DESC, id ASC`;
	return sql`avancou DESC,
    (CASE WHEN avancou THEN created_at END) ASC,
    (CASE WHEN NOT avancou THEN created_at END) DESC,
    id ASC`;
}

/** Os pares do recorte que o registro reconhece (o resto é descartado). */
function paresValidos(recorte: RecorteAB): Array<{ experimento: Experimento; braco: string }> {
	const pares: Array<{ experimento: Experimento; braco: string }> = [];
	for (const par of recorte) {
		const experimento = EXPERIMENTOS.find((exp) => exp.id === par.experimento);
		if (!experimento) continue;
		if (par.braco !== SEM_BRACO && !experimento.bracos.includes(par.braco)) continue;
		pares.push({ experimento, braco: par.braco });
	}
	return pares;
}

function conjuncao(condicoes: SQL[]): SQL | null {
	if (condicoes.length === 0) return null;
	return sql.join(condicoes, sql` AND `);
}
