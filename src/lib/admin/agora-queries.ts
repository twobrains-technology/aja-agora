/**
 * Queries da tela "Agora".
 *
 * Tudo é relativo a `now()` no Postgres, não ao relógio do navegador: dois
 * operadores em fusos diferentes precisam ver a MESMA fila.
 *
 * Simulado nunca entra — a sala de guerra não pode mandar ninguém correr atrás
 * de uma conversa de teste.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type ConversaAoVivo,
	ESPERA_CRITICA_MIN,
	JANELA_AO_VIVO_MIN,
	type PulsoAgora,
} from "./agora-types";
import type { LeadStage } from "./lead-stages";
import { rotularOrigem } from "./origem-label";

function num(valor: unknown): number {
	return Number(valor ?? 0) || 0;
}

export async function computePulso(): Promise<PulsoAgora> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT count(*) FROM visits
        WHERE created_at > now() - interval '1 hour') AS visitas_ultima_hora,

      (SELECT count(DISTINCT c.id) FROM conversations c
        JOIN messages m ON m.conversation_id = c.id
        WHERE c.is_simulated = false
          AND m.created_at > now() - (${JANELA_AO_VIVO_MIN} * interval '1 minute')) AS conversas_ao_vivo,

      -- Última palavra do cliente: o agente (ou a mesa) ainda não respondeu.
      (SELECT count(*) FROM conversations c
        WHERE c.is_simulated = false
          AND (SELECT m.role FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC LIMIT 1) = 'user'
          AND (SELECT max(m.created_at) FROM messages m
                WHERE m.conversation_id = c.id) > now() - (${JANELA_AO_VIVO_MIN} * interval '1 minute')
      ) AS esperando_resposta,

      (SELECT count(*) FROM mesa_handoffs
        WHERE status = 'aberto' AND mesa_attendant_id IS NULL) AS sem_dono_na_mesa,

      (SELECT count(*) FROM mesa_handoffs
        WHERE status = 'em_andamento') AS em_atendimento_na_mesa,

      (SELECT count(*) FROM leads
        WHERE is_simulated = false
          AND created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS leads_hoje,

      (SELECT count(*) FROM lead_events le
        JOIN leads l ON l.id = le.lead_id AND l.is_simulated = false
        WHERE le.to_stage = 'fechado_ganho'
          AND le.created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS fechados_hoje
  `);

	const linha = resultado.rows[0] ?? {};
	return {
		visitasUltimaHora: num(linha.visitas_ultima_hora),
		conversasAoVivo: num(linha.conversas_ao_vivo),
		esperandoResposta: num(linha.esperando_resposta),
		semDonoNaMesa: num(linha.sem_dono_na_mesa),
		emAtendimentoNaMesa: num(linha.em_atendimento_na_mesa),
		leadsHoje: num(linha.leads_hoje),
		fechadosHoje: num(linha.fechados_hoje),
	};
}

/**
 * As conversas com movimento na última hora, mais recente primeiro.
 *
 * `DISTINCT ON` pega a última mensagem de cada conversa numa passada só —
 * fazer isso com subquery por linha custaria uma query por conversa numa tela
 * que atualiza sozinha.
 */
export async function computeConversasAoVivo(limite = 40): Promise<ConversaAoVivo[]> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    SELECT * FROM (
      SELECT DISTINCT ON (c.id)
        c.id                AS conversation_id,
        c.channel,
        c.status,
        c.contact_name,
        l.id                AS lead_id,
        l.name              AS lead_name,
        l.stage,
        m.role              AS ultima_role,
        m.content           AS ultima_content,
        m.created_at        AS ultima_at,
        EXTRACT(EPOCH FROM (now() - m.created_at)) / 60 AS minutos_parado,
        v.utm_source, v.utm_medium, v.utm_campaign, v.utm_content,
        v.ctwa_source_id, v.ctwa_headline,
        CASE WHEN v.referrer IS NOT NULL
          THEN split_part(regexp_replace(v.referrer, '^https?://', ''), '/', 1)
        END AS referrer_host
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
      LEFT JOIN visits v ON v.id = c.visit_id
      WHERE c.is_simulated = false
        AND m.created_at > now() - (${JANELA_AO_VIVO_MIN} * interval '1 minute')
      ORDER BY c.id, m.created_at DESC
    ) recentes
    ORDER BY ultima_at DESC
    LIMIT ${limite}
  `);

	return resultado.rows.map((linha) => {
		const ultimaRole = (linha.ultima_role as ConversaAoVivo["ultimaMensagemDe"]) ?? null;
		const ultimaAt =
			linha.ultima_at instanceof Date ? linha.ultima_at : new Date(String(linha.ultima_at));

		return {
			conversationId: String(linha.conversation_id),
			leadId: linha.lead_id ? String(linha.lead_id) : null,
			canal: linha.channel as "web" | "whatsapp",
			nome: (linha.lead_name as string) ?? (linha.contact_name as string) ?? null,
			stage: (linha.stage as LeadStage) ?? null,
			ultimaMensagem: (linha.ultima_content as string) ?? null,
			ultimaMensagemDe: ultimaRole,
			ultimaAtividadeAt: ultimaAt.toISOString(),
			minutosParado: Math.max(0, Math.round(num(linha.minutos_parado))),
			esperandoResposta: ultimaRole === "user",
			emHandoff: linha.status === "handed_off",
			origem: rotularOrigem({
				utmSource: (linha.utm_source as string) ?? null,
				utmMedium: (linha.utm_medium as string) ?? null,
				utmCampaign: (linha.utm_campaign as string) ?? null,
				utmContent: (linha.utm_content as string) ?? null,
				ctwaSourceId: (linha.ctwa_source_id as string) ?? null,
				ctwaHeadline: (linha.ctwa_headline as string) ?? null,
				referrerHost: (linha.referrer_host as string) ?? null,
			}),
		};
	});
}

/** Uma espera do cliente passou do ponto de doer? */
export function esperaCritica(conversa: ConversaAoVivo): boolean {
	return conversa.esperandoResposta && conversa.minutosParado >= ESPERA_CRITICA_MIN;
}
