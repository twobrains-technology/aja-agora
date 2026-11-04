// A temperatura do lead (backoffice) só sobe com proposta REAL: `proposta_enviada` exige
// oferta (`ofertaId` não nulo). A linha vazia existe só para reaproveitar o proposalId.
// Integration (DB real). Skip se DATABASE_URL ausente.

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("proposta_enviada só com oferta real (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let repo: typeof import("./proposal-repo");
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		repo = await import("./proposal-repo");
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
	});

	async function seed() {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, stage: "qualificado" })
			.returning({ id: schema.leads.id });
		return { conversationId: conv.id, leadId: lead.id };
	}

	async function eventos(leadId: string) {
		return db
			.select()
			.from(schema.leadEvents)
			.where(
				and(
					eq(schema.leadEvents.leadId, leadId),
					eq(schema.leadEvents.toStage, "proposta_enviada"),
				),
			);
	}

	async function estagio(leadId: string) {
		return (await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) }))?.stage;
	}

	it("(a) tentativa sem oferta não registra proposta_enviada", async () => {
		const { conversationId, leadId } = await seed();
		await repo.createBeviProposal(conversationId, { proposalId: "p-a", ofertaId: null }, leadId);
		expect(await eventos(leadId)).toHaveLength(0);
		expect(await estagio(leadId)).toBe("qualificado");
	});

	it("(b) tentativa seguinte com oferta registra exatamente uma vez", async () => {
		const { conversationId, leadId } = await seed();
		const row = await repo.createBeviProposal(
			conversationId,
			{ proposalId: "p-b", ofertaId: null },
			leadId,
		);
		await repo.updateBeviProposal(row.id, { ofertaId: "oferta-1" });
		expect(await eventos(leadId)).toHaveLength(1);
		expect(await estagio(leadId)).toBe("proposta_enviada");
		// nova atualização com oferta (re-simulação) não duplica
		await repo.updateBeviProposal(row.id, { ofertaId: "oferta-2" });
		expect(await eventos(leadId)).toHaveLength(1);
	});

	it("(c) caminho feliz direto registra uma vez", async () => {
		const { conversationId, leadId } = await seed();
		await repo.createBeviProposal(
			conversationId,
			{ proposalId: "p-c", ofertaId: "oferta-1" },
			leadId,
		);
		expect(await eventos(leadId)).toHaveLength(1);
		expect(await estagio(leadId)).toBe("proposta_enviada");
	});

	it("órfã vazia religada não sobe a temperatura; com oferta, sobe", async () => {
		const { conversationId, leadId } = await seed();
		await repo.createBeviProposal(conversationId, { proposalId: "p-d", ofertaId: null }, null);
		await repo.relinkOrphanProposals(conversationId, leadId);
		expect(await eventos(leadId)).toHaveLength(0);

		const o = await seed();
		await repo.createBeviProposal(o.conversationId, { proposalId: "p-e", ofertaId: "of" }, null);
		await repo.relinkOrphanProposals(o.conversationId, o.leadId);
		expect(await eventos(o.leadId)).toHaveLength(1);
	});
});
