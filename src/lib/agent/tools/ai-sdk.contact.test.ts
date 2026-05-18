import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { consorcioTools, PRESENTATION_TOOLS } from "./ai-sdk";

async function cleanup(convId: string): Promise<void> {
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe("save_contact_name tool", () => {
	let convId: string;
	beforeEach(async () => {
		const [c] = await db.insert(conversations).values({}).returning();
		convId = c.id;
	});
	afterEach(async () => {
		await cleanup(convId);
	});

	it("salva nome e retorna confirmação textual", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: tool typing complexo
		const result = await (consorcioTools.save_contact_name as any).execute({
			conversationId: convId,
			name: "Kairo",
		});
		expect(typeof result).toBe("string");
		expect(result).toContain("Kairo");
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(conv?.contactName).toBe("Kairo");
	});

	it("retorna feedback de erro estruturado em nome inválido", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: tool typing complexo
		const result = await (consorcioTools.save_contact_name as any).execute({
			conversationId: convId,
			name: "X",
		});
		expect(result.toLowerCase()).toContain("invalid");
	});
});

describe("save_contact_whatsapp tool", () => {
	let convId: string;
	beforeEach(async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo" })
			.returning();
		convId = c.id;
		await db.insert(leads).values({ conversationId: convId, name: "Kairo" });
	});
	afterEach(async () => {
		await cleanup(convId);
	});

	it("salva phone normalizado e promove stage", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: tool typing complexo
		const result = await (consorcioTools.save_contact_whatsapp as any).execute({
			conversationId: convId,
			phone: "(11) 98765-4321",
		});
		expect(typeof result).toBe("string");
		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(lead?.phone).toBe("11987654321");
		expect(lead?.stage).toBe("engajado");
	});

	it("retorna erro estruturado em phone inválido", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: tool typing complexo
		const result = await (consorcioTools.save_contact_whatsapp as any).execute({
			conversationId: convId,
			phone: "abc",
		});
		expect(result.toLowerCase()).toContain("invalid");
	});
});

describe("present_whatsapp_optin tool", () => {
	it("está registrada em PRESENTATION_TOOLS", () => {
		expect(PRESENTATION_TOOLS.has("present_whatsapp_optin")).toBe(true);
	});

	it("execute retorna placeholder textual", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: tool typing complexo
		const result = await (consorcioTools.present_whatsapp_optin as any).execute({});
		expect(typeof result).toBe("string");
		expect(result.toLowerCase()).toContain("whatsapp");
	});
});
