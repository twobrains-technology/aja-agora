// Integration (DB real) — FIX-44: automação do desfecho.
//  - createBeviProposal move o lead pra proposta_enviada (a raia acompanha o
//    evento que JÁ existe).
//  - reconcileProposalStage mapeia status REAL → raia (forward-only) + idempotência.
//  - markStaleProposalsLost marca perdido por inatividade (sem tocar terminais).
// Skip se DATABASE_URL ausente.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProposalGateway, ProposalStatus } from "@/lib/adapters/proposal-gateway";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function statusWith(
	systemicValue: string | null,
	extra: Partial<ProposalStatus> = {},
): ProposalStatus {
	return {
		proposalId: "x",
		statusName: systemicValue ?? "doc",
		situation: "pending",
		statusDescription: null,
		integrationCode: null,
		createdAt: "2026-06-14T00:00:00Z",
		updatedAt: "2026-06-14T00:00:00Z",
		approvedAt: null,
		reprovedAt: null,
		changesHistory: systemicValue ? [{ newState: { systemicValue } }] : [],
		...extra,
	};
}

/** Gateway dublê: getStatus devolve o status configurado por proposalId. */
function fakeGateway(byId: Record<string, ProposalStatus>): ProposalGateway {
	return {
		getStatus: async (proposalId: string) => byId[proposalId] ?? statusWith(null),
	} as unknown as ProposalGateway;
}

describeIfDb("FIX-44 — automação do desfecho (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let createBeviProposal: typeof import("@/lib/bevi/proposal-repo").createBeviProposal;
	let poll: typeof import("./proposal-status-poll");

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ createBeviProposal } = await import("@/lib/bevi/proposal-repo"));
		poll = await import("./proposal-status-poll");
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
	});

	async function seed(stage: (typeof schema.leadStageEnum.enumValues)[number]) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, stage })
			.returning({ id: schema.leads.id });
		return { conversationId: conv.id, leadId: lead.id };
	}

	async function seedProposal(conversationId: string, leadId: string, proposalId: string) {
		const [row] = await db
			.insert(schema.beviProposals)
			.values({ conversationId, leadId, proposalId })
			.returning({ id: schema.beviProposals.id, updatedAt: schema.beviProposals.updatedAt });
		return row;
	}

	it("createBeviProposal move o lead pra proposta_enviada", async () => {
		const { conversationId, leadId } = await seed("qualificado");
		await createBeviProposal(conversationId, { proposalId: "prop-pe-1" }, leadId);
		const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
		expect(lead?.stage).toBe("proposta_enviada");
	});

	it("reconcile mapeia cada status do desfecho → raia (forward-only)", async () => {
		const cases: Array<[string, string]> = [
			["approveWaitingForUniqueCode", "na_administradora"],
			["aguard_pag_cliente", "aguardando_pagamento"],
			["prop_efetivada", "fechado_ganho"],
			["repproved", "perdido"],
		];
		for (const [systemicValue, expected] of cases) {
			const { conversationId, leadId } = await seed("proposta_enviada");
			const pid = `prop-${systemicValue}`;
			const row = await seedProposal(conversationId, leadId, pid);
			const gw = fakeGateway({ [pid]: statusWith(systemicValue) });
			const { stage } = await poll.reconcileProposalStage(
				{ id: row.id, proposalId: pid, leadId, updatedAt: row.updatedAt },
				{ gateway: gw },
			);
			expect(stage).toBe(expected);
			const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
			expect(lead?.stage).toBe(expected);
		}
	});

	it("reconcile é idempotente — re-poll do mesmo status não duplica lead_event", async () => {
		const { conversationId, leadId } = await seed("proposta_enviada");
		const pid = "prop-idem";
		const row = await seedProposal(conversationId, leadId, pid);
		const gw = fakeGateway({ [pid]: statusWith("aguard_pag_cliente") });
		const args = { id: row.id, proposalId: pid, leadId, updatedAt: row.updatedAt };
		await poll.reconcileProposalStage(args, { gateway: gw });
		await poll.reconcileProposalStage(args, { gateway: gw }); // re-poll
		const events = await db
			.select()
			.from(schema.leadEvents)
			.where(eq(schema.leadEvents.leadId, leadId));
		const toAguardando = events.filter((e) => e.toStage === "aguardando_pagamento");
		expect(toAguardando.length).toBe(1);
	});

	it("markStaleProposalsLost: inativo > N dias → perdido; fresco e terminal intactos", async () => {
		const old = new Date(Date.now() - (poll.PERDIDO_INACTIVITY_DAYS + 1) * 86_400_000);

		// proposta abandonada (proposta_enviada, antiga) → perdido
		const stale = await seed("proposta_enviada");
		await seedProposal(stale.conversationId, stale.leadId, "prop-stale");
		await db.update(schema.leads).set({ updatedAt: old }).where(eq(schema.leads.id, stale.leadId));

		// proposta fresca (proposta_enviada, agora) → intacta
		const fresh = await seed("proposta_enviada");
		await seedProposal(fresh.conversationId, fresh.leadId, "prop-fresh");

		// terminal antiga (fechado_ganho) → NÃO vira perdido
		const won = await seed("fechado_ganho");
		await seedProposal(won.conversationId, won.leadId, "prop-won");
		await db.update(schema.leads).set({ updatedAt: old }).where(eq(schema.leads.id, won.leadId));

		await poll.markStaleProposalsLost();

		const staleLead = await db.query.leads.findFirst({ where: eq(schema.leads.id, stale.leadId) });
		const freshLead = await db.query.leads.findFirst({ where: eq(schema.leads.id, fresh.leadId) });
		const wonLead = await db.query.leads.findFirst({ where: eq(schema.leads.id, won.leadId) });
		expect(staleLead?.stage).toBe("perdido");
		expect(freshLead?.stage).toBe("proposta_enviada");
		expect(wonLead?.stage).toBe("fechado_ganho");
	});
});
