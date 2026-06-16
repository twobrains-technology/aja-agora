// Integration (DB real) — FIX-42: resolveContact (find-or-create + merge) e
// backfillContacts (dedup por telefone + CPF cifrado + idempotência).
// Skip se DATABASE_URL ausente.

import { eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Identificadores únicos deste run (DDD 62, prefixo 9119) pra não colidir.
const P1 = "62991190001";
const P2 = "62991190002";
const CPF1 = "52998224725"; // CPF válido (DV ok)
const EMAIL1 = "fix42-merge@example.com";

describeIfDb("FIX-42 — resolveContact (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let resolveContact: typeof import("./resolve").resolveContact;

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ resolveContact } = await import("./resolve"));
		await cleanup();
	});

	afterAll(async () => {
		await cleanup();
	});

	async function cleanup() {
		const cs = await db
			.select({ id: schema.contacts.id })
			.from(schema.contacts)
			.where(
				or(
					inArray(schema.contacts.phone, [P1, P2]),
					eq(schema.contacts.cpf, CPF1),
					eq(schema.contacts.email, EMAIL1),
				),
			);
		const contactIds = cs.map((c) => c.id);
		for (const id of convIds) {
			await db.delete(schema.leads).where(eq(schema.leads.conversationId, id));
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		if (contactIds.length) {
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
		}
	}

	it("find-or-create: cria contato novo pro telefone", async () => {
		const c1 = await resolveContact({ phone: P1, name: "Helena" });
		expect(c1).not.toBeNull();
		expect(c1?.phone).toBe(P1);
		// segunda resolução pelo mesmo telefone normalizado → mesmo contato
		const c2 = await resolveContact({ phone: "+55 (62) 99119-0001" });
		expect(c2?.id).toBe(c1?.id);
	});

	it("só nome (sem identificador) → null, não cria contato vazio", async () => {
		expect(await resolveContact({ name: "Anônimo" })).toBeNull();
	});

	it("merge: telefone existia + chega CPF (em outro contato) → consolida num só", async () => {
		// contato A só com telefone P2
		const a = await resolveContact({ phone: P2 });
		// contato B só com CPF (registro separado)
		const b = await resolveContact({ cpf: CPF1 });
		expect(a?.id).not.toBe(b?.id);
		// agora chega um evento que tem AMBOS → merge num só
		const merged = await resolveContact({ phone: P2, cpf: CPF1 });
		expect(merged).not.toBeNull();
		expect(merged?.phone).toBe(P2);
		expect(merged?.cpf).toBe(CPF1);
		// só sobrou 1 contato com esse telefone/CPF
		const rows = await db
			.select()
			.from(schema.contacts)
			.where(or(eq(schema.contacts.phone, P2), eq(schema.contacts.cpf, CPF1)));
		expect(rows.length).toBe(1);
	});
});

describeIfDb("FIX-42 — backfillContacts (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let backfillContacts: typeof import("./backfill").backfillContacts;
	let encryptIdentity: typeof import("@/lib/conversation/identity").encryptIdentity;

	const BF_P = "62991190010";
	const BF_CPF = "39053344705"; // CPF válido distinto
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ backfillContacts } = await import("./backfill"));
		({ encryptIdentity } = await import("@/lib/conversation/identity"));
		await cleanup();
	});

	afterAll(async () => {
		await cleanup();
	});

	async function cleanup() {
		for (const id of convIds) {
			await db.delete(schema.leads).where(eq(schema.leads.conversationId, id));
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		const cs = await db
			.select({ id: schema.contacts.id })
			.from(schema.contacts)
			.where(or(eq(schema.contacts.phone, BF_P), eq(schema.contacts.cpf, BF_CPF)));
		if (cs.length) {
			await db.delete(schema.contacts).where(
				inArray(
					schema.contacts.id,
					cs.map((c) => c.id),
				),
			);
		}
	}

	it("dedup por telefone (web+WhatsApp) + CPF cifrado + idempotência", async () => {
		// dois leads do MESMO telefone em canais diferentes (web + WhatsApp)
		const webEnc = encryptIdentity({ cpf: BF_CPF, celular: BF_P });
		const [convWeb] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: { identityEnc: webEnc } })
			.returning({ id: schema.conversations.id });
		convIds.push(convWeb.id);
		await db
			.insert(schema.leads)
			.values({ conversationId: convWeb.id, phone: BF_P, name: "Helena" });

		const [convWa] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", status: "active", waId: BF_P, metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(convWa.id);
		await db.insert(schema.leads).values({ conversationId: convWa.id, phone: BF_P });

		// lead anônimo (sem telefone/cpf) — não deve virar contato
		const [convAnon] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(convAnon.id);
		await db.insert(schema.leads).values({ conversationId: convAnon.id });

		await backfillContacts();

		// 1 só contato pro telefone, com CPF raw populado do meta cifrado
		const contactsForPhone = await db
			.select()
			.from(schema.contacts)
			.where(eq(schema.contacts.phone, BF_P));
		expect(contactsForPhone.length).toBe(1);
		expect(contactsForPhone[0].cpf).toBe(BF_CPF);
		const contactId = contactsForPhone[0].id;

		// ambas as conversas religadas ao mesmo contato
		const linkedConvs = await db
			.select({ id: schema.conversations.id })
			.from(schema.conversations)
			.where(eq(schema.conversations.contactId, contactId));
		expect(linkedConvs.map((c) => c.id).sort()).toEqual([convWeb.id, convWa.id].sort());

		// lead anônimo continua sem contactId
		const anonLead = await db.query.leads.findFirst({
			where: eq(schema.leads.conversationId, convAnon.id),
		});
		expect(anonLead?.contactId).toBeNull();

		// idempotência: rodar de novo não duplica contato
		await backfillContacts();
		const afterSecond = await db
			.select()
			.from(schema.contacts)
			.where(eq(schema.contacts.phone, BF_P));
		expect(afterSecond.length).toBe(1);
		expect(afterSecond[0].id).toBe(contactId);
	});
});
