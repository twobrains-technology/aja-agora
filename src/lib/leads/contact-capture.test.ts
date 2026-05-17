import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { saveContactName, saveContactWhatsapp } from "./contact-capture";

async function createConv(opts?: { isSimulated?: boolean }): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ isSimulated: opts?.isSimulated ?? false })
		.returning();
	return c.id;
}

async function cleanupConv(convId: string): Promise<void> {
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe("saveContactName", () => {
	let convId: string;
	beforeEach(async () => {
		convId = await createConv();
	});
	afterEach(async () => {
		await cleanupConv(convId);
	});

	it("cria lead novo + popula conversations.contactName", async () => {
		const result = await saveContactName(convId, "Kairo");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.leadId).toBeDefined();
		expect(result.created).toBe(true);

		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Kairo");

		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(lead?.name).toBe("Kairo");
		expect(lead?.stage).toBe("novo");
	});

	it("é idempotente — 2 chamadas mesmo nome não duplicam lead", async () => {
		const r1 = await saveContactName(convId, "Kairo");
		const r2 = await saveContactName(convId, "Kairo");
		expect(r1.ok && r2.ok).toBe(true);
		if (r1.ok && r2.ok) {
			expect(r1.leadId).toBe(r2.leadId);
			expect(r1.created).toBe(true);
			expect(r2.created).toBe(false);
		}
		const all = await db.query.leads.findMany({
			where: eq(leads.conversationId, convId),
		});
		expect(all.length).toBe(1);
	});

	it("rejeita nome vazio", async () => {
		const r = await saveContactName(convId, "");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe("name_invalid");
	});

	it("rejeita nome com números", async () => {
		const r = await saveContactName(convId, "Kairo123");
		expect(r.ok).toBe(false);
	});

	it("rejeita nome com 1 char", async () => {
		const r = await saveContactName(convId, "K");
		expect(r.ok).toBe(false);
	});

	it("rejeita nome > 30 chars", async () => {
		const r = await saveContactName(convId, "A".repeat(31));
		expect(r.ok).toBe(false);
	});

	it("extrai só primeiro nome de nome completo", async () => {
		const r = await saveContactName(convId, "Alan Carlos da Silva");
		expect(r.ok).toBe(true);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Alan");
	});

	it("aceita nome com hífen e apóstrofo", async () => {
		const r = await saveContactName(convId, "Jean-Luc");
		expect(r.ok).toBe(true);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Jean-Luc");
	});
});

describe("saveContactWhatsapp", () => {
	let convId: string;
	beforeEach(async () => {
		convId = await createConv();
	});
	afterEach(async () => {
		await cleanupConv(convId);
	});

	it("promove lead novo→engajado quando salva phone", async () => {
		await saveContactName(convId, "Kairo");
		const r = await saveContactWhatsapp(convId, "(11) 98765-4321");
		expect(r.ok).toBe(true);

		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(lead?.phone).toBe("11987654321");
		expect(lead?.stage).toBe("engajado");
	});

	it("cria lead direto se nome ainda não foi capturado", async () => {
		const r = await saveContactWhatsapp(convId, "11987654321");
		expect(r.ok).toBe(true);
		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(lead?.phone).toBe("11987654321");
		expect(lead?.stage).toBe("engajado");
		expect(lead?.name).toBeNull();
	});

	it("rejeita telefone inválido (sem DDD)", async () => {
		const r = await saveContactWhatsapp(convId, "987654321");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe("phone_invalid");
	});

	it("é idempotente — 2 chamadas não duplicam lead", async () => {
		const r1 = await saveContactWhatsapp(convId, "11987654321");
		const r2 = await saveContactWhatsapp(convId, "11987654321");
		expect(r1.ok && r2.ok).toBe(true);
		const all = await db.query.leads.findMany({
			where: eq(leads.conversationId, convId),
		});
		expect(all.length).toBe(1);
	});

	it("conversation simulada não promove stage (kanban guard)", async () => {
		const simConvId = await createConv({ isSimulated: true });
		try {
			await saveContactName(simConvId, "Kairo");
			await saveContactWhatsapp(simConvId, "11987654321");
			const lead = await db.query.leads.findFirst({
				where: eq(leads.conversationId, simConvId),
			});
			expect(lead?.phone).toBe("11987654321");
			expect(lead?.stage).toBe("novo");
		} finally {
			await cleanupConv(simConvId);
		}
	});
});
