/**
 * E2E — FIX-47: recuperação cross-device por telefone/CPF + gate OTP (opção A).
 *
 * Fluxo real contra o servidor (endpoints + DB + OTP):
 *  - contexto leve por telefone NÃO revela CPF/proposta/link;
 *  - dado sensível só após OTP verificado (anti-pretexting);
 *  - telefone de terceiro / código errado → 401, sem vazar nada.
 *
 * devCode é ecoado só em ambiente local (TB_ENV=local) — usado aqui pra fechar o
 * fluxo sem depender de WhatsApp/SMS real.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";

const PHONE = "62991471234";
const CPF = "52998224725";
const SECRET_LINK = "https://uselink.me/secret-fix47-pdf";
const ids = { contact: randomUUID(), conv: randomUUID(), lead: randomUUID(), proposal: randomUUID() };

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
	const db = new Client({ connectionString: DATABASE_URL });
	await db.connect();
	try {
		return await fn(db);
	} finally {
		await db.end();
	}
}

test.beforeAll(async ({ request }, testInfo) => {
	const probe = await request.post("/api/chat/recover", { data: {}, failOnStatusCode: false });
	if (probe.status() === 404) {
		testInfo.skip(true, "Rota /api/chat/recover não existe no servidor alvo.");
	}
	await withDb(async (db) => {
		await db.query(`INSERT INTO contacts (id, phone, cpf, name) VALUES ($1,$2,$3,'Rafael E2E')`, [
			ids.contact,
			PHONE,
			CPF,
		]);
		await db.query(
			`INSERT INTO conversations (id, channel, status, contact_id, metadata) VALUES ($1,'web','active',$2,'{}')`,
			[ids.conv, ids.contact],
		);
		await db.query(
			`INSERT INTO leads (id, conversation_id, contact_id, credit_value, stage) VALUES ($1,$2,$3,'90000.00','proposta_enviada')`,
			[ids.lead, ids.conv, ids.contact],
		);
		await db.query(
			`INSERT INTO bevi_proposals (id, conversation_id, lead_id, contact_id, proposal_id, administradora, consortium_proposal_link)
			 VALUES ($1,$2,$3,$4,'prop-e2e-47','Bevicred',$5)`,
			[ids.proposal, ids.conv, ids.lead, ids.contact, SECRET_LINK],
		);
	});
});

test.afterAll(async () => {
	await withDb(async (db) => {
		await db.query("DELETE FROM conversations WHERE id = $1", [ids.conv]);
		await db.query("DELETE FROM contacts WHERE id = $1", [ids.contact]);
		await db.query("DELETE FROM verification WHERE identifier = $1", [`recovery-otp:${PHONE}`]);
	});
});

test("contexto leve por telefone: nome+objetivo, SEM CPF/proposta/link", async ({ request }) => {
	const res = await request.post("/api/chat/recover", { data: { phone: PHONE } });
	expect(res.ok()).toBeTruthy();
	const body = await res.json();
	expect(body.found).toBe(true);
	expect(body.name).toBe("Rafael E2E");
	const raw = JSON.stringify(body);
	expect(raw).not.toContain(SECRET_LINK);
	expect(raw).not.toContain(CPF);
});

test("anti-pretexting: dado sensível só após OTP; código errado → 401", async ({ request }) => {
	// pede OTP (devCode ecoado em local)
	const otpRes = await request.post("/api/chat/recover/otp", { data: { phone: PHONE } });
	const otp = await otpRes.json();
	expect(otp.found).toBe(true);
	expect(otp.devCode).toMatch(/^\d{6}$/);

	// código errado → 401, sem vazar nada
	const wrong = await request.post("/api/chat/recover/verify", {
		data: { phone: PHONE, code: "000000" },
		failOnStatusCode: false,
	});
	expect(wrong.status()).toBe(401);
	expect(JSON.stringify(await wrong.json())).not.toContain(SECRET_LINK);

	// código certo → 200 com a sessão sensível (link + CPF mascarado)
	const ok = await request.post("/api/chat/recover/verify", {
		data: { phone: PHONE, code: otp.devCode },
	});
	expect(ok.ok()).toBeTruthy();
	const session = await ok.json();
	expect(session.recovered.proposals[0].consortiumProposalLink).toBe(SECRET_LINK);
	expect(session.recovered.contact.cpf).toBe("***.***.247-25");
	expect(JSON.stringify(session)).not.toContain(CPF); // CPF cru nunca sai
});

test("telefone de terceiro (sem contato): OTP found:false, não envia", async ({ request }) => {
	const res = await request.post("/api/chat/recover/otp", { data: { phone: "62900000000" } });
	const body = await res.json();
	expect(body.found).toBe(false);
	expect(body.devCode).toBeUndefined();
});
