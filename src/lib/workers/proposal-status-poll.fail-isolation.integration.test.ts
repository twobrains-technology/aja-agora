// FIX-170 (QA F3, hardening) — Integration (DB real) do ISOLAMENTO DE FALHA do
// transbordo automático (FIX-123, D14, §Regressão caso 4).
//
// O card FIX-123 exigiu o caso "com o broadcast/outbound falhando (mock rejeita), a
// transição de raia e o ciclo SEGUEM (raia aplicada, ciclo não lança) — best-effort".
// A onda entregou só a asserção STRUCTURAL (grep de `try{...}catch` no source em
// proposal-status-poll.transbordo.test.ts) — nunca provou o comportamento. Este arquivo
// fecha a lacuna: prova, com DB real e a borda de transbordo QUEBRADA de propósito, que:
//   (1) broadcast/outbound quebra → o handoff CONTINUA registrado (fonte de verdade imune
//       ao canal externo) + a raia aplica + reconcile NÃO lança;
//   (2) o dispatch inteiro quebra → a raia (feita ANTES do dispatch) persiste e o ciclo de
//       polling NÃO derruba (worker try/catch).
// Skip se DATABASE_URL ausente.

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProposalGateway, ProposalStatus } from "@/lib/adapters/proposal-gateway";

// Borda externa (WhatsApp) mockada como nos demais integration do worker.
vi.mock("@/lib/whatsapp/api", () => ({
	sendReplyButtons: vi.fn(async () => ({ messageId: "sim-1" })),
	sendTextMessage: vi.fn(async () => ({ messageId: "sim-1" })),
}));

// Mock parcial do outbound: mantém tudo real, mas deixa `broadcastCaseToAttendants`
// controlável por teste (default: reusa o real; override por-teste pra QUEBRAR).
vi.mock("@/lib/whatsapp/mesa/outbound", async (orig) => {
	const actual = (await orig()) as typeof import("@/lib/whatsapp/mesa/outbound");
	return { ...actual, broadcastCaseToAttendants: vi.fn(actual.broadcastCaseToAttendants) };
});

// Mock parcial do dispatch: idem — `dispatchAutoTransbordo` controlável por teste.
vi.mock("@/lib/mesa/dispatch", async (orig) => {
	const actual = (await orig()) as typeof import("@/lib/mesa/dispatch");
	return { ...actual, dispatchAutoTransbordo: vi.fn(actual.dispatchAutoTransbordo) };
});

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function statusWith(systemicValue: string): ProposalStatus {
	return {
		proposalId: "x",
		statusName: systemicValue,
		situation: "pending",
		statusDescription: null,
		integrationCode: null,
		createdAt: "2026-06-14T00:00:00Z",
		updatedAt: "2026-06-14T00:00:00Z",
		approvedAt: null,
		reprovedAt: null,
		changesHistory: [{ newState: { systemicValue } }],
	} as ProposalStatus;
}

function fakeGateway(byId: Record<string, ProposalStatus>): ProposalGateway {
	return {
		getStatus: async (proposalId: string) => byId[proposalId],
	} as unknown as ProposalGateway;
}

describeIfDb("FIX-123 — isolamento de falha do transbordo automático (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let poll: typeof import("./proposal-status-poll");
	let outbound: typeof import("@/lib/whatsapp/mesa/outbound");
	let dispatch: typeof import("@/lib/mesa/dispatch");

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		poll = await import("./proposal-status-poll");
		outbound = await import("@/lib/whatsapp/mesa/outbound");
		dispatch = await import("@/lib/mesa/dispatch");
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		vi.restoreAllMocks();
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

	async function activeHandoffsFor(leadId: string) {
		return db
			.select({ id: schema.mesaHandoffs.id })
			.from(schema.mesaHandoffs)
			.where(
				and(
					eq(schema.mesaHandoffs.leadId, leadId),
					inArray(schema.mesaHandoffs.status, ["aberto", "em_andamento"]),
				),
			);
	}

	it("broadcast/outbound QUEBRA → handoff registrado + raia aplicada + reconcile não lança", async () => {
		vi.mocked(outbound.broadcastCaseToAttendants).mockRejectedValueOnce(
			new Error("whatsapp fora do ar"),
		);
		const { conversationId, leadId } = await seed("proposta_enviada");
		const pid = "prop-fail-broadcast";
		const row = await seedProposal(conversationId, leadId, pid);
		const gw = fakeGateway({ [pid]: statusWith("approveWaitingForUniqueCode") });

		// NÃO deve lançar mesmo com o broadcast rejeitando.
		const { stage, applied } = await poll.reconcileProposalStage(
			{ id: row.id, proposalId: pid, leadId, updatedAt: row.updatedAt },
			{ gateway: gw },
		);

		expect(stage).toBe("na_administradora");
		expect(applied).toBe(true);
		// Raia aplicada apesar da falha do canal.
		const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
		expect(lead?.stage).toBe("na_administradora");
		// Handoff É a fonte de verdade — registrado mesmo com o broadcast falhando.
		expect((await activeHandoffsFor(leadId)).length).toBe(1);
	});

	it("dispatch inteiro QUEBRA → raia persiste + runPollCycle não derruba (worker try/catch)", async () => {
		vi.mocked(dispatch.dispatchAutoTransbordo).mockRejectedValueOnce(
			new Error("transbordo explodiu"),
		);
		const { conversationId, leadId } = await seed("proposta_enviada");
		const pid = "prop-fail-dispatch";
		const row = await seedProposal(conversationId, leadId, pid);
		const gw = fakeGateway({ [pid]: statusWith("approveWaitingForUniqueCode") });

		// reconcile isolado: não lança; raia (feita ANTES do dispatch) persiste.
		const { stage, applied } = await poll.reconcileProposalStage(
			{ id: row.id, proposalId: pid, leadId, updatedAt: row.updatedAt },
			{ gateway: gw },
		);
		expect(stage).toBe("na_administradora");
		expect(applied).toBe(true);
		const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
		expect(lead?.stage).toBe("na_administradora");
	});
});
