// src/lib/heatmap/queries.ts
//
// A leitura do mapa de calor. Server-only.
//
// O filtro que dá razão de existir a esta tabela é `desfecho`: ele restringe o
// mapa a quem virou lead (ou fechou), respondendo "a página de quem COMPROU é
// diferente da página de quem saiu?". Ferramenta de terceiro não responde isso,
// porque ela não conhece `leads` — e é a resposta que decide o que muda na
// landing.

import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { chaveDaPessoa, VISITA_DE_GENTE } from "@/lib/admin/sinais-do-funil";
import { type AlvoDoMapa, type DegrauDoFunil, montarAlvos, montarFunilDeSecoes } from "./aggregate";
import type { Device } from "./events";

export type Desfecho = "todos" | "lead" | "ganho";
export type FiltroDevice = Device | "todos";

export interface FiltroMapa {
	path: string;
	from: Date;
	to: Date;
	device?: FiltroDevice;
	desfecho?: Desfecho;
}

/** Uma célula da nuvem de calor, já agregada — o cru nunca sai do banco. */
export interface PontoDoMapa {
	/** Posição horizontal relativa à largura da página (0..1). */
	x: number;
	/** Posição vertical absoluta no documento, em px, arredondada pela grade. */
	y: number;
	peso: number;
	raiva: number;
}

export interface MapaDeCalor {
	path: string;
	/**
	 * PESSOAS que deixaram algum evento nesta página, no recorte escolhido.
	 *
	 * Era `count(DISTINCT visit_id)` e virou pessoa em 24/08/2026, pela mesma
	 * razão que a tela de Performance: as três telas de medição abriam com três
	 * números diferentes para "quanta gente veio", e o operador não tinha como
	 * saber qual acreditar. A chave é a de `sinais-do-funil`, a MESMA do Percurso.
	 */
	visitantes: number;
	/**
	 * Quantas pessoas chegaram NESTA página no período — o denominador que faltava.
	 *
	 * Sem ele, "150 visitantes" parecia o total de quem visitou a Home, quando é
	 * só quem deixou rastro: em 24/08 foram 150 de 261, e as 111 restantes não
	 * eram gente que não interessou — eram gente que saiu antes de o coletor ter
	 * o que gravar. O número sozinho contava a metade otimista da história.
	 */
	pessoasNaPagina: number;
	cliques: number;
	rageCliques: number;
	scrollMedio: number;
	funil: DegrauDoFunil[];
	alvos: AlvoDoMapa[];
	pontos: PontoDoMapa[];
}

/**
 * Grade da nuvem: 1% da largura por 24px de altura.
 *
 * Existe pra que o painel receba centenas de células e não centenas de milhares
 * de cliques crus. 24px é a ordem de grandeza de uma linha de texto — mais fino
 * que isso não muda o desenho e só engorda a resposta.
 */
const GRADE_X = 100;
const GRADE_Y = 24;

/** Teto de células devolvidas. Acima disso a nuvem já saturou visualmente. */
const MAX_PONTOS = 1500;

/** Alvos listados. A cauda longa não cabe na tela nem informa decisão. */
const MAX_ALVOS = 40;

/**
 * Só evento de gente. Mesma regra e mesma lista de `performance-queries.ts`: de
 * 40.796 visitas medidas em produção, 38.792 eram máquina. Sem este corte o
 * health check do ALB desenharia um mapa de calor de si mesmo.
 *
 * A âncora vale aqui igual: visita que PRODUZIU conversa nunca é robô, seja qual
 * for o user-agent — fato do servidor vence heurística sobre texto livre.
 *
 * **Evento anônimo (`visit_id IS NULL`) fica de fora, e isso mudou em
 * 24/08/2026.** Ele entrava só no recorte "todos os visitantes", porque o filtro
 * de desfecho o descarta por construção — sem visita não há como saber no que
 * ele deu. O efeito era a linha de números do cabeçalho falar de duas
 * populações: `cliques` contava o anônimo e `visitantes` não, então a razão
 * entre os dois não fechava e, num recorte estreito, dava para ver cliques com
 * zero visitante. Pior: a tela pede ao operador que COMPARE "todos" com "só quem
 * virou lead", e a linha de base incluía gente que o outro recorte jamais
 * alcançaria. Medido na produção: 17 eventos anônimos em 2.204 (0,8%), 5 deles
 * cliques — o preço de perdê-los é pequeno perto de um denominador que mente.
 */
const EVENTO_DE_GENTE = sql`EXISTS (
  SELECT 1 FROM visits v
  WHERE v.id = pe.visit_id
    AND ${VISITA_DE_GENTE}
)`;

/**
 * Recorte por desfecho — a corrente `page_events` → `visits` → `conversations`
 * → `leads`.
 *
 * Note que `lead` e `ganho` excluem o evento anônimo por construção: sem visita
 * não há como saber o desfecho. É o preço correto a pagar — o filtro promete
 * "quem virou lead", e incluir quem não dá pra classificar mentiria no número.
 */
function recorteDesfecho(desfecho: Desfecho): SQL {
	if (desfecho === "todos") return sql`TRUE`;

	const estagio = desfecho === "ganho" ? sql` AND l.stage = 'fechado_ganho'` : sql``;

	return sql`EXISTS (
    SELECT 1 FROM conversations c
    JOIN leads l ON l.conversation_id = c.id
    WHERE c.visit_id = pe.visit_id
      AND c.is_simulated = false
      AND l.is_simulated = false${estagio}
  )`;
}

function recorteDevice(device: FiltroDevice): SQL {
	return device === "todos" ? sql`TRUE` : sql`pe.device = ${device}`;
}

function num(valor: unknown): number {
	const n = Number(valor);
	return Number.isFinite(n) ? n : 0;
}

export async function computeMapaDeCalor(filtro: FiltroMapa): Promise<MapaDeCalor> {
	const { path, from, to, device = "todos", desfecho = "todos" } = filtro;

	// O recorte comum a todas as consultas abaixo. Montado uma vez pra que um
	// filtro não possa valer numa consulta e faltar na outra — foi assim que a
	// mesma tela já mostrou funil de um recorte e alvos de outro em outros
	// painéis.
	const base = sql`
    pe.path = ${path}
    AND pe.created_at BETWEEN ${from} AND ${to}
    AND ${recorteDevice(device)}
    AND ${recorteDesfecho(desfecho)}
    AND ${EVENTO_DE_GENTE}
  `;

	const [totais, naPagina, rolagem, secoes, alvos, pontos] = await Promise.all([
		db.execute<Record<string, unknown>>(sql`
      SELECT
        count(DISTINCT ${chaveDaPessoa(from, to)}) AS visitantes,
        count(*) FILTER (WHERE pe.type = 'click') AS cliques,
        count(*) FILTER (WHERE pe.type = 'rage_click') AS rage_cliques
      FROM page_events pe
      JOIN visits v ON v.id = pe.visit_id
      WHERE ${base}
    `),

		// O denominador: quem CHEGOU nesta página no período, tenha deixado rastro
		// ou não. Fora do recorte de aparelho de propósito — aparelho é atributo do
		// EVENTO, e quem não deixou evento não tem aparelho conhecido. Pedir device
		// aqui excluiria justamente a parte silenciosa que este número existe para
		// revelar.
		db.execute<Record<string, unknown>>(sql`
      SELECT count(DISTINCT ${chaveDaPessoa(from, to)}) AS pessoas
      FROM visits v
      WHERE v.landing_path = ${path}
        AND v.created_at BETWEEN ${from} AND ${to}
        AND ${VISITA_DE_GENTE}
    `),

		// ROLAGEM MÉDIA — a média do ponto MAIS FUNDO de cada visitante.
		//
		// Saiu da consulta acima em 24/08/2026, e não por arrumação: como
		// `avg(scroll_pct)` sobre as linhas gravadas ela estava errada. O coletor
		// grava um marco por faixa cruzada (`MARCOS_SCROLL`, em
		// `heatmap-tracker.tsx`), então quem lê a página inteira deixa 25, 50, 75 e
		// 100 — quatro linhas, média 62,5. **O número era matematicamente incapaz
		// de chegar a 100%**, qualquer que fosse a página: uma landing cujos
		// visitantes rolassem TODOS até o rodapé mostraria 62,5%. O piso tinha o
		// mesmo vício ao contrário — quem para no primeiro quarto deixa uma linha
		// só, e puxa a média para 25.
		//
		// Foi assim que, em 24/08/2026, a produção mostrava `/autos` com 58,3% de
		// rolagem média tendo TODOS os visitantes rolado até o fim (100% de
		// verdade), e `/motos` com 62,5% no lugar de 100%.
		db.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(avg(mais_fundo), 0) AS scroll_medio
      FROM (
        SELECT max(pe.scroll_pct) AS mais_fundo
        FROM page_events pe
        WHERE ${base} AND pe.type = 'scroll_depth' AND pe.scroll_pct IS NOT NULL
        GROUP BY pe.visit_id
      ) por_visitante
    `),

		// Visitante DISTINTO por seção: uma pessoa que rola pra cima e pra baixo
		// dispara `section_view` várias vezes, e contar evento faria a seção do meio
		// da página parecer mais vista que o topo.
		db.execute<Record<string, unknown>>(sql`
      SELECT pe.section AS section, count(DISTINCT pe.visit_id) AS visitantes
      FROM page_events pe
      WHERE ${base} AND pe.type = 'section_view' AND pe.section IS NOT NULL
      GROUP BY pe.section
    `),

		db.execute<Record<string, unknown>>(sql`
      SELECT
        pe.selector AS selector,
        COALESCE(max(pe.label), '') AS label,
        max(pe.section) AS section,
        count(*) FILTER (WHERE pe.type = 'click') AS cliques,
        count(*) FILTER (WHERE pe.type = 'rage_click') AS rage_cliques
      FROM page_events pe
      WHERE ${base} AND pe.type IN ('click', 'rage_click')
      GROUP BY pe.selector
      ORDER BY count(*) DESC
      LIMIT ${MAX_ALVOS}
    `),

		db.execute<Record<string, unknown>>(sql`
      SELECT
        floor(pe.page_rel_x * ${GRADE_X}) / ${GRADE_X} AS x,
        floor(pe.page_y / ${GRADE_Y}) * ${GRADE_Y} AS y,
        count(*) AS peso,
        count(*) FILTER (WHERE pe.type = 'rage_click') AS raiva
      FROM page_events pe
      WHERE ${base}
        AND pe.type IN ('click', 'rage_click')
        AND pe.page_rel_x IS NOT NULL
        AND pe.page_y IS NOT NULL
      GROUP BY 1, 2
      ORDER BY count(*) DESC
      LIMIT ${MAX_PONTOS}
    `),
	]);

	const linha = totais.rows[0] ?? {};
	const cliques = num(linha.cliques);

	return {
		path,
		visitantes: num(linha.visitantes),
		pessoasNaPagina: num(naPagina.rows[0]?.pessoas),
		cliques,
		rageCliques: num(linha.rage_cliques),
		scrollMedio: Math.round(num(rolagem.rows[0]?.scroll_medio)),
		funil: montarFunilDeSecoes(
			secoes.rows.map((r) => ({ section: String(r.section), visitantes: num(r.visitantes) })),
			path,
		),
		// O total de cliques do PERÍODO vai junto de propósito. A consulta acima
		// devolve os `MAX_ALVOS` primeiros, e `montarAlvos` dividia pela soma do que
		// recebia — ou seja, pela cauda que coube na lista. Medido na produção em
		// 24/08/2026: a home tem 109 seletores distintos, os 40 devolvidos cobrem
		// 205 dos 280 cliques (73,2%), e o alvo mais clicado aparecia com 5,4%
		// quando a fatia dele sobre a página é 3,9%. A tela imprime "280 cliques"
		// uma linha acima da lista: os dois números tinham que fechar.
		alvos: montarAlvos(
			alvos.rows.map((r) => ({
				selector: r.selector ? String(r.selector) : null,
				label: r.label ? String(r.label) : "",
				section: r.section ? String(r.section) : null,
				cliques: num(r.cliques),
				rageCliques: num(r.rage_cliques),
			})),
			cliques,
		),
		pontos: pontos.rows.map((r) => ({
			x: num(r.x),
			y: num(r.y),
			peso: num(r.peso),
			raiva: num(r.raiva),
		})),
	};
}
