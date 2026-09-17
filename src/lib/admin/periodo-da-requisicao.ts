/**
 * O PERÍODO DA REQUISIÇÃO — URL > cookie > hoje, num lugar só.
 *
 * O defeito que este módulo fecha é o filtro ser da TELA e não da PESSOA: a
 * pessoa escolhia 30 dias no Acompanhamento, clicava em Percurso e voltava para
 * hoje, porque cada tela resolvia o período por conta própria e nenhuma lembrava
 * da escolha anterior. As quatro rotas que resolvem período no servidor
 * (`performance`, `percurso`, `dashboard`, `heatmap`) repetiam a mesma linha
 * `resolverPeriodo(sp.get("from"), sp.get("to"))`; agora todas chamam
 * `periodoDaRequisicao(request)` e a regra existe uma vez.
 *
 * ── A precedência, e por que ela é esta ──────────────────────────────────────
 *
 *   1. querystring `?from&to` — um link compartilhado continua mandando o
 *      período junto; é o que as rotas já liam e o que o filtro escreve;
 *   2. cookie `aja_periodo`     — é o que faz o período atravessar a navegação
 *      sem que cada link do menu precise carregá-lo;
 *   3. hoje                     — quem nunca escolheu nada, e sessão nova.
 *
 * Cookie e não `localStorage` porque o SERVIDOR também resolve o período: em
 * `localStorage` o dado só existiria no navegador e as duas pontas divergiriam
 * na primeira tela aberta.
 *
 * ── Entrada de usuário não derruba a tela ────────────────────────────────────
 *
 * Data inválida na querystring NÃO vira erro 400: ela é tratada como ausente e a
 * resolução desce um nível (`?from=ontem` cai no cookie; sem cookie, em hoje).
 * Um filtro salvo em favorito, ou um link velho, abre o painel — não uma tela de
 * erro. A precedência é por CAMPO: um `from` válido na URL convive com o `ate`
 * do cookie.
 */

import {
	COOKIE_DO_PERIODO,
	diaDoNegocio,
	diaDoParametro,
	diasDoCookie,
	type Periodo,
	periodoPadrao,
	resolverPeriodo,
} from "./periodo";

export interface OpcoesDoPeriodo {
	/** O `from` cru da querystring (dia `YYYY-MM-DD` ou ISO completo). */
	from?: string | null;
	/** O `to` cru da querystring. */
	to?: string | null;
	/** O valor cru do cookie `aja_periodo` (`YYYY-MM-DD_YYYY-MM-DD`). */
	cookie?: string | null;
	/** Injetável para o teste; em produção é o relógio. */
	agora?: Date;
}

/**
 * O núcleo PURO da resolução — sem `next/headers`, sem `Request`, sem relógio
 * próprio. É este que o teste chama com cookie e querystring falsos.
 */
export function resolverPeriodoDaRequisicao({
	from = null,
	to = null,
	cookie = null,
	agora = new Date(),
}: OpcoesDoPeriodo = {}): Periodo {
	const doCookie = diasDoCookie(cookie);

	// Um campo de cada vez: o valor da URL vence, o do cookie é o segundo
	// degrau, e hoje é o chão. Nunca sobra `undefined` para chegar ao
	// `resolverPeriodo`, então ele nunca devolve `null` daqui.
	const diaDe = diaDoParametro(from) ?? doCookie?.de ?? diaDoNegocio(agora);
	const diaAte = diaDoParametro(to) ?? doCookie?.ate ?? diaDoNegocio(agora);

	return resolverPeriodo(diaDe, diaAte, agora) ?? periodoPadrao(agora);
}

/**
 * Lê o valor do cookie de um cabeçalho `Cookie:` cru.
 *
 * Sem `next/headers` de propósito: assim o helper roda em qualquer `Request`
 * (inclusive um `new Request` de teste, sem subir servidor) e não arrasta o
 * runtime do Next para dentro do teste unitário.
 */
export function cookieDoCabecalho(cabecalho: string | null | undefined): string | null {
	if (!cabecalho) return null;

	for (const parte of cabecalho.split(";")) {
		const separador = parte.indexOf("=");
		if (separador < 0) continue;

		const nome = parte.slice(0, separador).trim();
		if (nome !== COOKIE_DO_PERIODO) continue;

		const valor = parte.slice(separador + 1).trim();
		try {
			return decodeURIComponent(valor);
		} catch {
			// `%` solto no cookie não pode derrubar a leitura do período.
			return valor;
		}
	}

	return null;
}

/**
 * UMA linha para as rotas: lê querystring + cookie e devolve o período.
 *
 * `const { de: from, ate: to } = periodoDaRequisicao(request);`
 */
export function periodoDaRequisicao(requisicao: Request): Periodo {
	const { searchParams } = new URL(requisicao.url);

	return resolverPeriodoDaRequisicao({
		from: searchParams.get("from"),
		to: searchParams.get("to"),
		cookie: cookieDoCabecalho(requisicao.headers.get("cookie")),
	});
}
