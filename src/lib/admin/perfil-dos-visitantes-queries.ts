/**
 * A leitura do perfil dos visitantes no banco.
 *
 * Uma query só, sobre `visits`, com o MESMO denominador do resto do painel
 * (`VISITA_CONTAVEL`): gente, e sem o eco de prefetch. O que o perfil mede é a
 * população que já aparece no card "Visitas na última hora" — aqui recortada no
 * dia e aberta em três eixos.
 *
 * **Novidade.** "Novo" é o visitante cuja PRIMEIRA visita é de hoje; todo o
 * resto é recorrente. A janela é o dia do negócio — decisão declarada, não
 * escondida: quem voltar amanhã conta como recorrente de novo. É a leitura que
 * o card ao lado torna conferível.
 *
 * **Origem.** Campanha quando há UTM ou id de campanha da Meta; referência
 * quando há `referrer`; direto é o resto. As três são exclusivas e somam as
 * chegadas do dia — nenhuma sobra para fora.
 *
 * **Dispositivo.** Lido do próprio `user_agent` declarado. É classificação
 * declarada no header, não heurística sobre texto livre de cliente.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { INICIO_DE_HOJE } from "./dia-do-negocio-sql";
import {
	type ContagensDoPerfil,
	montarPerfilDosVisitantes,
	type PerfilDosVisitantes,
} from "./perfil-dos-visitantes";
import { VISITA_CONTAVEL } from "./sinais-do-funil";

function num(valor: unknown): number {
	return Number(valor ?? 0) || 0;
}

/** O perfil dos visitantes do dia, no fuso do negócio. */
export async function computePerfilDosVisitantes(): Promise<PerfilDosVisitantes> {
	const resultado = await db.execute<Record<string, unknown>>(sql`
    WITH hoje AS (
      SELECT v.visitor_id, v.user_agent, v.utm_source, v.utm_campaign, v.campaign_id, v.referrer
      FROM visits v
      WHERE v.created_at >= ${INICIO_DE_HOJE}
        AND ${VISITA_CONTAVEL}
    ),
    pessoas AS (
      SELECT DISTINCT visitor_id FROM hoje
    )
    SELECT
      (SELECT count(*) FROM hoje) AS chegadas,
      (SELECT count(*) FROM pessoas) AS pessoas,
      (SELECT count(*) FROM pessoas p
        WHERE NOT EXISTS (
          SELECT 1 FROM visits ant
          WHERE ant.visitor_id = p.visitor_id
            AND ant.created_at < ${INICIO_DE_HOJE}
        )) AS novos,
      (SELECT count(*) FROM pessoas p
        WHERE EXISTS (
          SELECT 1 FROM visits ant
          WHERE ant.visitor_id = p.visitor_id
            AND ant.created_at < ${INICIO_DE_HOJE}
        )) AS recorrentes,
      (SELECT count(*) FROM hoje
        WHERE utm_source IS NOT NULL OR utm_campaign IS NOT NULL OR campaign_id IS NOT NULL) AS campanha,
      (SELECT count(*) FROM hoje
        WHERE utm_source IS NULL AND utm_campaign IS NULL AND campaign_id IS NULL
          AND referrer IS NOT NULL) AS referencia,
      (SELECT count(*) FROM hoje
        WHERE utm_source IS NULL AND utm_campaign IS NULL AND campaign_id IS NULL
          AND referrer IS NULL) AS direto,
      (SELECT count(*) FROM hoje
        WHERE user_agent ~* 'Mobile|Android|iPhone') AS mobile,
      (SELECT count(*) FROM hoje
        WHERE user_agent IS NULL OR user_agent !~* 'Mobile|Android|iPhone') AS desktop
  `);

	const linha = resultado.rows[0] ?? {};
	const contagens: ContagensDoPerfil = {
		chegadas: num(linha.chegadas),
		pessoas: num(linha.pessoas),
		novos: num(linha.novos),
		recorrentes: num(linha.recorrentes),
		campanha: num(linha.campanha),
		referencia: num(linha.referencia),
		direto: num(linha.direto),
		mobile: num(linha.mobile),
		desktop: num(linha.desktop),
	};

	return montarPerfilDosVisitantes(contagens);
}
