// FIX-64 — createMesaHandoff (integration-db). Spec: docs/visao/mesa-de-operacao.md §4.
// Semeia mesa_attendants/administradoras/bevi_proposals por insert direto (NÃO depende
// do CRUD do bloco A em runtime — manifesto bloco-mesa-b). Skip se DATABASE_URL ausente.

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-64 — createMesaHandoff (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let createMesaHandoff: typeof import("./handoff").createMesaHandoff;

	const convIds: string[] = [];
	const attendantIds: string[] = [];
	const administradoraIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ createMesaHandoff } = await import("./handoff"));
	});

	afterAll(async () => {
		// mesa_handoffs cai por cascade do lead (lead cai por cascade da conversa).
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		for (const id of attendantIds) {
			await db.delete(schema.mesaAttendants).where(eq(schema.mesaAttendants.id, id));
		}
		for (const id of administradoraIds) {
			await db.delete(schema.administradoras).where(eq(schema.administradoras.id, id));
		}
	});

	async function seedAttendant(nome: string, whatsapp: string, isActive = true) {
		const [a] = await db
			.insert(schema.mesaAttendants)
			.values({ nome, whatsapp, isActive })
			.returning({ id: schema.mesaAttendants.id, whatsapp: schema.mesaAttendants.whatsapp });
		attendantIds.push(a.id);
		return a;
	}

	async function seedAdministradora(nome: string, slug: string, codigoBevi?: string) {
		const [a] = await db
			.insert(schema.administradoras)
			.values({ nome, slug, codigoBevi })
			.returning({ id: schema.administradoras.id });
		administradoraIds.push(a.id);
		return a;
	}

	async function seedLeadWithProposal(opts: {
		administradoraVarchar: string | null;
		withProposal?: boolean;
	}) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				name: "Maria Teste",
				phone: "5562999990000",
				stage: "na_administradora",
			})
			.returning({ id: schema.leads.id });
		let proposalId: string | null = null;
		if (opts.withProposal !== false) {
			const [p] = await db
				.insert(schema.beviProposals)
				.values({
					conversationId: conv.id,
					leadId: lead.id,
					proposalId: `PROP-${conv.id.slice(0, 8)}`,
					administradora: opts.administradoraVarchar,
					grupo: "1234",
					creditValue: "200000.00",
					monthlyPayment: "1200.00",
					segmento: "imovel",
					termMonths: 180,
				})
				.returning({ id: schema.beviProposals.id });
			proposalId = p.id;
		}
		return { conversationId: conv.id, leadId: lead.id, proposalId };
	}

	it("cria mesa_handoffs com FKs certos e administradora resolvida pela proposta", async () => {
		// phone único deste arquivo (evita colidir com mesa-attendants no DB compartilhado — A3)
		const attendant = await seedAttendant("Atendente Um", "5562988880101");
		const admin = await seedAdministradora("Canopus", "canopus");
		const { conversationId, leadId, proposalId } = await seedLeadWithProposal({
			administradoraVarchar: "CANOPUS", // varchar da Bevi (case difere) → casa por nome
		});

		const result = await createMesaHandoff({
			leadId,
			mesaAttendantId: attendant.id,
			createdBy: null,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const [row] = await db
			.select()
			.from(schema.mesaHandoffs)
			.where(eq(schema.mesaHandoffs.id, result.handoff.id));

		expect(row.leadId).toBe(leadId);
		expect(row.conversationId).toBe(conversationId);
		expect(row.beviProposalId).toBe(proposalId);
		expect(row.mesaAttendantId).toBe(attendant.id);
		expect(row.administradoraId).toBe(admin.id); // resolvida via varchar "CANOPUS" → entidade "Canopus"
		expect(row.status).toBe("aberto");
	});

	it("é idempotente: 2º transbordo do mesmo lead com handoff ativo → handoff_ativo_existe", async () => {
		const attendant = await seedAttendant("Atendente Dois", "5562977776666");
		await seedAdministradora("Embracon", "embracon");
		const { leadId } = await seedLeadWithProposal({ administradoraVarchar: "Embracon" });

		const first = await createMesaHandoff({ leadId, mesaAttendantId: attendant.id });
		expect(first.ok).toBe(true);

		const second = await createMesaHandoff({ leadId, mesaAttendantId: attendant.id });
		expect(second.ok).toBe(false);
		if (second.ok) return;
		expect(second.reason).toBe("handoff_ativo_existe");
		if (second.reason === "handoff_ativo_existe" && first.ok) {
			expect(second.handoffId).toBe(first.handoff.id);
		}

		// garante que NÃO criou segunda linha
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
	});

	it("administradora sem match no cadastro → handoff criado com administradoraId null", async () => {
		const attendant = await seedAttendant("Atendente Tres", "5562966665555");
		const { leadId } = await seedLeadWithProposal({
			administradoraVarchar: "ADMIN_INEXISTENTE_XYZ",
		});

		const result = await createMesaHandoff({ leadId, mesaAttendantId: attendant.id });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.handoff.administradoraId).toBeNull();
	});

	it("lead inexistente → lead_not_found", async () => {
		const attendant = await seedAttendant("Atendente Quatro", "5562955554444");
		const result = await createMesaHandoff({
			leadId: "00000000-0000-0000-0000-000000000000",
			mesaAttendantId: attendant.id,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("lead_not_found");
	});

	it("atendente inativo → attendant_not_found", async () => {
		const inactive = await seedAttendant("Atendente Inativo", "5562944443333", false);
		const { leadId } = await seedLeadWithProposal({ administradoraVarchar: "Canopus" });
		const result = await createMesaHandoff({ leadId, mesaAttendantId: inactive.id });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("attendant_not_found");
	});
});
