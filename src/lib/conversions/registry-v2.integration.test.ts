import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, conversionEvents, leads, visits } from "@/db/schema";

const RUN = process.env.RUN_DB_TESTS === "1";
const ids: string[] = [];

describe.skipIf(!RUN)("registry V2 — contrato comercial", () => {
	beforeEach(() => {
		process.env.META_CONVERSION_CONTRACT_V2_ENABLED = "true";
	});
	afterEach(async () => {
		delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		if (ids.length) {
			await db.delete(conversionEvents).where(inArray(conversionEvents.conversationId, ids));
			await db.delete(leads).where(inArray(leads.conversationId, ids));
			await db.delete(conversations).where(inArray(conversations.id, ids));
		}
		ids.length = 0;
	});

	it("registra ConversationStarted/Lead/QualifiedLead uma vez e preserva IDs Meta", async () => {
		const visit = await db
			.insert(visits)
			.values({
				visitorId: `v2-${crypto.randomUUID()}`,
				channel: "web",
				campaignId: "campaign-1",
				adsetId: "adset-1",
				adId: "ad-1",
				fbclid: "click-1",
				fbp: "fb.1.1.browser",
			})
			.returning();
		const [conv] = await db
			.insert(conversations)
			.values({ visitId: visit[0].id, channel: "web" })
			.returning();
		ids.push(conv.id);
		const [lead] = await db
			.insert(leads)
			.values({
				conversationId: conv.id,
				phone: "62999999999",
				email: "cliente@example.com",
				isSimulated: false,
			})
			.returning();
		const registry = await import("./registry");
		await registry.registrarInicioDeConversaReal(conv.id);
		await registry.registrarInicioDeConversaReal(conv.id); // retry
		await registry.registrarLeadIdentificado(conv.id);
		await registry.registrarConversaoDoEstagio(lead.id, "qualificado");
		await registry.registrarConversaoDoEstagio(lead.id, "qualificado"); // retry
		await registry.registrarOfertaExibida(lead.id, "offer-1");
		await registry.registrarPropostaEnviada(lead.id, "proposal-1");
		await registry.registrarCompraConfirmada(lead.id, "proposal-1", "sale-1");
		const rows = await db
			.select()
			.from(conversionEvents)
			.where(eq(conversionEvents.conversationId, conv.id));
		expect(rows.map((r) => r.eventName).sort()).toEqual([
			"conversation_started",
			"lead",
			"offer_viewed",
			"proposal_sent",
			"purchase",
			"qualified_lead",
		]);
		const qualified = rows.find((r) => r.eventName === "qualified_lead");
		expect(qualified).toMatchObject({ campaignId: "campaign-1", adsetId: "adset-1", adId: "ad-1" });
		expect(qualified?.eventKey).toBe(`lead:${lead.id}:qualified_lead`);
		expect(qualified?.hashedEmail).not.toContain("cliente@example.com");
		expect(rows.find((r) => r.eventName === "purchase")).toMatchObject({
			eventKey: `lead:${lead.id}:purchase:proposal-1`,
			saleId: "sale-1",
			currency: "BRL",
		});
	});
});
