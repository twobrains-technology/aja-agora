// Integration (DB real) — FIX-43: transitionLeadStage forward-only por default.
// Skip se DATABASE_URL ausente.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-43 — transitionLeadStage (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let transitionLeadStage: typeof import("./lead-transitions").transitionLeadStage;

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ transitionLeadStage } = await import("./lead-transitions"));
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
	});

	async function seedLead(stage: (typeof schema.leadStageEnum.enumValues)[number]) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, stage })
			.returning({ id: schema.leads.id });
		return lead.id;
	}

	it("avança (qualificado → proposta_enviada) e registra lead_event", async () => {
		const leadId = await seedLead("qualificado");
		const result = await transitionLeadStage(leadId, "proposta_enviada", { type: "system" });
		expect(result?.stage).toBe("proposta_enviada");
		const events = await db
			.select()
			.from(schema.leadEvents)
			.where(eq(schema.leadEvents.leadId, leadId));
		expect(events.length).toBe(1);
		expect(events[0].fromStage).toBe("qualificado");
		expect(events[0].toStage).toBe("proposta_enviada");
		expect(events[0].actorType).toBe("system");
	});

	it("system NÃO regride por default (proposta_enviada → qualificado = no-op)", async () => {
		const leadId = await seedLead("proposta_enviada");
		const result = await transitionLeadStage(leadId, "qualificado", { type: "system" });
		expect(result?.stage).toBe("proposta_enviada"); // inalterado
		const events = await db
			.select()
			.from(schema.leadEvents)
			.where(eq(schema.leadEvents.leadId, leadId));
		expect(events.length).toBe(0); // nenhum evento — foi no-op
	});

	it("admin com allowRegression move pra trás e registra o evento", async () => {
		const leadId = await seedLead("proposta_enviada");
		const result = await transitionLeadStage(
			leadId,
			"qualificado",
			{ type: "admin", id: "admin-1" },
			{ allowRegression: true },
		);
		expect(result?.stage).toBe("qualificado");
		const events = await db
			.select()
			.from(schema.leadEvents)
			.where(eq(schema.leadEvents.leadId, leadId));
		expect(events.length).toBe(1);
		expect(events[0].toStage).toBe("qualificado");
		expect(events[0].actorType).toBe("admin");
	});

	it("marca terminal perdido a partir de qualquer raia (forward até perdido)", async () => {
		const leadId = await seedLead("em_negociacao");
		const result = await transitionLeadStage(leadId, "perdido", { type: "system" });
		expect(result?.stage).toBe("perdido");
	});

	it("mesma raia → no-op sem evento", async () => {
		const leadId = await seedLead("engajado");
		await transitionLeadStage(leadId, "engajado", { type: "system" });
		const events = await db
			.select()
			.from(schema.leadEvents)
			.where(eq(schema.leadEvents.leadId, leadId));
		expect(events.length).toBe(0);
	});
});
