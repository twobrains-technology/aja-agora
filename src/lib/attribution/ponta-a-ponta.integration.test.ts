// A7 (integration-db) — a origem da campanha sobrevive do clique no anúncio até
// o evento que volta para a Meta.
//
// ── Por que este teste existe ───────────────────────────────────────────────
//
// A planilha marca "validar que UTM e pixel sobrevivem à navegação" como parte
// do item de Core Web Vitals, e o Connect Rate de 94% dá o motivo: **6 de cada
// 100 cliques pagos não viram sessão** — em 2.473 cliques/mês são ~149 pessoas
// pagas e perdidas. Parte disso é performance; parte é atribuição que se perde
// no caminho e faz a campanha parecer pior do que é.
//
// Os pedaços já tinham teste cada um por si (`proxy.landing-atribuicao.test.ts`
// cobre a leitura da URL, `visit-store.integration.test.ts` cobre a gravação,
// `registry.integration.test.ts` cobre o evento). O que não existia era o teste
// da CORRENTE — e corrente é exatamente o tipo de coisa em que cada elo passa
// no seu teste e o conjunto mesmo assim arrebenta, sem nada ficar vermelho.
//
// O caminho conferido aqui, inteiro:
//
//   anúncio com ?utm_*&fbclid  →  visits (origem gravada)
//                              →  conversations.visit_id
//                              →  conversion_events (fbc montado, fbp copiado)
//
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseCampaignParams } from "./params";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** A URL como a Meta a entrega ao clicar num anúncio de tráfego. */
const URL_DO_ANUNCIO =
	"https://ajaagora.com.br/autos?utm_source=facebook&utm_medium=cpc" +
	"&utm_campaign=bofu-carro-agosto&utm_content=criativo-03&utm_term=consorcio-carro" +
	"&fbclid=IwAR1exemploDeClickIdDaMeta";

describeIfDb("A7 — a origem sobrevive do anúncio ao evento de conversão", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let store: typeof import("./visit-store");
	let registrarConversao: typeof import("@/lib/conversions/registry").registrarConversao;

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const leadIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		store = await import("./visit-store");
		({ registrarConversao } = await import("@/lib/conversions/registry"));
	});

	afterAll(async () => {
		if (leadIds.length > 0) {
			await db
				.delete(schema.conversionEvents)
				.where(inArray(schema.conversionEvents.leadId, leadIds));
			await db.delete(schema.leads).where(inArray(schema.leads.id, leadIds));
		}
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	/** A corrente inteira, do clique ao evento pendente. */
	async function jornadaPaga(opts: { comFbp?: string | null } = {}) {
		// 1) O proxy lê a URL. Este é o mesmo parser que ele usa.
		const params = parseCampaignParams(new URL(URL_DO_ANUNCIO).searchParams);

		// 2) E grava a visita.
		const visitId = crypto.randomUUID();
		visitIds.push(visitId);
		await store.recordWebVisit({
			visitId,
			visitorId: `uid-${visitId.slice(0, 8)}`,
			params,
			fbp: opts.comFbp ?? null,
			landingPath: "/autos",
			referrer: "https://l.facebook.com/",
			userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
		});

		// 3) A pessoa abre o chat: a conversa nasce apontando para a visita.
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", visitId })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				name: "Cliente A7",
				phone: "11987654321",
				creditValue: "90000.00",
			})
			.returning({ id: schema.leads.id });
		leadIds.push(lead.id);

		return { visitId, conversationId: conv.id, leadId: lead.id, params };
	}

	it("a URL do anúncio é lida inteira, sem perder campo pelo caminho", async () => {
		const { visitId } = await jornadaPaga();

		const visita = await db.query.visits.findFirst({ where: eq(schema.visits.id, visitId) });
		expect(visita?.utmSource).toBe("facebook");
		expect(visita?.utmMedium).toBe("cpc");
		expect(visita?.utmCampaign).toBe("bofu-carro-agosto");
		expect(visita?.utmContent).toBe("criativo-03");
		expect(visita?.utmTerm).toBe("consorcio-carro");
		expect(visita?.fbclid).toBe("IwAR1exemploDeClickIdDaMeta");
		// A landing certa: campanha de carro tem que cair em `/autos`, e é este
		// campo que diz se ela caiu.
		expect(visita?.landingPath).toBe("/autos");
	});

	it("o fbclid vira `fbc` no evento que volta para a Meta", async () => {
		// Sem `fbc` a Meta recebe a conversão e não sabe de qual anúncio ela veio —
		// o evento é aceito e some da otimização, sem falhar em lugar nenhum.
		const { leadId } = await jornadaPaga();
		await registrarConversao({ leadId, eventName: "lead_qualificado" });

		const evento = await db.query.conversionEvents.findFirst({
			where: eq(schema.conversionEvents.leadId, leadId),
		});
		expect(evento?.fbc).toMatch(/^fb\.1\.\d+\.IwAR1exemploDeClickIdDaMeta$/);
		expect(evento?.actionSource).toBe("website");
	});

	it("o `_fbp` do pixel também atravessa — é a outra metade do match", () => {
		return (async () => {
			const { leadId } = await jornadaPaga({ comFbp: "fb.1.1788000000000.7654321" });
			await registrarConversao({ leadId, eventName: "lead_qualificado" });

			const evento = await db.query.conversionEvents.findFirst({
				where: eq(schema.conversionEvents.leadId, leadId),
			});
			// `fbc` diz de qual anúncio a pessoa veio; `fbp` diz que é o mesmo
			// aparelho. A Meta usa os dois, e mandar só um deixa correspondência
			// na mesa de graça.
			expect(evento?.fbp).toBe("fb.1.1788000000000.7654321");
			expect(evento?.fbc).toBeTruthy();
		})();
	});

	it("o telefone do lead chega hasheado, nunca cru", async () => {
		const { leadId } = await jornadaPaga();
		await registrarConversao({ leadId, eventName: "lead_qualificado" });

		const evento = await db.query.conversionEvents.findFirst({
			where: eq(schema.conversionEvents.leadId, leadId),
		});
		expect(evento?.hashedPhone).toMatch(/^[0-9a-f]{64}$/);
		// A tabela de conversão não é cópia do cadastro.
		expect(JSON.stringify(evento)).not.toContain("11987654321");
	});

	it("o VALOR da carta viaja junto — sem ele a Meta exclui o evento da otimização de receita", async () => {
		const { leadId } = await jornadaPaga();
		await registrarConversao({ leadId, eventName: "contrato_fechado" });

		const evento = await db.query.conversionEvents.findFirst({
			where: eq(schema.conversionEvents.leadId, leadId),
		});
		expect(Number(evento?.value)).toBe(90_000);
		expect(evento?.currency).toBe("BRL");
	});

	it("a corrente é rastreável de ponta a ponta pelo `visit_id`", async () => {
		// É esta junção que responde "qual anúncio pagou por esta venda?". Ela
		// quebrando em qualquer elo, a pergunta fica sem resposta — e o relatório
		// da campanha vira opinião.
		const { leadId, visitId } = await jornadaPaga();
		await registrarConversao({ leadId, eventName: "proposta_criada" });

		const [linha] = await db
			.select({
				campanha: schema.visits.utmCampaign,
				criativo: schema.visits.utmContent,
				evento: schema.conversionEvents.eventName,
			})
			.from(schema.conversionEvents)
			.innerJoin(schema.visits, eq(schema.visits.id, schema.conversionEvents.visitId))
			.where(eq(schema.conversionEvents.leadId, leadId));

		expect(linha.campanha).toBe("bofu-carro-agosto");
		expect(linha.criativo).toBe("criativo-03");
		expect(linha.evento).toBe("proposta_criada");
		expect(visitId).toBeTruthy();
	});
});
