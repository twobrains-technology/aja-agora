/**
 * Queries da tela de Performance — o funil que começa na VISITA.
 *
 * Duas regras atravessam o arquivo:
 *
 * 1. **Simulado nunca entra.** `is_simulated` filtra conversa e lead em toda
 *    query. Teste interno inflando o relatório é como verba vai pro criativo
 *    errado. (Mesma regra do `realLeads` em `dashboard-queries.ts`.)
 * 2. **Nada é derivado de tabela de evento paralela.** Cada etapa vem da tabela
 *    que é dona do fato — a decisão está na spec de 2026-08-03.
 */

import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { rotularOrigem } from "./origem-label";
import {
	type CoberturaAtribuicao,
	ETAPAS_FUNIL_MIDIA,
	type EtapaFunilMidia,
	type LinhaOrigem,
	type PontoSerie,
} from "./performance-types";

/** Artifacts que provam que o cliente VIU número de oferta na tela. */
const ARTIFACTS_DE_OFERTA = ["real_offer", "simulation_result"];

/** O dia que o negócio enxerga. A operação é brasileira; o servidor é UTC. */
const TZ = "America/Sao_Paulo";

/**
 * Dia de um timestamp no fuso do negócio, já como TEXTO `YYYY-MM-DD`.
 *
 * Devolver texto, e não `date`, é de propósito: com `DATE(...)` o driver
 * converte a data pra `Date` no fuso do processo Node e o dia 15 vira 14 no
 * caminho de volta. Foi assim que o gráfico apareceu deslocado um dia no
 * primeiro teste de integração.
 */
function diaLocal(coluna: SQL): SQL {
	return sql`to_char(${coluna} AT TIME ZONE ${TZ}, 'YYYY-MM-DD')`;
}

/**
 * As chaves de dia entre duas datas, no MESMO fuso do agrupamento SQL. Caminha
 * ao meio-dia UTC pra que mudança de horário de verão não pule nem repita dia.
 */
function diasEntre(fromDate: Date, toDate: Date): string[] {
	const formatador = new Intl.DateTimeFormat("en-CA", {
		timeZone: TZ,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

	const inicio = formatador.format(fromDate);
	const fim = formatador.format(toDate);

	const chaves: string[] = [];
	let cursor = new Date(`${inicio}T12:00:00Z`);
	const limite = new Date(`${fim}T12:00:00Z`);

	while (cursor <= limite && chaves.length < 400) {
		chaves.push(formatador.format(cursor));
		cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
	}
	return chaves;
}

function pct(parte: number, todo: number): number {
	return todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0;
}

function num(valor: unknown): number {
	return Number(valor ?? 0) || 0;
}

// ─── Funil de mídia ─────────────────────────────────────────────────────────

export async function computeFunilMidia(fromDate: Date, toDate: Date): Promise<EtapaFunilMidia[]> {
	// `atribuida` é o coração da correção: TODA etapa depois de `visitas` conta
	// só conversa que nasceu de uma visita. Sem isso, conversa sem origem
	// (WhatsApp orgânico, conversa anterior à instrumentação) entrava no funil e
	// o resultado ficava maior que o topo — um funil que cresce, mostrando 328%.
	const atribuida = sql`c.is_simulated = false
    AND c.visit_id IS NOT NULL
    AND c.created_at BETWEEN ${fromDate} AND ${toDate}`;

	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT count(*) FROM visits v
        WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}) AS visitas,

      (SELECT count(*) FROM conversations c
        WHERE ${atribuida}) AS conversas,

      (SELECT count(DISTINCT c.id) FROM conversations c
        JOIN messages m ON m.conversation_id = c.id AND m.role = 'user'
        WHERE ${atribuida}) AS engajadas,

      -- Conta CONVERSAS com lead identificado, não leads: uma conversa com dois
      -- leads (dedup imperfeito) contaria duas vezes e passaria do total.
      (SELECT count(DISTINCT c.id) FROM conversations c
        JOIN leads l ON l.conversation_id = c.id
          AND l.is_simulated = false
          AND (l.phone IS NOT NULL OR l.email IS NOT NULL)
        WHERE ${atribuida}) AS identificados,

      (SELECT count(DISTINCT c.id) FROM conversations c
        JOIN messages m ON m.conversation_id = c.id
        JOIN artifacts a ON a.message_id = m.id
        WHERE ${atribuida}
          AND a.type IN (${sql.join(
						ARTIFACTS_DE_OFERTA.map((tipo) => sql`${tipo}`),
						sql`, `,
					)})) AS viram_oferta,

      (SELECT count(DISTINCT c.id) FROM conversations c
        JOIN bevi_proposals bp ON bp.conversation_id = c.id
        WHERE ${atribuida}) AS propostas,

      (SELECT count(DISTINCT c.id) FROM conversations c
        JOIN leads l ON l.conversation_id = c.id
          AND l.is_simulated = false
          AND l.stage = 'fechado_ganho'
        WHERE ${atribuida}) AS fechados
  `);

	const linha = resultado.rows[0] ?? {};
	const topo = num(linha.visitas);

	let anterior = 0;
	return ETAPAS_FUNIL_MIDIA.map((etapa, i) => {
		const count = num(linha[etapa.chave]);
		const quedaDaAnterior =
			i === 0 || anterior === 0 ? 0 : Math.max(0, pct(anterior - count, anterior));
		const resultadoEtapa: EtapaFunilMidia = {
			chave: etapa.chave,
			label: etapa.label,
			ajuda: etapa.ajuda,
			count,
			percentDoTopo: pct(count, topo),
			quedaDaAnterior,
		};
		anterior = count;
		return resultadoEtapa;
	});
}

// ─── Desempenho por origem ──────────────────────────────────────────────────

export async function computeOrigens(fromDate: Date, toDate: Date): Promise<LinhaOrigem[]> {
	// O host do referrer só entra no agrupamento quando NÃO há campanha: senão
	// uma mesma campanha alcançada por dois referrers viraria duas linhas com o
	// mesmo nome na tela.
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      v.utm_source, v.utm_medium, v.utm_campaign, v.utm_content,
      v.ctwa_source_id, v.ctwa_headline,
      CASE
        WHEN v.utm_source IS NULL AND v.ctwa_source_id IS NULL AND v.referrer IS NOT NULL
        THEN split_part(regexp_replace(v.referrer, '^https?://', ''), '/', 1)
      END AS referrer_host,
      count(DISTINCT v.id) AS visitas,
      count(DISTINCT c.id) AS conversas,
      count(DISTINCT l.id) FILTER (WHERE l.phone IS NOT NULL OR l.email IS NOT NULL) AS identificados,
      count(DISTINCT bp.id) AS propostas,
      count(DISTINCT l.id) FILTER (WHERE l.stage = 'fechado_ganho') AS fechados
    FROM visits v
    LEFT JOIN conversations c ON c.visit_id = v.id AND c.is_simulated = false
    LEFT JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
    LEFT JOIN bevi_proposals bp ON bp.conversation_id = c.id
    WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
    GROUP BY 1,2,3,4,5,6,7
  `);

	// Consolidação por RÓTULO: duas linhas do banco podem virar o mesmo nome na
	// tela (ex.: mesma campanha com e sem `utm_medium`). Somar aqui evita a tela
	// mostrar a mesma campanha duas vezes com números partidos.
	const porLabel = new Map<string, LinhaOrigem>();

	for (const linha of resultado.rows) {
		const origem = rotularOrigem({
			utmSource: (linha.utm_source as string) ?? null,
			utmMedium: (linha.utm_medium as string) ?? null,
			utmCampaign: (linha.utm_campaign as string) ?? null,
			utmContent: (linha.utm_content as string) ?? null,
			ctwaSourceId: (linha.ctwa_source_id as string) ?? null,
			ctwaHeadline: (linha.ctwa_headline as string) ?? null,
			referrerHost: (linha.referrer_host as string) ?? null,
		});

		const atual = porLabel.get(origem.label) ?? {
			origem,
			visitas: 0,
			conversas: 0,
			identificados: 0,
			propostas: 0,
			fechados: 0,
			taxaFechamento: 0,
		};

		atual.visitas += num(linha.visitas);
		atual.conversas += num(linha.conversas);
		atual.identificados += num(linha.identificados);
		atual.propostas += num(linha.propostas);
		atual.fechados += num(linha.fechados);

		porLabel.set(origem.label, atual);
	}

	return [...porLabel.values()]
		.map((linha) => ({ ...linha, taxaFechamento: pct(linha.fechados, linha.visitas) }))
		.sort((a, b) => b.visitas - a.visitas || b.fechados - a.fechados);
}

// ─── Série temporal ─────────────────────────────────────────────────────────

export async function computeSerie(fromDate: Date, toDate: Date): Promise<PontoSerie[]> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    WITH v AS (
      SELECT ${diaLocal(sql`created_at`)} AS dia, count(*) AS total
      FROM visits WHERE created_at BETWEEN ${fromDate} AND ${toDate} GROUP BY 1
    ),
    -- Mesma população do funil de mídia (conversa COM origem). Contar aqui o
    -- total e lá o atribuído colocaria dois números diferentes com o mesmo
    -- nome na mesma tela.
    c AS (
      SELECT ${diaLocal(sql`created_at`)} AS dia, count(*) AS total
      FROM conversations
      WHERE is_simulated = false AND visit_id IS NOT NULL
        AND created_at BETWEEN ${fromDate} AND ${toDate} GROUP BY 1
    ),
    l AS (
      SELECT ${diaLocal(sql`c.created_at`)} AS dia, count(DISTINCT c.id) AS total
      FROM conversations c
      JOIN leads l ON l.conversation_id = c.id
        AND l.is_simulated = false
        AND (l.phone IS NOT NULL OR l.email IS NOT NULL)
      WHERE c.is_simulated = false AND c.visit_id IS NOT NULL
        AND c.created_at BETWEEN ${fromDate} AND ${toDate} GROUP BY 1
    )
    SELECT
      COALESCE(v.dia, c.dia, l.dia) AS dia,
      COALESCE(v.total, 0) AS visitas,
      COALESCE(c.total, 0) AS conversas,
      COALESCE(l.total, 0) AS identificados
    FROM v FULL OUTER JOIN c ON c.dia = v.dia
           FULL OUTER JOIN l ON l.dia = COALESCE(v.dia, c.dia)
  `);

	const porDia = new Map<string, PontoSerie>();
	for (const linha of resultado.rows) {
		const dia = String(linha.dia);
		porDia.set(dia, {
			date: dia,
			visitas: num(linha.visitas),
			conversas: num(linha.conversas),
			identificados: num(linha.identificados),
		});
	}

	// Preenche os buracos: dia sem movimento tem que aparecer como zero, senão o
	// gráfico "pula" o feriado e a linha mente sobre a tendência.
	const pontos: PontoSerie[] = [];
	for (const chave of diasEntre(fromDate, toDate)) {
		pontos.push(porDia.get(chave) ?? { date: chave, visitas: 0, conversas: 0, identificados: 0 });
	}
	return pontos;
}

// ─── Cobertura de atribuição ────────────────────────────────────────────────

export async function computeCobertura(fromDate: Date, toDate: Date): Promise<CoberturaAtribuicao> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      count(*) FILTER (WHERE visit_id IS NOT NULL) AS com_origem,
      count(*) AS total
    FROM conversations
    WHERE is_simulated = false AND created_at BETWEEN ${fromDate} AND ${toDate}
  `);

	const linha = resultado.rows[0] ?? {};
	const conversasComOrigem = num(linha.com_origem);
	const conversasTotal = num(linha.total);

	return {
		conversasComOrigem,
		conversasTotal,
		percent: pct(conversasComOrigem, conversasTotal),
	};
}
