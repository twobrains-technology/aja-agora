// Integration (DB real) — o resolvedor lendo o espelho e o ciclo gravando.
//
// Aqui moram os DOIS caminhos que enganam em silêncio:
//
// 1. o resolvedor achando (ou não) a campanha em `meta_entities` — e `null`
//    quando não acha, que NÃO é erro: a tela mantém o rótulo antigo;
// 2. a mesma chave `(data, entity_id)` chegando duas vezes (a Meta reprocessa
//    os últimos dias) — tem que virar UPDATE, nunca duplicata.
//
// Skip sem DB, no mesmo padrão de `gate-reengage-poll.integration.test.ts`.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** Carrega os módulos que falam com o banco SÓ quando há banco. Importar
 * `@/db` sem `DATABASE_URL` lança no topo do módulo — e aí nem o skip salva. */
async function carregar() {
	const [dbMod, schema, resolver, resolverDoBanco, ciclo] = await Promise.all([
		import("@/db"),
		import("@/db/schema"),
		import("./resolver"),
		// A metade que fala com o banco fica em arquivo separado (o `resolver.ts`
		// precisa ser puro: componente de cliente o importa).
		import("./resolver-do-banco"),
		import("@/lib/workers/meta-ads-sync-cycle"),
	]);
	return { db: dbMod.db, schema, resolver: { ...resolver, ...resolverDoBanco }, ciclo };
}

/** Não-nulo: os corpos só rodam com banco, quando `carregar()` já foi chamado. */
const ctx = (HAS_DB ? await carregar() : null) as Awaited<ReturnType<typeof carregar>>;

/** Ids de teste — prefixo próprio para a limpeza não tocar dado de outra coisa. */
const ID_CAMPANHA = "teste-b1-campanha-370999";
const ID_ANUNCIO = "teste-b1-anuncio-200104";
const DIA = "2026-09-16";
const NOME = "META | TESTE | B1 | ESPELHO";

describeIfDb("resolvedor lê o espelho e o ciclo faz upsert", () => {
	beforeEach(() => {
		ctx.resolver.semearCache([]);
	});

	afterEach(async () => {
		const { inArray } = await import("drizzle-orm");
		await ctx.db
			.delete(ctx.schema.metaInsightsDiarios)
			.where(inArray(ctx.schema.metaInsightsDiarios.entityId, [ID_CAMPANHA, ID_ANUNCIO]));
		await ctx.db
			.delete(ctx.schema.metaEntities)
			.where(inArray(ctx.schema.metaEntities.entityId, [ID_CAMPANHA, ID_ANUNCIO]));
	});

	async function semearCampanha(over: Partial<{ nome: string; status: string | null }> = {}) {
		await ctx.ciclo.gravarEntidades(
			[
				{
					entityId: ID_CAMPANHA,
					nivel: "campaign",
					nome: over.nome ?? NOME,
					status: over.status === undefined ? "ACTIVE" : over.status,
					accountId: "act_1594922312055163",
					parentEntityId: null,
				},
			],
			new Date(),
		);
	}

	it("resolve por campaign_id e por utm_campaign (nome), e semeia o cache", async () => {
		await semearCampanha();
		const chaveId = { tipo: "campaign_id" as const, valor: ID_CAMPANHA };
		const chaveUtm = { tipo: "utm_campaign" as const, valor: NOME };

		const resolvidas = await ctx.resolver.resolverCampanhas([chaveId, chaveUtm]);

		const chaveIdSerializada = ctx.resolver.serializarChave(chaveId);
		const chaveUtmSerializada = ctx.resolver.serializarChave(chaveUtm);
		expect(resolvidas.get(chaveIdSerializada)?.nome).toBe(NOME);
		expect(resolvidas.get(chaveIdSerializada)?.origemDaResolucao).toBe("id");
		expect(resolvidas.get(chaveUtmSerializada)?.origemDaResolucao).toBe("utm");
		// A renderização seguinte é síncrona e já acha, sem nova ida ao banco.
		expect(ctx.resolver.nomeCurto(chaveId)?.entityId).toBe(ID_CAMPANHA);
	});

	it("id desconhecido devolve null — e null não é erro", async () => {
		const chave = { tipo: "campaign_id" as const, valor: "teste-b1-nao-existe-000000" };
		const resolvidas = await ctx.resolver.resolverCampanhas([chave]);
		expect(resolvidas.size).toBe(0);
		expect(ctx.resolver.nomeCurto(chave)).toBeNull();
	});

	it("o ciclo atualiza a entidade existente em vez de duplicar (on conflict entity_id)", async () => {
		await semearCampanha({ nome: "NOME VELHO" });
		await semearCampanha({ nome: NOME, status: "PAUSED" });

		const { eq } = await import("drizzle-orm");
		const linhas = await ctx.db
			.select()
			.from(ctx.schema.metaEntities)
			.where(eq(ctx.schema.metaEntities.entityId, ID_CAMPANHA));
		expect(linhas).toHaveLength(1);
		expect(linhas[0]?.nome).toBe(NOME);
		expect(linhas[0]?.status).toBe("PAUSED");
	});

	it("grava o criativo do anúncio e o reescreve no upsert", async () => {
		const anuncio = (creativeName: string, thumbnailUrl: string | null) => ({
			entityId: ID_ANUNCIO,
			nivel: "ad" as const,
			nome: "ANUNCIO | CARRO | V1",
			status: "ACTIVE",
			accountId: null,
			parentEntityId: null,
			creativeId: "cri-1",
			creativeName,
			thumbnailUrl,
		});
		await ctx.ciclo.gravarEntidades([anuncio("IMG | V1", "https://x/t1.jpg")], new Date());
		await ctx.ciclo.gravarEntidades([anuncio("IMG | V2", "https://x/t2.jpg")], new Date());

		const { eq } = await import("drizzle-orm");
		const linhas = await ctx.db
			.select()
			.from(ctx.schema.metaEntities)
			.where(eq(ctx.schema.metaEntities.entityId, ID_ANUNCIO));
		expect(linhas).toHaveLength(1);
		expect(linhas[0]?.creativeId).toBe("cri-1");
		expect(linhas[0]?.creativeName).toBe("IMG | V2");
		expect(linhas[0]?.thumbnailUrl).toBe("https://x/t2.jpg");
	});

	it("sem criativo (permissão negada), o anúncio é gravado com campos nulos", async () => {
		await ctx.ciclo.gravarEntidades(
			[
				{
					entityId: ID_ANUNCIO,
					nivel: "ad" as const,
					nome: "ANUNCIO | SEM CRIATIVO",
					status: "ACTIVE",
					accountId: null,
					parentEntityId: null,
				},
			],
			new Date(),
		);
		const { eq } = await import("drizzle-orm");
		const linhas = await ctx.db
			.select()
			.from(ctx.schema.metaEntities)
			.where(eq(ctx.schema.metaEntities.entityId, ID_ANUNCIO));
		expect(linhas[0]?.creativeName).toBeNull();
		expect(linhas[0]?.thumbnailUrl).toBeNull();
	});

	it("a mesma chave (data, entity_id) vira UPDATE, não duplicata", async () => {
		let spend = 4210;
		let leads = 3;
		const deps = {
			env: { META_ADS_TOKEN_AJA: "token-de-teste" },
			// Nada de rede: o ciclo recebe o que a Marketing API teria devolvido.
			lerEntidades: async () => [],
			lerInsights: async () => [
				{
					data: DIA,
					entityId: ID_ANUNCIO,
					nivel: "ad" as const,
					spendCents: spend,
					impressions: 1000,
					clicks: 12,
					leads,
				},
			],
		};

		await ctx.ciclo.runMetaAdsSyncCycle(deps);
		// A Meta REPROCESSA o dia: o segundo ciclo traz o mesmo par com número novo.
		spend = 9900;
		leads = 5;
		await ctx.ciclo.runMetaAdsSyncCycle(deps);

		const { eq } = await import("drizzle-orm");
		const linhas = await ctx.db
			.select()
			.from(ctx.schema.metaInsightsDiarios)
			.where(eq(ctx.schema.metaInsightsDiarios.entityId, ID_ANUNCIO));
		expect(linhas).toHaveLength(1);
		expect(linhas[0]?.data).toBe(DIA);
		expect(linhas[0]?.spendCents).toBe(9900);
		expect(linhas[0]?.leads).toBe(5);
	});

	it("sem token, o ciclo não roda e não explode", async () => {
		let chamou = false;
		const resultado = await ctx.ciclo.runMetaAdsSyncCycle({
			env: {},
			lerEntidades: async () => {
				chamou = true;
				return [];
			},
		});
		expect(resultado.desligado).toBe("META_ADS_TOKEN_AJA ausente");
		expect(resultado.entidades).toBe(0);
		expect(chamou).toBe(false);
	});
});
