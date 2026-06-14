// Integration (DB real) — FIX-45: agregação da visão consolidada do contato.
// Skip se DATABASE_URL ausente.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-45 — getContactDetail (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let getContactDetail: typeof import("./contact-detail").getContactDetail;

	let contactId: string;
	const CPF = "52998224725";

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ getContactDetail } = await import("./contact-detail"));

		// contato com CPF
		const [contact] = await db
			.insert(schema.contacts)
			.values({ phone: "62991199001", cpf: CPF, name: "Helena", email: "helena@x.com" })
			.returning({ id: schema.contacts.id });
		contactId = contact.id;

		// 2 conversas (web + WhatsApp) ligadas ao contato
		const [convWeb] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", contactId, metadata: {} })
			.returning({ id: schema.conversations.id });
		const [convWa] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", status: "active", contactId, waId: "62991199001", metadata: {} })
			.returning({ id: schema.conversations.id });

		// mensagens (ordem cronológica entre canais)
		const [mWeb] = await db
			.insert(schema.messages)
			.values({ conversationId: convWeb.id, role: "user", content: "quero um carro", channel: "web" })
			.returning({ id: schema.messages.id });
		await db
			.insert(schema.messages)
			.values({ conversationId: convWa.id, role: "user", content: "voltei pelo zap", channel: "whatsapp" });

		// 2 artifacts numa mensagem
		await db.insert(schema.artifacts).values([
			{ messageId: mWeb.id, type: "simulation_result", payload: { x: 1 } },
			{ messageId: mWeb.id, type: "recommendation_card", payload: { y: 2 } },
		]);

		// 1 lead + 1 proposta + 3 lead_events
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: convWeb.id, contactId, stage: "proposta_enviada" })
			.returning({ id: schema.leads.id });
		await db.insert(schema.beviProposals).values({
			conversationId: convWeb.id,
			leadId: lead.id,
			contactId,
			proposalId: "prop-fix45",
		});
		await db.insert(schema.leadEvents).values([
			{ leadId: lead.id, fromStage: "novo", toStage: "engajado", actorType: "system" },
			{ leadId: lead.id, fromStage: "engajado", toStage: "qualificado", actorType: "system" },
			{ leadId: lead.id, fromStage: "qualificado", toStage: "proposta_enviada", actorType: "system" },
		]);
	});

	afterAll(async () => {
		// cascade: conversas → mensagens/artifacts/leads/proposals; depois o contato.
		const convs = await db
			.select({ id: schema.conversations.id })
			.from(schema.conversations)
			.where(eq(schema.conversations.contactId, contactId));
		for (const c of convs) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, c.id));
		}
		await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
	});

	it("agrega conversas, timeline cross-channel, propostas, lead_events", async () => {
		const detail = await getContactDetail(contactId);
		expect(detail).not.toBeNull();
		if (!detail) return;

		// canais distintos web + whatsapp
		expect([...detail.channels].sort()).toEqual(["web", "whatsapp"]);
		expect(detail.conversationCount).toBe(2);

		// timeline unificada cross-channel, ordenada no tempo, com selo de canal
		expect(detail.timeline.length).toBe(2);
		expect(detail.timeline[0].channel).toBe("web");
		expect(detail.timeline[1].channel).toBe("whatsapp");
		// artifacts vêm junto da mensagem web
		const webMsg = detail.timeline.find((t) => t.channel === "web");
		expect(webMsg?.artifacts.length).toBe(2);

		// propostas
		expect(detail.proposals.length).toBe(1);
		expect(detail.proposals[0].proposalId).toBe("prop-fix45");

		// histórico de raia ordenado
		expect(detail.stageHistory.map((e) => e.toStage)).toEqual([
			"engajado",
			"qualificado",
			"proposta_enviada",
		]);

		// raia atual = mais avançada
		expect(detail.currentStage).toBe("proposta_enviada");

		// CPF mascarado por default
		expect(detail.contact.cpf).toBe("***.***.247-25");
		expect(detail.contact.cpf).not.toContain(CPF);
	});

	it("contato inexistente → null", async () => {
		expect(await getContactDetail("00000000-0000-0000-0000-000000000000")).toBeNull();
	});
});
