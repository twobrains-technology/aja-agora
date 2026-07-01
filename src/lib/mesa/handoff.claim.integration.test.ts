// FIX-125 — claim/lock atômico do transbordo (integration-db). D16 da jornada canônica.
// O ponto crítico é a CORRIDA: dois atendentes clicam "Vou atender" no mesmo caso "sem
// dono" e EXATAMENTE UM assume (`UPDATE ... WHERE mesa_attendant_id IS NULL` — o banco
// serializa a linha). Espelha o modelo dono-nulo→reivindicado do chat de vendas
// (`conversations.handedOffUserId`, proxy.ts), mas com o guard atômico que o proxy
// ainda não tem. Skip se DATABASE_URL ausente.

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-125 — claim atômico do transbordo (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let handoff: typeof import("./handoff");

	const convIds: string[] = [];
	const attendantIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		handoff = await import("./handoff");
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		for (const id of attendantIds) {
			await db.delete(schema.mesaAttendants).where(eq(schema.mesaAttendants.id, id));
		}
	});

	async function seedAttendant(nome: string, whatsapp: string) {
		const [a] = await db
			.insert(schema.mesaAttendants)
			.values({ nome, whatsapp, isActive: true })
			.returning({ id: schema.mesaAttendants.id });
		attendantIds.push(a.id);
		return a.id;
	}

	async function seedLead() {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, name: "Cliente Claim", stage: "na_administradora" })
			.returning({ id: schema.leads.id });
		return { conversationId: conv.id, leadId: lead.id };
	}

	/** Cria um handoff SEM dono (mesa_attendant_id = null) por insert direto. */
	async function seedOwnerlessHandoff(): Promise<string> {
		const { leadId, conversationId } = await seedLead();
		const [row] = await db
			.insert(schema.mesaHandoffs)
			.values({ leadId, conversationId, mesaAttendantId: null, status: "aberto" })
			.returning({ id: schema.mesaHandoffs.id });
		return row.id;
	}

	// Variante que devolve também o leadId + permite fixar a raia inicial do lead (FIX-126).
	async function seedOwnerlessHandoffFull(stage: "na_administradora" | "aguardando_pagamento") {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, name: "Cliente Raia", stage })
			.returning({ id: schema.leads.id });
		const [row] = await db
			.insert(schema.mesaHandoffs)
			.values({ leadId: lead.id, conversationId: conv.id, mesaAttendantId: null, status: "aberto" })
			.returning({ id: schema.mesaHandoffs.id });
		return { handoffId: row.id, leadId: lead.id };
	}

	it("corrida: 2 atendentes disputam → EXATAMENTE 1 vence; o outro recebe ja_assumido", async () => {
		const h = await seedOwnerlessHandoff();
		const A = await seedAttendant("Claim A", "5562900000101");
		const B = await seedAttendant("Claim B", "5562900000102");

		const [ra, rb] = await Promise.all([
			handoff.claimMesaHandoff(h, A),
			handoff.claimMesaHandoff(h, B),
		]);

		const winners = [ra, rb].filter((r) => r.ok);
		const losers = [ra, rb].filter((r) => !r.ok);
		expect(winners.length).toBe(1);
		expect(losers.length).toBe(1);

		const loser = losers[0];
		if (!loser.ok) expect(loser.reason).toBe("ja_assumido");

		// A linha reflete o vencedor + status em_andamento
		const [dbRow] = await db
			.select()
			.from(schema.mesaHandoffs)
			.where(eq(schema.mesaHandoffs.id, h));
		expect([A, B]).toContain(dbRow.mesaAttendantId);
		expect(dbRow.status).toBe("em_andamento");
		const winner = winners[0];
		if (winner.ok) expect(dbRow.mesaAttendantId).toBe(winner.handoff.mesaAttendantId);
	});

	it("re-claim por um terceiro após assumido → ja_assumido; dono inalterado", async () => {
		const h = await seedOwnerlessHandoff();
		const A = await seedAttendant("Claim Dono", "5562900000201");
		const C = await seedAttendant("Claim Terceiro", "5562900000202");

		const first = await handoff.claimMesaHandoff(h, A);
		expect(first.ok).toBe(true);

		const third = await handoff.claimMesaHandoff(h, C);
		expect(third.ok).toBe(false);
		if (!third.ok) {
			expect(third.reason).toBe("ja_assumido");
			expect(third.ownerAttendantId).toBe(A);
		}

		const [dbRow] = await db
			.select()
			.from(schema.mesaHandoffs)
			.where(eq(schema.mesaHandoffs.id, h));
		expect(dbRow.mesaAttendantId).toBe(A);
	});

	it("re-claim pelo PRÓPRIO dono → sem efeito colateral (guard IS NULL não casa)", async () => {
		const h = await seedOwnerlessHandoff();
		const A = await seedAttendant("Claim Idem", "5562900000301");

		await handoff.claimMesaHandoff(h, A);
		const again = await handoff.claimMesaHandoff(h, A);
		expect(again.ok).toBe(false); // rowCount 0 no guard — já não está "sem dono"
		if (!again.ok) expect(again.reason).toBe("ja_assumido");

		const [dbRow] = await db
			.select()
			.from(schema.mesaHandoffs)
			.where(eq(schema.mesaHandoffs.id, h));
		expect(dbRow.mesaAttendantId).toBe(A);
		expect(dbRow.status).toBe("em_andamento");
	});

	// ── FIX-126 (D17): ao assumir (claim), o lead muda de fase → em_atendimento ──
	it("FIX-126: claim move a raia na_administradora → em_atendimento + grava lead_event", async () => {
		const { handoffId, leadId } = await seedOwnerlessHandoffFull("na_administradora");
		const A = await seedAttendant("Raia A", "5562900000501");

		const claim = await handoff.claimMesaHandoff(handoffId, A);
		expect(claim.ok).toBe(true);

		const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
		expect(lead?.stage).toBe("em_atendimento");

		const events = await db
			.select()
			.from(schema.leadEvents)
			.where(eq(schema.leadEvents.leadId, leadId));
		const toAtend = events.filter((e) => e.toStage === "em_atendimento");
		expect(toAtend.length).toBe(1);
		expect(toAtend[0].fromStage).toBe("na_administradora");
		expect(toAtend[0].actorType).toBe("system");
	});

	it("FIX-126: claim de lead já em raia adiante (aguardando_pagamento) é NO-OP (forward-only)", async () => {
		const { handoffId, leadId } = await seedOwnerlessHandoffFull("aguardando_pagamento");
		const A = await seedAttendant("Raia Adiante", "5562900000502");

		const claim = await handoff.claimMesaHandoff(handoffId, A);
		expect(claim.ok).toBe(true); // o claim em si funciona (dono setado)

		const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
		// não regride pra em_atendimento — segue em aguardando_pagamento
		expect(lead?.stage).toBe("aguardando_pagamento");

		const events = await db
			.select()
			.from(schema.leadEvents)
			.where(eq(schema.leadEvents.leadId, leadId));
		expect(events.filter((e) => e.toStage === "em_atendimento").length).toBe(0);
	});

	it("caso sem dono via broadcast coexiste com a dedup por lead e permanece reivindicável", async () => {
		const { leadId } = await seedLead();

		// broadcast: cria handoff SEM dono (mesaAttendantId omitido)
		const created = await handoff.createMesaHandoff({ leadId });
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		expect(created.handoff.mesaAttendantId).toBeNull();

		// re-disparo do broadcast pro mesmo lead → dedup (não cria 2ª linha)
		const again = await handoff.createMesaHandoff({ leadId });
		expect(again.ok).toBe(false);
		if (!again.ok) expect(again.reason).toBe("handoff_ativo_existe");

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

		// o handoff sem dono ainda pode ser reivindicado
		const A = await seedAttendant("Claim Broadcast", "5562900000401");
		const claim = await handoff.claimMesaHandoff(created.handoff.id, A);
		expect(claim.ok).toBe(true);
		if (claim.ok) expect(claim.handoff.mesaAttendantId).toBe(A);
	});
});
