/**
 * "Hoje", em SQL, no fuso do negócio — num lugar só.
 *
 * ── O defeito que este módulo existe para fechar ─────────────────────────────
 *
 * Quatro consultas do painel escreviam a mesma expressão à mão:
 *
 *     created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
 *
 * Ela PARECE certa e não é. `now() AT TIME ZONE 'America/Sao_Paulo'` devolve um
 * `timestamp` SEM fuso — a hora de parede em Brasília. O `::date` corta o dia
 * certo. Mas a comparação é contra `created_at`, que é `timestamptz`, então o
 * Postgres converte a data de volta para instante usando o `TimeZone` da
 * SESSÃO — e o servidor de produção roda em **UTC** (conferido: `SHOW TimeZone`
 * devolve `UTC`).
 *
 * O resultado, medido em produção em 24/08/2026:
 *
 *     (now() AT TIME ZONE 'America/Sao_Paulo')::date  →  2026-08-24
 *     ...comparado como timestamptz                    →  2026-08-24 00:00:00+00
 *     ...que em Brasília é                             →  2026-08-23 às 21:00
 *
 * Ou seja: "leads de hoje" começava às **21h de ONTEM**. Três horas do dia
 * anterior entravam no número — justamente o fim do expediente, quando alguém
 * abre o painel para fechar o dia. É um erro que só aparece à noite e some de
 * manhã, e por isso ninguém o pega olhando a tela.
 *
 * A forma correta trunca o dia no fuso do negócio e devolve o instante em que
 * ele começou, sem passar por `date`:
 *
 *     date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
 *
 * O segundo `AT TIME ZONE` faz o caminho de volta (timestamp → timestamptz),
 * então o resultado independe do fuso da sessão. É a mesma decisão que
 * `periodo.ts` toma do lado do TypeScript, para as telas com filtro de data —
 * aqui é a versão para as consultas que falam de "agora" e não podem receber
 * uma janela de fora.
 */

import { sql } from "drizzle-orm";

/** O fuso que o negócio enxerga. A operação é brasileira; o servidor é UTC. */
export const TZ_NEGOCIO_SQL = "America/Sao_Paulo";

/**
 * O instante em que o dia de hoje começou, no fuso do negócio.
 *
 * Use em toda comparação de "hoje" contra uma coluna `timestamptz`. Nunca
 * escreva `(now() AT TIME ZONE ...)::date` — ver o cabeçalho do arquivo.
 */
export const INICIO_DE_HOJE = sql`(date_trunc('day', now() AT TIME ZONE ${sql.raw(`'${TZ_NEGOCIO_SQL}'`)}) AT TIME ZONE ${sql.raw(`'${TZ_NEGOCIO_SQL}'`)})`;

/** O instante em que ONTEM começou. Mesma regra, um dia atrás. */
export const INICIO_DE_ONTEM = sql`(date_trunc('day', (now() AT TIME ZONE ${sql.raw(`'${TZ_NEGOCIO_SQL}'`)}) - interval '1 day') AT TIME ZONE ${sql.raw(`'${TZ_NEGOCIO_SQL}'`)})`;
