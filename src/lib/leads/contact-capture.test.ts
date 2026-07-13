import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { capitalizeName, saveContactName, saveContactWhatsapp } from "./contact-capture";

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

	// PF-01 (descoberto pelo PO Lead): se agent passar "sou o Kairo",
	// split(/\s+/)[0] salvaria "sou". Stopwords precisam ser puladas.
	it("PF-01: pula stopword 'sou' e pega o nome real", async () => {
		const r = await saveContactName(convId, "sou o Kairo");
		expect(r.ok).toBe(true);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Kairo");
	});

	it("PF-01: pula 'me chamo' e pega o nome", async () => {
		const r = await saveContactName(convId, "me chamo Alan Carlos");
		expect(r.ok).toBe(true);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Alan");
	});

	it("PF-01: pula 'eu sou a' e pega o nome", async () => {
		const r = await saveContactName(convId, "eu sou a Helena");
		expect(r.ok).toBe(true);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Helena");
	});

	it("PF-01: pula 'meu nome é' e pega o nome", async () => {
		const r = await saveContactName(convId, "meu nome é Pedro");
		expect(r.ok).toBe(true);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Pedro");
	});

	it("PF-01: rejeita se só houver stopwords", async () => {
		const r = await saveContactName(convId, "sou o");
		expect(r.ok).toBe(false);
	});

	// FIX-299 (loop-de-goal r10, P9/P10 — Qwen 3.5 Fast): "Show, kairo!" — nome
	// ecoado em minúscula. Capitalização determinística no save, independe de
	// como o usuário digitou.
	it("FIX-299: nome digitado em minúsculo vira Title Case ao ser salvo", async () => {
		const r = await saveContactName(convId, "kairo");
		expect(r.ok).toBe(true);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Kairo");
	});

	it("FIX-299: nome digitado todo em maiúsculo vira Title Case ao ser salvo", async () => {
		const r = await saveContactName(convId, "MARIA");
		expect(r.ok).toBe(true);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Maria");
	});
});

describe("FIX-299 — capitalizeName (Title Case determinístico, unit puro)", () => {
	it("capitaliza nome minúsculo", () => {
		expect(capitalizeName("kairo")).toBe("Kairo");
	});

	it("capitaliza nome todo em maiúsculo", () => {
		expect(capitalizeName("MARIA")).toBe("Maria");
	});

	it("capitaliza nome misto", () => {
		expect(capitalizeName("mArIa")).toBe("Maria");
	});

	it("mantém partículas pt-BR (de/da/do/das/dos) minúsculas quando não são a 1ª palavra", () => {
		expect(capitalizeName("joão da silva")).toBe("João da Silva");
		expect(capitalizeName("MARIA DE SOUZA")).toBe("Maria de Souza");
		expect(capitalizeName("ana dos santos")).toBe("Ana dos Santos");
	});

	it("capitaliza cada lado de nome hifenizado", () => {
		expect(capitalizeName("jean-luc")).toBe("Jean-Luc");
	});

	it("já capitalizado corretamente permanece igual", () => {
		expect(capitalizeName("Kairo")).toBe("Kairo");
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

	it("conversation simulada PROMOVE stage (demo path espelha prod)", async () => {
		// Pipeline admin agora mostra leads simulados (demo path pro stakeholder).
		// Lead simulado deve refletir o mesmo comportamento de stage que real:
		// receber WhatsApp promove novo→engajado.
		const simConvId = await createConv({ isSimulated: true });
		try {
			await saveContactName(simConvId, "Kairo");
			await saveContactWhatsapp(simConvId, "11987654321");
			const lead = await db.query.leads.findFirst({
				where: eq(leads.conversationId, simConvId),
			});
			expect(lead?.phone).toBe("11987654321");
			expect(lead?.stage).toBe("engajado");
			expect(lead?.isSimulated).toBe(true);
		} finally {
			await cleanupConv(simConvId);
		}
	});
});
