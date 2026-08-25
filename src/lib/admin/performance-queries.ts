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
	type PortaDoFunil,
} from "./performance-types";
import {
	ARTIFACTS_DE_OFERTA_SQL,
	chaveDaPessoa,
	VISITA_CONTAVEL,
	VISITA_DE_GENTE,
	VISITA_NAO_E_ECO,
} from "./sinais-do-funil";

/** Quantos dias sem o cliente escrever até a conversa deixar de contar como viva. */
const DIAS_PARA_CONSIDERAR_VIVA = 7;

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
        WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
          AND ${VISITA_CONTAVEL}) AS visitas,

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
          AND a.type IN (${ARTIFACTS_DE_OFERTA_SQL})) AS viram_oferta,

      (SELECT count(DISTINCT c.id) FROM conversations c
        JOIN bevi_proposals bp ON bp.conversation_id = c.id
        WHERE ${atribuida}) AS propostas,

      (SELECT count(DISTINCT c.id) FROM conversations c
        JOIN leads l ON l.conversation_id = c.id
          AND l.is_simulated = false
          AND l.stage = 'fechado_ganho'
        WHERE ${atribuida}) AS fechados
  `);

	// ONDE CADA CONVERSA PAROU — e se ela ainda está de pé.
	//
	// O funil dizia "44,4% saíram aqui" e parava por aí. Duas conversas paradas
	// na mesma etapa pedem decisões opostas: a que morreu manda consertar o
	// agente; a que ainda responde manda puxar de volta (o watchdog de retomada
	// existe exatamente para isso). Sem separar, o painel manda consertar o que
	// só precisava de um empurrão.
	//
	// `lastInboundAt` não serve como sinal de vida: é específico do WhatsApp
	// (schema.ts). A última mensagem do CLIENTE vale nos dois canais.
	const paradas = await db.execute<Record<string, unknown>>(sql`
    WITH conv AS (
      SELECT
        c.id,
        c.status,
        (SELECT max(m.created_at) FROM messages m
          WHERE m.conversation_id = c.id AND m.role = 'user') AS ultimo_inbound,
        EXISTS (SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id AND m.role = 'user') AS engajou,
        EXISTS (SELECT 1 FROM leads l
          WHERE l.conversation_id = c.id AND l.is_simulated = false
            AND (l.phone IS NOT NULL OR l.email IS NOT NULL)) AS identificou,
        EXISTS (SELECT 1 FROM messages m
          JOIN artifacts a ON a.message_id = m.id
          WHERE m.conversation_id = c.id
            AND a.type IN (${ARTIFACTS_DE_OFERTA_SQL})) AS viu_oferta,
        EXISTS (SELECT 1 FROM bevi_proposals bp
          WHERE bp.conversation_id = c.id) AS teve_proposta,
        EXISTS (SELECT 1 FROM leads l
          WHERE l.conversation_id = c.id AND l.is_simulated = false
            AND l.stage = 'fechado_ganho') AS fechou
      FROM conversations c
      WHERE ${atribuida}
    ),
    profundidade AS (
      SELECT
        id,
        CASE
          WHEN fechou THEN 6
          WHEN teve_proposta THEN 5
          WHEN viu_oferta THEN 4
          WHEN identificou THEN 3
          WHEN engajou THEN 2
          ELSE 1
        END AS etapa,
        -- Viva = o cliente escreveu na janela recente e ninguém encerrou a
        -- conversa. Conversa encerrada não é retomável, por mais nova que seja.
        (ultimo_inbound >= now() - ${sql.raw(`interval '${DIAS_PARA_CONSIDERAR_VIVA} days'`)}
          AND status = 'active') AS viva
      FROM conv
    )
    SELECT etapa, count(*) AS pararam, count(*) FILTER (WHERE viva) AS vivas
    FROM profundidade GROUP BY etapa
  `);

	// Índice da etapa (1..6) → quantas pararam ali e quantas seguem vivas.
	const pararamPorEtapa = new Map<number, { pararam: number; vivas: number }>();
	for (const p of paradas.rows) {
		pararamPorEtapa.set(num(p.etapa), { pararam: num(p.pararam), vivas: num(p.vivas) });
	}

	const linha = resultado.rows[0] ?? {};
	const topo = num(linha.visitas);
	const conversas = num(linha.conversas);

	let anterior = 0;
	return ETAPAS_FUNIL_MIDIA.map((etapa, i) => {
		const count = num(linha[etapa.chave]);
		const quedaDaAnterior =
			i === 0 || anterior === 0 ? 0 : Math.max(0, pct(anterior - count, anterior));
		// `visitas` é o índice 0 do array e não é etapa de conversa — a
		// profundidade 1 ("abriu e não escreveu") casa com `conversas`, no índice 1.
		const parada = pararamPorEtapa.get(i);
		const resultadoEtapa: EtapaFunilMidia = {
			chave: etapa.chave,
			label: etapa.label,
			ajuda: etapa.ajuda,
			count,
			percentDoTopo: pct(count, topo),
			percentDasConversas: etapa.chave === "visitas" ? 100 : pct(count, conversas),
			quedaDaAnterior,
			pararamAqui: parada?.pararam ?? 0,
			aindaVivas: parada?.vivas ?? 0,
		};
		anterior = count;
		return resultadoEtapa;
	});
}

/**
 * O limiar de entrada: quantas chegadas viraram conversa.
 *
 * Separado do funil de propósito — ver `PortaDoFunil`.
 */
export async function computePorta(fromDate: Date, toDate: Date): Promise<PortaDoFunil> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      -- PESSOAS, com a MESMA chave que a tela de Percurso usa (sinais-do-funil).
      -- Duas telas contando a mesma população por definicoes diferentes foi o
      -- defeito que este numero existe para fechar.
      (SELECT count(DISTINCT ${chaveDaPessoa(fromDate, toDate)}) FROM visits v
        WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
          AND ${VISITA_DE_GENTE}) AS pessoas,
      (SELECT count(*) FROM visits v
        WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
          AND ${VISITA_CONTAVEL}) AS visitas,
      (SELECT count(*) FROM conversations c
        WHERE c.is_simulated = false
          AND c.visit_id IS NOT NULL
          AND c.created_at BETWEEN ${fromDate} AND ${toDate}) AS conversas,
      (SELECT count(*) FROM conversations c
        WHERE c.is_simulated = false
          AND c.visit_id IS NOT NULL
          AND c.channel = 'web'
          AND c.created_at BETWEEN ${fromDate} AND ${toDate}) AS web,
      (SELECT count(*) FROM conversations c
        WHERE c.is_simulated = false
          AND c.visit_id IS NOT NULL
          AND c.channel = 'whatsapp'
          AND c.created_at BETWEEN ${fromDate} AND ${toDate}) AS whatsapp
  `);
	const linha = resultado.rows[0] ?? {};
	const pessoas = num(linha.pessoas);
	const visitas = num(linha.visitas);
	const conversas = num(linha.conversas);
	return {
		pessoas,
		visitas,
		conversas,
		// Sobre PESSOAS, não sobre chegadas: contar a mesma pessoa quatro vezes no
		// denominador afundava a taxa sem que nada tivesse piorado na operação.
		taxaDeEntrada: pct(conversas, pessoas),
		web: num(linha.web),
		whatsapp: num(linha.whatsapp),
	};
}

// ─── Desempenho por origem ──────────────────────────────────────────────────

export async function computeOrigens(fromDate: Date, toDate: Date): Promise<LinhaOrigem[]> {
	// O host do referrer só entra no agrupamento quando NÃO há campanha: senão
	// uma mesma campanha alcançada por dois referrers viraria duas linhas com o
	// mesmo nome na tela.
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      -- Fonte em minúscula: o que chega aqui é o que o anunciante DIGITOU na
      -- UTM, e "IG" e "ig" são a mesma campanha. Sem normalizar, a mesma
      -- campanha virava duas linhas na tabela com os números partidos — o
      -- defeito que a consolidação por rótulo, logo abaixo, existe para evitar
      -- e que ela não pegava por ser sensível a caixa.
      lower(v.utm_source) AS utm_source,
      v.utm_medium, v.utm_campaign, v.utm_content,
      v.ctwa_source_id, v.ctwa_headline,
      CASE
        WHEN v.utm_source IS NULL AND v.ctwa_source_id IS NULL AND v.referrer IS NOT NULL
        THEN split_part(regexp_replace(v.referrer, '^https?://', ''), '/', 1)
      END AS referrer_host,
      -- Só a CONTAGEM despreza o eco. O eco não pode sair do WHERE porque a
      -- conversa fica ligada à ÚLTIMA visita da rajada (o cookie da sessão
      -- termina apontando para ela): filtrar as linhas aqui apagaria da tabela
      -- por origem 18 das 47 conversas com visita, medido em produção.
      count(DISTINCT v.id) FILTER (WHERE ${VISITA_NAO_E_ECO}) AS visitas,
      count(DISTINCT c.id) AS conversas,
      -- CONVERSAS identificadas, não leads — a mesma definição que o funil usa
      -- em computeFunilMidia. Contando leads, uma conversa com dedup imperfeito
      -- entrava duas vezes: a coluna "Identificados" da tabela podia divergir da
      -- etapa "Se identificaram" do funil, na mesma tela, com o mesmo rótulo.
      count(DISTINCT c.id) FILTER (WHERE l.phone IS NOT NULL OR l.email IS NOT NULL) AS identificados,
      count(DISTINCT bp.id) AS propostas,
      count(DISTINCT l.id) FILTER (WHERE l.stage = 'fechado_ganho') AS fechados
    FROM visits v
    LEFT JOIN conversations c ON c.visit_id = v.id AND c.is_simulated = false
    LEFT JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
    LEFT JOIN bevi_proposals bp ON bp.conversation_id = c.id
    WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
      AND ${VISITA_DE_GENTE}
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
      SELECT ${diaLocal(sql`v.created_at`)} AS dia, count(*) AS total
      FROM visits v WHERE v.created_at BETWEEN ${fromDate} AND ${toDate}
        AND ${VISITA_CONTAVEL}
      GROUP BY 1
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
