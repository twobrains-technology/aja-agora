// Integration (DB real) — FIX-44: automação do desfecho.
//  - createBeviProposal move o lead pra proposta_enviada (a raia acompanha o
//    evento que JÁ existe).
//  - reconcileProposalStage mapeia status REAL → raia (forward-only) + idempotência.
//  - markStaleProposalsLost marca perdido por inatividade (sem tocar terminais).
// Skip se DATABASE_URL ausente.

import { and, eq, inArray } from "drizzle-orm";
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

	// ── FIX-123 (D14): entrar em na_administradora dispara o transbordo automático ──
	async function activeHandoffsFor(leadId: string) {
		return db
			.select({ id: schema.mesaHandoffs.id, status: schema.mesaHandoffs.status })
			.from(schema.mesaHandoffs)
			.where(
				and(
					eq(schema.mesaHandoffs.leadId, leadId),
					inArray(schema.mesaHandoffs.status, ["aberto", "em_andamento"]),
				),
			);
	}

	it("FIX-123: reconcile pra na_administradora cria UM handoff ativo sem dono", async () => {
		const { conversationId, leadId } = await seed("proposta_enviada");
		const pid = "prop-transbordo-1";
		const row = await seedProposal(conversationId, leadId, pid);
		const gw = fakeGateway({ [pid]: statusWith("approveWaitingForUniqueCode") });

		await poll.reconcileProposalStage(
			{ id: row.id, proposalId: pid, leadId, updatedAt: row.updatedAt },
			{ gateway: gw },
		);

		const handoffs = await activeHandoffsFor(leadId);
		expect(handoffs.length).toBe(1);
		// nasce sem dono (broadcast/claim decidem depois)
		const [full] = await db
			.select()
			.from(schema.mesaHandoffs)
			.where(eq(schema.mesaHandoffs.id, handoffs[0].id));
		expect(full.mesaAttendantId).toBeNull();
		expect(full.status).toBe("aberto");
	});

	it("FIX-123: re-poll do mesmo status NÃO cria 2º handoff (applied=false + dedup)", async () => {
		const { conversationId, leadId } = await seed("proposta_enviada");
		const pid = "prop-transbordo-idem";
		const row = await seedProposal(conversationId, leadId, pid);
		const gw = fakeGateway({ [pid]: statusWith("approveWaitingForUniqueCode") });
		const args = { id: row.id, proposalId: pid, leadId, updatedAt: row.updatedAt };

		await poll.reconcileProposalStage(args, { gateway: gw });
		await poll.reconcileProposalStage(args, { gateway: gw }); // re-poll

		const handoffs = await activeHandoffsFor(leadId);
		expect(handoffs.length).toBe(1);
	});

	it("FIX-123: transição pra raia que NÃO é gatilho (aguardando_pagamento) não transborda", async () => {
		const { conversationId, leadId } = await seed("na_administradora");
		const pid = "prop-transbordo-naotrigger";
		const row = await seedProposal(conversationId, leadId, pid);
		const gw = fakeGateway({ [pid]: statusWith("aguard_pag_cliente") });

		const { stage, applied } = await poll.reconcileProposalStage(
			{ id: row.id, proposalId: pid, leadId, updatedAt: row.updatedAt },
			{ gateway: gw },
		);
		expect(stage).toBe("aguardando_pagamento");
		expect(applied).toBe(true);

		const handoffs = await activeHandoffsFor(leadId);
		expect(handoffs.length).toBe(0);
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
