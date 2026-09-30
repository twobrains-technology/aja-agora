// O recorte de VARIANTE do teste do telefone — a parte que toca SQL.
//
// A variante vive em `conversations.metadata -> 'telefoneDoDesbloqueio' ->> 'variante'`
// (a chave tem um dono só: `CHAVE_DO_TESTE_NO_METADATA`, no módulo do FIX-403 —
// aqui ela é importada, nunca redigitada).
//
// ── O que este módulo NÃO faz ────────────────────────────────────────────────
//
// NÃO existe, aqui, nada de "derivar" variante de conversa sem metadata. O
// `varianteDaConversaPersistida` (teste do telefone) chuta uma variante por hash
// do id da visita — isso serve para a tela do teste, não para o recorte: no
// recorte, conversa sem metadata é `sem-variante`, ponto.
//
// ── Precedência, e por que o inválido não desce ──────────────────────────────
//
//   1. querystring `?variante` — o link compartilhado carrega o recorte;
//   2. cookie `aja_variante`   — é o que faz o recorte atravessar a navegação;
//   3. `null`                  — todas as variantes (o default; nenhum número
//                                muda com o filtro no default — C4).
//
// Um valor INVÁLIDO na querystring NÃO desce para o cookie: vira `null`
// ("todas"). É o mesmo que o seletor mostra nessa situação, então servidor e
// cliente não podem discordar sobre o que o recorte é.

import { type SQL, sql } from "drizzle-orm";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/resultado-do-teste-do-telefone";
import {
	COOKIE_DA_VARIANTE,
	type FiltroDeVariante,
	lerFiltroDeVariante,
	VARIANTE_SEM_VARIANTE,
} from "./filtro-variante-opcoes";

/** O nome do parâmetro de querystring que carrega o recorte. */
export const PARAMETRO_DA_VARIANTE = "variante";

/** Os valores aceitos pelo parâmetro, para quem precisa validar de fora. */
export const FILTROS_DE_VARIANTE = ["todas", "A", "B", "sem-variante"] as const;

/**
 * Lê o valor de UM cookie do cabeçalho `Cookie:` cru.
 *
 * Sem `next/headers` de propósito: assim o helper roda em qualquer `Request`
 * (inclusive um `new Request` de teste, sem subir servidor). O `try/catch` em
 * volta do `decodeURIComponent` é o detalhe que importa: `%` solto no cookie
 * (fácil de acontecer com filtro gravado à mão) lança `URIError` e derrubaria a
 * tela inteira por causa de um recorte — aqui ele só devolve o valor cru.
 */
function cookieDaRequisicao(cabecalho: string | null | undefined): string | null {
	if (!cabecalho) return null;

	for (const parte of cabecalho.split(";")) {
		const separador = parte.indexOf("=");
		if (separador < 0) continue;

		const nome = parte.slice(0, separador).trim();
		if (nome !== COOKIE_DA_VARIANTE) continue;

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
 * `const variante = varianteDaRequisicao(request);`
 */
export function varianteDaRequisicao(requisicao: Request): FiltroDeVariante | null {
	const { searchParams } = new URL(requisicao.url);
	const daUrl = searchParams.get(PARAMETRO_DA_VARIANTE);

	// Parâmetro PRESENTE manda — mesmo inválido. Só na ausência o cookie é lido.
	if (daUrl !== null) return lerFiltroDeVariante(daUrl);

	return lerFiltroDeVariante(cookieDaRequisicao(requisicao.headers.get("cookie")));
}

/**
 * A EXPRESSÃO da variante de uma conversa (`'A'` | `'B'` | NULL).
 *
 * Recebe a referência SQL da tabela/alias (`sql\`conversations\``, `sql\`c\``,
 * ...) porque quem chama já tem um JOIN montado e o filtro tem que falar sobre
 * a MESMA linha.
 */
export function varianteDaConversaSql(conversa: SQL): SQL {
	return sql`${conversa}.metadata -> ${CHAVE_DO_TESTE_NO_METADATA} ->> 'variante'`;
}

/**
 * O predicado de recorte, para as telas cuja linha É uma conversa (lista de
 * Conversas, Remarketing, exportação `conversas`/`toques`).
 *
 * `null` (todas) devolve `null` de propósito: sem filtro, NENHUM SQL novo entra
 * na consulta — é o que faz o default não mudar número nenhum.
 *
 * `sem-variante` é `COALESCE(…, '') NOT IN ('A','B')` e **não** `IS NULL`: um
 * valor fora da allowlist gravado no metadata (o `"C"` que o FIX-403 aposentou)
 * tem que cair em `sem-variante`; com `IS NULL` ele não cairia em balde nenhum
 * e `A + B + sem-variante = todas` deixaria de fechar.
 */
export function condicaoDeVarianteNaConversa(
	filtro: FiltroDeVariante | null,
	conversa: SQL = sql`conversations`,
): SQL | null {
	if (filtro === null) return null;

	const variante = varianteDaConversaSql(conversa);
	if (filtro === VARIANTE_SEM_VARIANTE) {
		return sql`coalesce(${variante}, '') not in ('A', 'B')`;
	}
	return sql`${variante} = ${filtro}`;
}

// B1b (segurada): varianteDaPessoa / condicaoDeVarianteDaPessoa /
// cteDaVarianteDaPessoa — corpo depende do fato da identificação (D1).
