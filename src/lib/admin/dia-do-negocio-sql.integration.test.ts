/**
 * "Hoje" começa à meia-noite em Brasília — não às 21h de ontem (integration-db).
 *
 * Este teste roda contra o Postgres de verdade de propósito: o defeito NÃO é
 * expressável em TypeScript. Ele nasce da conversão que o próprio banco faz ao
 * comparar um `date` com um `timestamptz`, usando o `TimeZone` da sessão — e o
 * servidor de produção roda em UTC. Um teste unitário sobre a string do SQL
 * ficaria verde com o bug intacto, que foi exatamente o que aconteceu.
 *
 * Medido em produção em 24/08/2026: o card "Leads hoje" da tela Agora contava a
 * partir das 21h do dia anterior. Três horas de ontem dentro do número de hoje,
 * todo santo dia, e só visíveis à noite.
 *
 * O caso decisivo é o último: ele força a sessão para UTC (como em produção) e
 * mostra as duas expressões divergindo em três horas exatas. É a prova de que a
 * forma antiga estava errada, e não só "diferente".
 */

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { INICIO_DE_HOJE, INICIO_DE_ONTEM, TZ_NEGOCIO_SQL } from "./dia-do-negocio-sql";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const UMA_HORA_MS = 60 * 60 * 1000;

describeIfDb("o começo do dia do negócio, em SQL (integration)", () => {
	async function medir(fuso: string) {
		const { db } = await import("@/db");

		// A sessão é forçada de propósito: é o `TimeZone` dela que decide como o
		// Postgres converte `date` em instante, e é ele que difere entre a máquina
		// de quem desenvolve e o servidor.
		await db.execute(sql.raw(`SET TIME ZONE '${fuso}'`));

		const resultado = await db.execute<Record<string, unknown>>(sql`
      SELECT
        ${INICIO_DE_HOJE} AS correto,
        ${INICIO_DE_ONTEM} AS ontem,
        (now() AT TIME ZONE ${sql.raw(`'${TZ_NEGOCIO_SQL}'`)})::date AS jeito_antigo,
        now() AS agora,
        ${INICIO_DE_HOJE} AT TIME ZONE ${sql.raw(`'${TZ_NEGOCIO_SQL}'`)} AS correto_em_brt
    `);

		const linha = resultado.rows[0] ?? {};
		return {
			correto: new Date(linha.correto as string),
			ontem: new Date(linha.ontem as string),
			antigo: new Date(linha.jeito_antigo as string),
			agora: new Date(linha.agora as string),
			corretoEmBrt: String(linha.correto_em_brt),
		};
	}

	it("cai exatamente à meia-noite de Brasília", async () => {
		const { corretoEmBrt } = await medir("UTC");

		// Lido no fuso do negócio, o instante tem que ser 00:00:00 em ponto.
		expect(corretoEmBrt).toMatch(/00:00:00/);
	});

	it("é o mesmo DIA que o Brasil está vivendo, e nunca está no futuro", async () => {
		const { correto, agora } = await medir("UTC");

		const diaDoInicio = correto.toLocaleDateString("en-CA", { timeZone: TZ_NEGOCIO_SQL });
		const diaDeAgora = agora.toLocaleDateString("en-CA", { timeZone: TZ_NEGOCIO_SQL });

		expect(diaDoInicio).toBe(diaDeAgora);
		expect(correto.getTime()).toBeLessThanOrEqual(agora.getTime());
		expect(agora.getTime() - correto.getTime()).toBeLessThan(24 * UMA_HORA_MS);
	});

	it("ontem começa exatamente 24h antes de hoje", async () => {
		const { correto, ontem } = await medir("UTC");

		expect(correto.getTime() - ontem.getTime()).toBe(24 * UMA_HORA_MS);
	});

	it("NÃO começa às 21h de ontem — a diferença de três horas do jeito antigo", async () => {
		// A prova do defeito, medida DENTRO do SQL.
		//
		// A conta tem que ser feita aqui e não no JavaScript: o driver converte uma
		// coluna `date` usando o fuso do processo Node, então trazer os dois valores
		// para fora e subtrair mede o relógio da máquina de quem roda o teste, não o
		// do banco. O `::timestamptz` explícito é exatamente o que o Postgres faz
		// sozinho ao comparar aquela `date` com `created_at` num `WHERE`.
		const { db } = await import("@/db");
		await db.execute(sql.raw("SET TIME ZONE 'UTC'"));

		const r = await db.execute<Record<string, unknown>>(sql`
      SELECT EXTRACT(EPOCH FROM (
        ${INICIO_DE_HOJE} - ((now() AT TIME ZONE ${sql.raw(`'${TZ_NEGOCIO_SQL}'`)})::date)::timestamptz
      )) AS diferenca_seg
    `);

		expect(Number(r.rows[0]?.diferenca_seg)).toBe(3 * 60 * 60);
	});

	it("não depende do fuso da SESSÃO, e o jeito antigo dependia", async () => {
		// É esta a razão de o defeito ter sobrevivido: em Brasília — o fuso da
		// máquina de quem desenvolve — as duas expressões coincidem, e só divergem
		// no servidor, que roda em UTC. Testar na máquina de casa dava verde.
		const { db } = await import("@/db");

		async function diferencaCom(fuso: string) {
			await db.execute(sql.raw(`SET TIME ZONE '${fuso}'`));
			const r = await db.execute<Record<string, unknown>>(sql`
        SELECT EXTRACT(EPOCH FROM (
          ${INICIO_DE_HOJE} - ((now() AT TIME ZONE ${sql.raw(`'${TZ_NEGOCIO_SQL}'`)})::date)::timestamptz
        )) AS d
      `);
			return Number(r.rows[0]?.d);
		}

		expect(await diferencaCom(TZ_NEGOCIO_SQL)).toBe(0);
		expect(await diferencaCom("UTC")).toBe(3 * 60 * 60);
	});
});
