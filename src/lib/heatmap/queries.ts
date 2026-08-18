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
import { PADRAO_ROBO_SQL } from "@/lib/attribution/user-agent-robo";
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
	visitantes: number;
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
 * Evento anônimo (`visit_id IS NULL`) entra: ele não tem visita pra classificar,
 * e descartá-lo abriria buraco no mapa justamente do visitante que bloqueia
 * cookie.
 */
const EVENTO_DE_GENTE = sql`(
  pe.visit_id IS NULL
  OR EXISTS (
    SELECT 1 FROM visits v
    WHERE v.id = pe.visit_id
      AND (
        EXISTS (SELECT 1 FROM conversations cg WHERE cg.visit_id = v.id AND cg.is_simulated = false)
        OR (v.user_agent IS NOT NULL AND v.user_agent !~* ${PADRAO_ROBO_SQL})
      )
  )
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

	const [totais, secoes, alvos, pontos] = await Promise.all([
		db.execute<Record<string, unknown>>(sql`
      SELECT
        count(DISTINCT pe.visit_id) AS visitantes,
        count(*) FILTER (WHERE pe.type = 'click') AS cliques,
        count(*) FILTER (WHERE pe.type = 'rage_click') AS rage_cliques,
        COALESCE(avg(pe.scroll_pct) FILTER (WHERE pe.type = 'scroll_depth'), 0) AS scroll_medio
      FROM page_events pe
      WHERE ${base}
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

	return {
		path,
		visitantes: num(linha.visitantes),
		cliques: num(linha.cliques),
		rageCliques: num(linha.rage_cliques),
		scrollMedio: Math.round(num(linha.scroll_medio)),
		funil: montarFunilDeSecoes(
			secoes.rows.map((r) => ({ section: String(r.section), visitantes: num(r.visitantes) })),
			path,
		),
		alvos: montarAlvos(
			alvos.rows.map((r) => ({
				selector: r.selector ? String(r.selector) : null,
				label: r.label ? String(r.label) : "",
				section: r.section ? String(r.section) : null,
				cliques: num(r.cliques),
				rageCliques: num(r.rage_cliques),
			})),
		),
		pontos: pontos.rows.map((r) => ({
			x: num(r.x),
			y: num(r.y),
			peso: num(r.peso),
			raiva: num(r.raiva),
		})),
	};
}
