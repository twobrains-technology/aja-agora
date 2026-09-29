// O investimento oficial do bloco de custos (integration-db).
//
// O que só o Postgres prova: que o investimento da Meta soma o nível
// `campaign` e só ele (os sub-níveis repetem o mesmo gasto — somá-los
// dobraria a verba), e que período sem leitura da Meta é `null` ("não
// reportado"), nunca R$ 0,00.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// A SUÍTE NÃO FALA COM O LANGFUSE. `computeCustosDoCpc` lê o custo de IA da
// fonte; escurecer as credenciais aqui faz a borda cair no caminho
// "fonte_indisponivel" sem tocar a rede — em qualquer máquina, com ou sem
// chave no ambiente. (O guard vive no arquivo, não no setup, para não afetar
// testes que legitimamente mockam a fonte.)
process.env.LANGFUSE_PUBLIC_KEY = "";
process.env.LANGFUSE_SECRET_KEY = "";
process.env.LANGFUSE_BASE_URL = "";

const JANELA_DE = new Date("2019-07-01T00:00:00Z");
const JANELA_ATE = new Date("2019-07-31T23:59:59Z");
const DIA = "2019-07-15";

describeIfDb("computeCustosDoCpc — investimento da Meta (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./performance-queries");

	const entities = ["custos-camp-1", "custos-camp-2", "custos-adset-1"];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./performance-queries");
	});

	afterAll(async () => {
		if (entities.length > 0) {
			await db
				.delete(schema.metaInsightsDiarios)
				.where(inArray(schema.metaInsightsDiarios.entityId, entities));
		}
	});

	it("soma só o nível campaign (sub-nível não entra duas vezes) e zera não é ausência", async () => {
		await db.insert(schema.metaInsightsDiarios).values([
			{ data: DIA, entityId: "custos-camp-1", nivel: "campaign", spendCents: 100_000 },
			{ data: DIA, entityId: "custos-camp-2", nivel: "campaign", spendCents: 200_000 },
			// O mesmo gasto por baixo, num sub-nível: NÃO pode entrar.
			{ data: DIA, entityId: "custos-adset-1", nivel: "adset", spendCents: 999_999 },
		]);

		const custos = await queries.computeCustosDoCpc(JANELA_DE, JANELA_ATE);

		expect(custos.investimentoMetaCents).toBe(300_000);
		expect(custos.fontes.investimento).toBe("Meta (reportado)");
	});

	it("período sem leitura da Meta é null — 'não reportado', nunca R$ 0,00", async () => {
		const custos = await queries.computeCustosDoCpc(
			new Date("2018-01-01T00:00:00Z"),
			new Date("2018-01-31T23:59:59Z"),
		);

		expect(custos.investimentoMetaCents).toBeNull();
	});
});