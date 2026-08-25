/**
 * Os critérios que definem cada degrau do funil, num lugar só.
 *
 * Nasceram dentro de `performance-queries.ts` e saíram quando a tela de
 * Percurso passou a responder a MESMA pergunta pessoa a pessoa. Duas telas do
 * painel com dois critérios de "viu oferta" seriam duas verdades para o mesmo
 * fato — e a que o time acreditasse seria a última que ele abriu.
 */

import { type SQL, sql } from "drizzle-orm";
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

/**
 * A CHAVE que identifica uma PESSOA — o contato quando conhecido, senão o
 * visitante (device).
 *
 * Existe como fragmento único porque três telas passaram a contar pessoas e
 * duas definições "equivalentes" divergem no primeiro caso raro: medido em
 * produção em 24/08/2026, numa janela de 30 dias `visitor_id` puro dá 3.016 e a
 * chave com contato dá 3.011 — cinco pessoas que chegaram por dois aparelhos e
 * o painel contaria duas vezes. Em um dia os dois coincidem, e é assim que uma
 * divergência dessas passa despercebida por semanas.
 *
 * O contato é o da PRIMEIRA conversa que o resolveu dentro da janela — é ele que
 * funde a chegada pela web e a pelo WhatsApp da mesma pessoa numa linha só.
 *
 * A coluna do visitante entra por parâmetro porque cada consulta chega aqui com
 * um alias diferente (`v` nas de Performance, `vi` no CTE do Percurso). Acoplar
 * ao alias faria o fragmento compilar num lugar e explodir no outro.
 */
export function chaveDaPessoa(de: Date, ate: Date, colunaVisitor: SQL = sql`v.visitor_id`): SQL {
	return sql`COALESCE(
    (SELECT c.contact_id::text
       FROM conversations c
       JOIN visits vp ON vp.id = c.visit_id
      WHERE vp.visitor_id = ${colunaVisitor}
        AND vp.created_at BETWEEN ${de} AND ${ate}
        AND c.contact_id IS NOT NULL
        AND c.is_simulated = false
      ORDER BY c.updated_at ASC
      LIMIT 1),
    ${colunaVisitor}
  )`;
}

/** Quanto tempo depois da anterior uma visita do mesmo visitante ainda é eco. */
const JANELA_DE_ECO = "2 seconds";

/**
 * A visita não é ECO de outra — o mesmo visitante gravado de novo em instantes.
 *
 * **O que aconteceu.** Depois de hidratar, o App Router dispara `fetch` de
 * prefetch para a própria rota, carregando junto a query string da página. Como
 * a URL de anúncio traz UTM, e `decideVisit` abria visita nova sempre que havia
 * campanha, cada prefetch virava uma chegada: uma navegação = QUATRO linhas em
 * `visits`, reproduzido duas vezes no navegador em 24/08/2026. Em produção,
 * naquele dia, 390 das 756 chegadas (51,6%) eram eco — e só no tráfego pago,
 * que é 100% do investimento em mídia.
 *
 * **Por que o filtro existe mesmo com o defeito já corrigido.** O `proxy.ts`
 * parou de gravar o eco a partir de 24/08/2026, mas o histórico de 13/08 em
 * diante já está no banco, e é ele que a tela mostra quando alguém abre "30d".
 * Sem esta leitura, o painel continuaria inflado por trinta dias — e a decisão
 * (24/08, do Kairo) foi limpar na LEITURA, não apagar linha: o dado cru fica
 * para auditoria e para provar o próprio defeito.
 *
 * **Por que 2 segundos.** O eco medido nasce entre 8ms e 1,4s depois do
 * original; a menor distância entre duas chegadas humanas reais observadas está
 * na casa dos minutos. Dois segundos separa os dois mundos com folga larga dos
 * dois lados. Não é heurística sobre comportamento: é o tempo de rede de um
 * prefetch.
 *
 * Espera a tabela `visits` com alias `v`, como `VISITA_DE_GENTE`.
 */
export const VISITA_NAO_E_ECO = sql`NOT EXISTS (
  SELECT 1 FROM visits eco
  WHERE eco.visitor_id = v.visitor_id
    AND eco.created_at < v.created_at
    AND v.created_at - eco.created_at < ${sql.raw(`interval '${JANELA_DE_ECO}'`)}
)`;

/**
 * A visita que CONTA como chegada: de gente e não repetida.
 *
 * É este o denominador de toda taxa de aquisição do painel. Os dois cortes
 * andam juntos de propósito — uma tela que aplicasse só um deles mostraria uma
 * população diferente das outras, com o mesmo rótulo, e o operador não teria
 * como saber qual das duas acreditar.
 */
export const VISITA_CONTAVEL = sql`(${VISITA_DE_GENTE} AND ${VISITA_NAO_E_ECO})`;

/** Artifacts que provam que o cliente VIU número de oferta na tela. */
export const ARTIFACTS_DE_OFERTA = ["real_offer", "simulation_result"];

/** Os mesmos tipos, prontos para um `IN (...)` de SQL. */
export const ARTIFACTS_DE_OFERTA_SQL = sql.join(
	ARTIFACTS_DE_OFERTA.map((tipo) => sql`${tipo}`),
	sql`, `,
);
