// A tela de campanhas contra Postgres real.
//
// Duas coisas só se provam aqui, e as duas são o coração da tarefa:
//
//   1. **O SQL agrupa por campanha** — a chave é o `campaign_id` da Meta, com a
//      UTM como plano B, e o gasto do gerenciador encosta na linha certa.
//   2. **A contagem do funil NÃO diverge** do `computeOrigens` da tela de
//      Performance: somando as linhas por campanha, os totais batem com o funil
//      por origem. Sem esta amarração, duas contagens divergem no primeiro dia.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { metaEntityNivelEnum } from "@/db/schema";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Janela isolada (2018) para que o que já existe no banco não entre na conta.
const JANELA_DE = new Date("2018-05-01T00:00:00Z");
const JANELA_ATE = new Date("2018-05-31T23:59:59Z");
const DENTRO = new Date("2018-05-15T12:00:00Z");

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

describeIfDb("campanhas — funil por campanha + gasto da Meta (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let campanhas: typeof import("./campanhas-queries");
	let performance: typeof import("./performance-queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const leadIds: string[] = [];
	const metaEntityIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		campanhas = await import("./campanhas-queries");
		performance = await import("./performance-queries");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db
				.delete(schema.beviProposals)
				.where(inArray(schema.beviProposals.conversationId, convIds));
			await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (leadIds.length > 0) {
			await db.delete(schema.leads).where(inArray(schema.leads.id, leadIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
		if (metaEntityIds.length > 0) {
			await db
				.delete(schema.metaEntities)
				.where(inArray(schema.metaEntities.entityId, metaEntityIds));
			await db
				.delete(schema.metaInsightsDiarios)
				.where(inArray(schema.metaInsightsDiarios.entityId, metaEntityIds));
		}
	});

	async function semearVisita(parcial: {
		campaignId?: string | null;
		utmSource?: string | null;
		utmCampaign?: string | null;
		/** Até onde a jornada chegou. */
		ate?: "visita" | "identificou" | "proposta";
	}): Promise<void> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `v-${crypto.randomUUID()}`,
				channel: "web",
				createdAt: DENTRO,
				userAgent: UA_GENTE,
				utmSource: parcial.utmSource ?? null,
				utmCampaign: parcial.utmCampaign ?? null,
				campaignId: parcial.campaignId ?? null,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);
		if (!parcial.ate || parcial.ate === "visita") return;

		const [conversa] = await db
			.insert(schema.conversations)
			.values({ channel: "web", visitId: visita.id, createdAt: DENTRO, updatedAt: DENTRO })
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conversa.id,
				name: "Cliente Teste",
				phone: "+5511900000000",
				stage: "qualificado",
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.leads.id });
		leadIds.push(lead.id);
		if (parcial.ate === "identificou") return;

		await db.insert(schema.beviProposals).values({
			conversationId: conversa.id,
			leadId: lead.id,
			proposalId: `prop-${crypto.randomUUID()}`,
			createdAt: DENTRO,
			updatedAt: DENTRO,
		});
	}

	beforeAll(async () => {
		// Campanha A: chave forte pelo `campaign_id` da Meta, com jornada completa.
		await semearVisita({ campaignId: "120250956902860104", utmSource: "ig", ate: "proposta" });
		await semearVisita({ campaignId: "120250956902860104", utmSource: "ig", ate: "identificou" });
		// Campanha B: só UTM — o resolvedor ainda não a conhece.
		await semearVisita({ utmSource: "fb", utmCampaign: "consorcio-agosto", ate: "identificou" });

		// O gerenciador conhece a campanha A e atribuiu mais leads do que o CRM.
		await db.insert(schema.metaEntities).values({
			entityId: "120250956902860104",
			nivel: "campaign",
			nome: "META | EXP | LEAD | BR | PLACEMENTS",
			status: "ACTIVE",
		});
		metaEntityIds.push("120250956902860104");

		// Campanha C: gastou e não apareceu no funil do CRM.
		await db.insert(schema.metaEntities).values({
			entityId: "120250999999990104",
			nivel: "campaign",
			nome: "TOFU - AJA | INTERESSES CARROS",
			status: "ACTIVE",
		});
		metaEntityIds.push("120250999999990104");

		await db.insert(schema.metaInsightsDiarios).values([
			{
				data: "2018-05-15",
				entityId: "120250956902860104",
				nivel: "campaign",
				spendCents: 120_000,
				leads: 9,
				impressions: 1000,
				clicks: 50,
			},
			{
				data: "2018-05-15",
				entityId: "120250999999990104",
				nivel: "campaign",
				spendCents: 80_000,
				leads: 4,
				impressions: 800,
				clicks: 40,
			},
		]);
	});

	it("agrupa por campanha e encosta o gasto na linha certa", async () => {
		const { linhas } = await campanhas.computeCampanhas(JANELA_DE, JANELA_ATE);

		const a = linhas.find((l) => l.chave === "120250956902860104");
		expect(a).toBeDefined();
		expect(a?.nome).toBe("META | EXP | LEAD | BR | PLACEMENTS");
		expect(a?.nomeResolvido).toBe(true);
		expect(a?.spendCents).toBe(120_000);
		expect(a?.leadsMeta).toBe(9);
		expect(a?.conversas).toBe(2);
		expect(a?.identificados).toBe(2);
		expect(a?.qualificados).toBe(2);
		expect(a?.propostas).toBe(1);
		expect(a?.diferencaDeLeads).toBe(7);
		// 120000 centavos ÷ 2 qualificados = 60000.
		expect(a?.custoPorQualificadoCents).toBe(60_000);

		// A campanha que só tem UTM aparece, sem nome resolvido e sem gasto.
		const b = linhas.find((l) => l.chave === "consorcio-agosto");
		expect(b).toBeDefined();
		expect(b?.nomeResolvido).toBe(false);
		expect(b?.nome).toBe("consorcio-agosto");
		expect(b?.conversas).toBe(1);
		expect(b?.spendCents).toBe(0);

		// A campanha que gastou e não trouxe ninguém também aparece.
		const c = linhas.find((l) => l.chave === "120250999999990104");
		expect(c).toBeDefined();
		expect(c?.spendCents).toBe(80_000);
		expect(c?.conversas).toBe(0);
	});

	it("a soma por campanha NÃO diverge do computeOrigens", async () => {
		const { linhas } = await campanhas.computeCampanhas(JANELA_DE, JANELA_ATE);
		const origens = await performance.computeOrigens(JANELA_DE, JANELA_ATE);

		const soma = (campo: "visitas" | "conversas" | "identificados" | "propostas" | "fechados") =>
			linhas.reduce((acc, l) => acc + l[campo], 0);

		// Semeadura 100% atribuída a campanha: as duas contagens têm que fechar.
		expect(soma("visitas")).toBe(origens.reduce((acc, o) => acc + o.visitas, 0));
		expect(soma("conversas")).toBe(origens.reduce((acc, o) => acc + o.conversas, 0));
		expect(soma("identificados")).toBe(origens.reduce((acc, o) => acc + o.identificados, 0));
		expect(soma("propostas")).toBe(origens.reduce((acc, o) => acc + o.propostas, 0));
		expect(soma("fechados")).toBe(origens.reduce((acc, o) => acc + o.fechados, 0));
	});
});

// Uma última asserção de higiene: o enum de nível do schema existe com os valores
// que a consulta usa. Se ele mudar, isto quebra antes da tela.
describe("vocabulário do espelho da Meta", () => {
	it("o nível 'campaign' é o que a tela consulta", () => {
		expect(metaEntityNivelEnum.enumValues).toContain("campaign");
	});
});
