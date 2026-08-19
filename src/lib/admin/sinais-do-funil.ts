/**
 * Os critérios que definem cada degrau do funil, num lugar só.
 *
 * Nasceram dentro de `performance-queries.ts` e saíram quando a tela de
 * Percurso passou a responder a MESMA pergunta pessoa a pessoa. Duas telas do
 * painel com dois critérios de "viu oferta" seriam duas verdades para o mesmo
 * fato — e a que o time acreditasse seria a última que ele abriu.
 */

import { sql } from "drizzle-orm";
import { PADRAO_ROBO_SQL } from "@/lib/attribution/user-agent-robo";

/**
 * A visita é de GENTE — o denominador de toda taxa de aquisição.
 *
 * Medido no banco de produção em 15/08/2026: de 40.796 visitas em 30 dias,
 * 38.792 eram máquina, e 33.382 delas o health check do NOSSO ALB, que bate em
 * `/` a cada 30 segundos. Somar máquina e gente no mesmo denominador fazia a
 * tela mostrar 0,056% de visita → conversa quando a taxa sobre gente é 1,15%.
 *
 * **A âncora que impede o erro caro:** visita que PRODUZIU conversa nunca é
 * classificada como robô, qualquer que seja o user-agent. Fato do servidor
 * vence heurística — é o que protege o cliente atrás de proxy corporativo com
 * header estranho.
 *
 * Espera a tabela `visits` com alias `v`.
 */
export const VISITA_DE_GENTE = sql`(
  EXISTS (SELECT 1 FROM conversations cg WHERE cg.visit_id = v.id AND cg.is_simulated = false)
  OR (v.user_agent IS NOT NULL AND v.user_agent !~* ${PADRAO_ROBO_SQL})
)`;

/** Artifacts que provam que o cliente VIU número de oferta na tela. */
export const ARTIFACTS_DE_OFERTA = ["real_offer", "simulation_result"];

/** Os mesmos tipos, prontos para um `IN (...)` de SQL. */
export const ARTIFACTS_DE_OFERTA_SQL = sql.join(
	ARTIFACTS_DE_OFERTA.map((tipo) => sql`${tipo}`),
	sql`, `,
);
