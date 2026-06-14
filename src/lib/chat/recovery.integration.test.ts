// Integration (DB real) — FIX-47: recuperação cross-device + gate OTP.
// Skip se DATABASE_URL ausente.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-47 — recuperação cross-device (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let rec: typeof import("./recovery");

	const PHONE = "62991470001";
	// CPF distinto por arquivo (evita o merge do resolve.integration apagar este
	// contato em execução paralela no mesmo DB).
	const CPF = "77788899900";
	let contactId: string;
	let convId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		rec = await import("./recovery");

		const [contact] = await db
			.insert(schema.contacts)
			.values({ phone: PHONE, cpf: CPF, name: "Rafael", email: "rafael.fix47@x.com" })
			.returning({ id: schema.contacts.id });
		contactId = contact.id;

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", contactId, metadata: {} })
			.returning({ id: schema.conversations.id });
		convId = conv.id;
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: convId,
				contactId,
				creditValue: "80000.00",
				stage: "proposta_enviada",
			})
			.returning({ id: schema.leads.id });
		await db.insert(schema.beviProposals).values({
			conversationId: convId,
			leadId: lead.id,
			contactId,
			proposalId: "prop-fix47",
			administradora: "Bevicred",
			consortiumProposalLink: "https://uselink.me/secret-pdf",
		});
	});

	afterAll(async () => {
		await db.delete(schema.conversations).where(eq(schema.conversations.id, convId));
		await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
		await db
			.delete(schema.verification)
			.where(eq(schema.verification.identifier, `recovery-otp:${PHONE}`));
	});

	it("contexto leve por telefone: nome + objetivo, SEM dado sensível", async () => {
		const light = await rec.getLightContext({ phone: PHONE });
		expect(light.found).toBe(true);
		expect(light.name).toBe("Rafael");
		expect(light.creditValueHint).toBe("80000.00");
		// anti-pretexting: o contexto leve NÃO carrega CPF, proposta nem link
		expect(JSON.stringify(light)).not.toContain("uselink.me");
		expect(JSON.stringify(light)).not.toContain(CPF);
	});

	it("telefone desconhecido → found:false (não cria contato)", async () => {
		const UNKNOWN = "62900000017";
		const light = await rec.getLightContext({ phone: UNKNOWN });
		expect(light.found).toBe(false);
		// isolation-safe: o telefone específico não materializou contato
		const created = await db
			.select()
			.from(schema.contacts)
			.where(eq(schema.contacts.phone, UNKNOWN));
		expect(created.length).toBe(0);
	});

	it("OTP: gera, verifica código errado (null), verifica certo (contactId), single-use", async () => {
		const req = await rec.requestRecoveryOtp(PHONE);
		expect(req.found).toBe(true);
		expect(req.devCode).toMatch(/^\d{6}$/); // echo só em local

		expect(await rec.verifyRecoveryOtp(PHONE, "000000")).toBeNull(); // código errado
		const ok = await rec.verifyRecoveryOtp(PHONE, req.devCode as string);
		expect(ok?.contactId).toBe(contactId);
		// single-use: re-verificar o mesmo código falha
		expect(await rec.verifyRecoveryOtp(PHONE, req.devCode as string)).toBeNull();
	});

	it("requestRecoveryOtp pra telefone sem contato → found:false (não envia)", async () => {
		const req = await rec.requestRecoveryOtp("62900000000");
		expect(req.found).toBe(false);
		expect(req.devCode).toBeUndefined();
	});

	it("sessão recuperada (pós-OTP) traz propostas + CPF mascarado (nunca cru)", async () => {
		const session = await rec.getRecoveredSession(contactId);
		expect(session?.proposals.length).toBe(1);
		expect(session?.proposals[0].consortiumProposalLink).toContain("uselink.me");
		expect(session?.contact.cpf).toBe("***.***.999-00"); // 77788899900 mascarado
		expect(session?.contact.cpf).not.toContain(CPF);
	});

	it("OTP expirado → null", async () => {
		const future = new Date(Date.now() + 10 * 60_000);
		const req = await rec.requestRecoveryOtp(PHONE);
		// verifica com 'now' depois do TTL → expirado
		expect(await rec.verifyRecoveryOtp(PHONE, req.devCode as string, { now: future })).toBeNull();
	});
});
