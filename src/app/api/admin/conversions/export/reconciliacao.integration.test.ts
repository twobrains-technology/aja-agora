// A reconciliação que o Growth usa tem que trazer a jornada INTEIRA.
//
// `ConversationStarted` nasce só com a conversa: no instante da primeira fala o
// lead ainda não existe, então o evento é gravado com `conversation_id` e sem
// `lead_id`. Um join só por `lead_id` deixa esse marco de fora — e ele é o
// denominador da taxa Conversation→Qualified, a primeira coisa que o Growth
// olha. A planilha sai com cinco linhas parecendo completa.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("reconciliação para o Growth", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let rota: typeof import("./route");

	const convIds: string[] = [];
	const flagOriginal = process.env.META_CONVERSION_CONTRACT_V2_ENABLED;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		rota = await import("./route");
		process.env.META_CONVERSION_CONTRACT_V2_ENABLED = "true";
	});

	afterAll(async () => {
		if (flagOriginal === undefined) delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		else process.env.META_CONVERSION_CONTRACT_V2_ENABLED = flagOriginal;
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	it("traz os seis marcos do lead, inclusive o que só tem conversa", async () => {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `reconc-${crypto.randomUUID()}`,
				channel: "web",
				campaignId: "campanha-1",
				adsetId: "conjunto-1",
				adId: "anuncio-1",
			})
			.returning();
		const [conversa] = await db
			.insert(schema.conversations)
			.values({ visitId: visita.id, channel: "web" })
			.returning();
		convIds.push(conversa.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conversa.id,
				phone: "62988887777",
				email: "cliente@exemplo.com",
				isSimulated: false,
			})
			.returning();

		const registry = await import("@/lib/conversions/registry");
		const proposta = `PROP-${crypto.randomUUID()}`;
		await registry.registrarInicioDeConversaReal(conversa.id);
		await registry.registrarLeadIdentificado(conversa.id);
		await registry.registrarConversaoDoEstagio(lead.id, "qualificado");
		await registry.registrarOfertaExibida(lead.id, proposta);
		await registry.registrarPropostaEnviada(lead.id, proposta);
		await registry.registrarCompraConfirmada(lead.id, proposta, `SALE-${proposta}`);

		const linhas = (await rota.linhasDeReconciliacao()).filter((l) => l.leadId === lead.id);

		expect(linhas.map((l) => l.eventName)).toEqual([
			"conversation_started",
			"lead",
			"qualified_lead",
			"offer_viewed",
			"proposal_sent",
			"purchase",
		]);
	});

	it("leva a origem Meta junto de cada marco — é o que liga anúncio a resultado", async () => {
		const linhas = await rota.linhasDeReconciliacao();
		const doTeste = linhas.filter((l) => l.firstCampaignId === "campanha-1");

		expect(doTeste.length).toBeGreaterThan(0);
		for (const linha of doTeste) {
			expect(linha.firstAdsetId).toBe("conjunto-1");
			expect(linha.firstAdId).toBe("anuncio-1");
		}
	});

	it("não expõe PII crua — a planilha vai para fora da engenharia", async () => {
		const linhas = await rota.linhasDeReconciliacao();
		const serializado = JSON.stringify(linhas);

		expect(serializado).not.toContain("cliente@exemplo.com");
		expect(serializado).not.toContain("62988887777");
	});
});
