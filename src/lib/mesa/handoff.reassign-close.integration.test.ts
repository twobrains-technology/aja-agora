// Reatribuição + encerramento do mesa handoff (integration-db). Spec:
// docs/design/specs/2026-07-03-mesa-visibilidade-reatribuicao-design.md.
// - reassignMesaHandoff: muda o dono (claima a raia se estava sem dono); notifica quem sai/entra.
// - closeMesaHandoff: status concluido + closed_at E move o lead pra fechado_ganho (Kairo 2026-07-03).
// - getActiveHandoffsByLead: base da visibilidade (quem é o responsável). Skip sem DATABASE_URL.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("mesa handoff — reatribuir + encerrar (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let mesa: typeof import("./handoff");

	const convIds: string[] = [];
	const attendantIds: string[] = [];

	function uniquePhone(): string {
		return `5564${randomUUID().replace(/\D/g, "").slice(0, 9).padEnd(9, "0")}`;
	}

	async function seedAttendant(nome: string, isActive = true) {
		const [a] = await db
			.insert(schema.mesaAttendants)
			.values({ nome, whatsapp: uniquePhone(), isActive })
			.returning({ id: schema.mesaAttendants.id, whatsapp: schema.mesaAttendants.whatsapp });
		attendantIds.push(a.id);
		return a;
	}

	async function seedHandoff(opts: {
		ownerId?: string | null;
		status?: "aberto" | "em_andamento" | "concluido";
		stage?: "na_administradora" | "em_atendimento";
	}) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", status: "active", waId: uniquePhone(), metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				name: "Cliente RC",
				stage: opts.stage ?? "na_administradora",
			})
			.returning({ id: schema.leads.id });
		const [h] = await db
			.insert(schema.mesaHandoffs)
			.values({
				leadId: lead.id,
				conversationId: conv.id,
				mesaAttendantId: opts.ownerId ?? null,
				status: opts.status ?? "aberto",
			})
			.returning({ id: schema.mesaHandoffs.id });
		return { handoffId: h.id, leadId: lead.id };
	}

	async function leadStage(leadId: string) {
		const [l] = await db
			.select({ stage: schema.leads.stage })
			.from(schema.leads)
			.where(eq(schema.leads.id, leadId));
		return l.stage;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		mesa = await import("./handoff");
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		if (attendantIds.length) {
			const { inArray } = await import("drizzle-orm");
			await db.delete(schema.mesaAttendants).where(inArray(schema.mesaAttendants.id, attendantIds));
		}
	});

	it("reatribui de A para B: dono vira B, retorna o antigo A, status em_andamento", async () => {
		const a = await seedAttendant("A");
		const b = await seedAttendant("B");
		const { handoffId } = await seedHandoff({
			ownerId: a.id,
			status: "em_andamento",
			stage: "em_atendimento",
		});

		const r = await mesa.reassignMesaHandoff(handoffId, b.id);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.handoff.mesaAttendantId).toBe(b.id);
		expect(r.oldAttendantId).toBe(a.id);
		expect(r.handoff.status).toBe("em_andamento");
	});

	it("reatribuir pro mesmo dono → mesmo_atendente", async () => {
		const a = await seedAttendant("A2");
		const { handoffId } = await seedHandoff({ ownerId: a.id, status: "em_andamento" });
		const r = await mesa.reassignMesaHandoff(handoffId, a.id);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.reason).toBe("mesmo_atendente");
	});

	it("reatribuir handoff aberto (sem dono) → atribui e move a raia p/ em_atendimento", async () => {
		const a = await seedAttendant("A3");
		const { handoffId, leadId } = await seedHandoff({
			status: "aberto",
			stage: "na_administradora",
		});
		const r = await mesa.reassignMesaHandoff(handoffId, a.id);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.handoff.mesaAttendantId).toBe(a.id);
		expect(r.oldAttendantId).toBeNull();
		expect(await leadStage(leadId)).toBe("em_atendimento");
	});

	it("reatribuir handoff já encerrado → handoff_encerrado", async () => {
		const a = await seedAttendant("A4");
		const { handoffId } = await seedHandoff({ ownerId: a.id, status: "concluido" });
		const b = await seedAttendant("B4");
		const r = await mesa.reassignMesaHandoff(handoffId, b.id);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.reason).toBe("handoff_encerrado");
	});

	it("reatribuir p/ atendente inativo/inexistente → attendant_not_found", async () => {
		const a = await seedAttendant("A5");
		const inactive = await seedAttendant("Inativo5", false);
		const { handoffId } = await seedHandoff({ ownerId: a.id, status: "em_andamento" });
		const r = await mesa.reassignMesaHandoff(handoffId, inactive.id);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.reason).toBe("attendant_not_found");
	});

	it("encerrar: status concluido + closed_at E lead vai pra fechado_ganho", async () => {
		const a = await seedAttendant("A6");
		const { handoffId, leadId } = await seedHandoff({
			ownerId: a.id,
			status: "em_andamento",
			stage: "em_atendimento",
		});
		const r = await mesa.closeMesaHandoff(handoffId);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.handoff.status).toBe("concluido");
		expect(r.handoff.closedAt).toBeInstanceOf(Date);
		expect(await leadStage(leadId)).toBe("fechado_ganho");
	});

	it("encerrar handoff já encerrado → handoff_encerrado", async () => {
		const a = await seedAttendant("A7");
		const { handoffId } = await seedHandoff({ ownerId: a.id, status: "concluido" });
		const r = await mesa.closeMesaHandoff(handoffId);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.reason).toBe("handoff_encerrado");
	});

	it("getActiveHandoffsByLead: devolve o responsável (nome/whatsapp) do handoff ativo", async () => {
		const a = await seedAttendant("Resp");
		const { handoffId, leadId } = await seedHandoff({ ownerId: a.id, status: "em_andamento" });
		const map = await mesa.getActiveHandoffsByLead([leadId]);
		const summary = map.get(leadId);
		expect(summary).toBeTruthy();
		expect(summary?.id).toBe(handoffId);
		expect(summary?.status).toBe("em_andamento");
		expect(summary?.attendant?.id).toBe(a.id);
		expect(summary?.attendant?.nome).toBe("Resp");
		expect(summary?.attendant?.whatsapp).toBe(a.whatsapp);
	});
});
