// FIX-365 (bloco-h-resume-mesa) — prova que a mesa é notificada UMA VEZ, não
// duplicada, quando o lead fecha a proposta (aceite dispara `dispatchAutoTransbordo`
// via `sendFechoPedirOi`) e depois o worker de polling da Bevi observa o lead em
// `na_administradora` e dispara `dispatchAutoTransbordo` de novo
// (`proposal-status-poll.ts:69-71`). As duas chamadas usam o MESMO ponto de
// entrada (`src/lib/mesa/dispatch.ts`) — este teste simula os dois disparos pro
// MESMO lead e prova que existe exatamente 1 handoff de mesa criado (não 2).
//
// Root cause investigado (ver docs/correcoes/done/fix-365-...): a idempotência
// JÁ existe em `createMesaHandoff` (checagem de handoff ativo antes do INSERT,
// `handoff.ts:135-145`) — este teste é a REGRESSÃO que faltava provando o
// comportamento fim-a-fim pelo ponto de entrada real (`dispatchAutoTransbordo`),
// não reimplementação. Skip se DATABASE_URL ausente.

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Broadcast real dispara WhatsApp de verdade (Meta Cloud API) — isolado do que
// este teste prova (idempotência do registro do handoff). Nenhum outro teste de
// integração de mesa chama `dispatchAutoTransbordo`/broadcast real por este
// mesmo motivo (ver `handoff.integration.test.ts`, que chama `createMesaHandoff`
// direto).
vi.mock("@/lib/whatsapp/mesa/outbound", () => ({
	broadcastCaseToAttendants: vi.fn().mockResolvedValue(undefined),
}));

describeIfDb("FIX-365 — dispatchAutoTransbordo é idempotente no fluxo aceite→poll", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let dispatchAutoTransbordo: typeof import("./dispatch").dispatchAutoTransbordo;

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ dispatchAutoTransbordo } = await import("./dispatch"));
	});

	afterAll(async () => {
		// mesa_handoffs cai por cascade do lead (lead cai por cascade da conversa).
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
	});

	async function seedLeadComProposta(stage: "proposta_enviada" | "na_administradora") {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				name: "Cliente FIX-365",
				phone: "5562999991234",
				stage,
			})
			.returning({ id: schema.leads.id });
		await db.insert(schema.beviProposals).values({
			conversationId: conv.id,
			leadId: lead.id,
			proposalId: `PROP-FIX365-${conv.id.slice(0, 8)}`,
			administradora: "CANOPUS",
			grupo: "1234",
			creditValue: "150000.00",
			monthlyPayment: "900.00",
			segmento: "auto",
			termMonths: 120,
		});
		return { conversationId: conv.id, leadId: lead.id };
	}

	it("aceite (proposta_enviada) → 1º dispatchAutoTransbordo cria o handoff; poll (na_administradora) → 2º dispatch NÃO duplica", async () => {
		const { leadId } = await seedLeadComProposta("proposta_enviada");

		// 1) ACEITE: sendFechoPedirOi → dispatchAutoTransbordo (route.ts:1011 / fecho-pedir-oi.ts:126).
		const first = await dispatchAutoTransbordo(leadId);
		expect(first.created).toBe(true);
		expect(first.handoffId).toBeTruthy();

		// 2) Bevi processa de fato — o lead avança pra na_administradora (o que o
		// worker de polling observa antes de disparar de novo).
		await db
			.update(schema.leads)
			.set({ stage: "na_administradora" })
			.where(eq(schema.leads.id, leadId));

		// 3) POLL: proposal-status-poll.ts:69-71 dispara dispatchAutoTransbordo de novo
		// pro MESMO lead — deve ser um no-op (handoff já ativo).
		const second = await dispatchAutoTransbordo(leadId);
		expect(second.created).toBe(false);
		expect(second.reason).toBe("handoff_ativo_existe");

		// Prova mecânica: existe EXATAMENTE 1 handoff ativo pro lead, não 2.
		const rows = await db
			.select({ id: schema.mesaHandoffs.id })
			.from(schema.mesaHandoffs)
			.where(
				and(
					eq(schema.mesaHandoffs.leadId, leadId),
					inArray(schema.mesaHandoffs.status, ["aberto", "em_andamento"]),
				),
			);
		expect(rows.length).toBe(1);
		expect(rows[0].id).toBe(first.handoffId);
	});
});
