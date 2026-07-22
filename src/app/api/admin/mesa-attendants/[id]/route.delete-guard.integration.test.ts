// A2 (QA noturno 2026-06-22) — DELETE de atendente de mesa que JÁ recebeu caso.
// Bug: a FK mesa_handoffs.mesa_attendant_id é ON DELETE no action; o DELETE fazia
// `db.delete(mesaAttendants)` cru → 23503 (500) quando há handoff referenciando. Em
// prod o admin clica "remover" num atendente que já recebeu um transbordo e quebra com
// erro técnico ("Falha ao remover: ...").
//
// Comportamento esperado (decisão de design, reversível — §4.3.1): bloquear o hard-delete
// graciosamente (409) e PRESERVAR o histórico de handoffs (auditoria). O caminho certo pra
// "tirar de circulação" é DESATIVAR (isActive=false), que já existe no PATCH.
//
// Spec: docs/visao/mesa-de-operacao.md §3.3 (CRUD) + §8 (auditoria). DB real.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({ error: null, session: { user: { id: "test-admin" } } })),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

import { db } from "@/db";
import { beviProposals, conversations, leads, mesaAttendants, mesaHandoffs } from "@/db/schema";
import { DELETE } from "./route";

type Seed = {
	attendantId: string;
	leadId: string;
	conversationId: string;
	beviProposalId: string;
	handoffId: string;
};

const created: Seed[] = [];

async function seedAttendantWithHandoff(): Promise<Seed> {
	const phone = `55629${Math.floor(100000000 + Math.random() * 800000000)}`;
	const [att] = await db
		.insert(mesaAttendants)
		.values({ nome: "Operador Com Caso", whatsapp: phone, isActive: true })
		.returning();
	const [conv] = await db.insert(conversations).values({ channel: "whatsapp" }).returning();
	const [lead] = await db
		.insert(leads)
		.values({ conversationId: conv.id, name: "Cliente Teste", phone: "5562900000000" })
		.returning();
	const [prop] = await db
		.insert(beviProposals)
		.values({
			conversationId: conv.id,
			leadId: lead.id,
			proposalId: `prop-${conv.id.slice(0, 8)}`,
			grupo: "1234",
		})
		.returning();
	// Handoff já concluído — o atendente trabalhou o caso e foi fechado (auditoria viva).
	const [h] = await db
		.insert(mesaHandoffs)
		.values({
			leadId: lead.id,
			conversationId: conv.id,
			beviProposalId: prop.id,
			mesaAttendantId: att.id,
			status: "concluido",
		})
		.returning();

	const seed: Seed = {
		attendantId: att.id,
		leadId: lead.id,
		conversationId: conv.id,
		beviProposalId: prop.id,
		handoffId: h.id,
	};
	created.push(seed);
	return seed;
}

async function cleanup(s: Seed) {
	await db.delete(mesaHandoffs).where(eq(mesaHandoffs.id, s.handoffId));
	await db.delete(beviProposals).where(eq(beviProposals.id, s.beviProposalId));
	await db.delete(leads).where(eq(leads.id, s.leadId));
	await db.delete(conversations).where(eq(conversations.id, s.conversationId));
	await db.delete(mesaAttendants).where(eq(mesaAttendants.id, s.attendantId));
}

function delReq(id: string) {
	return DELETE(new Request(`http://test/api/admin/mesa-attendants/${id}`, { method: "DELETE" }), {
		params: Promise.resolve({ id }),
	});
}

describeIfDb("A2 — DELETE de atendente de mesa com handoff referenciando", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(async () => {
		while (created.length) {
			const s = created.pop();
			if (s) await cleanup(s);
		}
	});

	it("bloqueia (409) o hard-delete de atendente que tem handoff e NÃO apaga o atendente nem o histórico", async () => {
		const s = await seedAttendantWithHandoff();

		const res = await delReq(s.attendantId);

		// Esperado: 409 gracioso (não 500/throw).
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/caso|handoff|desativ/i);

		// Atendente preservado (não foi deletado).
		const att = await db
			.select({ id: mesaAttendants.id })
			.from(mesaAttendants)
			.where(eq(mesaAttendants.id, s.attendantId));
		expect(att).toHaveLength(1);

		// Histórico de handoff preservado (auditoria intacta).
		const h = await db
			.select({ id: mesaHandoffs.id })
			.from(mesaHandoffs)
			.where(eq(mesaHandoffs.id, s.handoffId));
		expect(h).toHaveLength(1);
	});

	it("permite o hard-delete de atendente SEM nenhum handoff (caminho normal continua 200)", async () => {
		const phone = `55629${Math.floor(100000000 + Math.random() * 800000000)}`;
		const [att] = await db
			.insert(mesaAttendants)
			.values({ nome: "Operador Sem Caso", whatsapp: phone, isActive: true })
			.returning();

		const res = await delReq(att.id);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { deleted?: boolean };
		expect(body.deleted).toBe(true);

		const att2 = await db
			.select({ id: mesaAttendants.id })
			.from(mesaAttendants)
			.where(eq(mesaAttendants.id, att.id));
		expect(att2).toHaveLength(0);
	});
});
