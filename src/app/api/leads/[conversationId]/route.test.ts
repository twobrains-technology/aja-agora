import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { GET } from "./route";

async function cleanup(convId: string): Promise<void> {
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe("GET /api/leads/[conversationId]", () => {
	let convId: string;
	beforeEach(async () => {
		const [c] = await db.insert(conversations).values({ contactName: "Kairo" }).returning();
		convId = c.id;
	});
	afterEach(async () => {
		await cleanup(convId);
	});

	it("retorna contactName + phone do lead se existir, email vazio se null", async () => {
		await db.insert(leads).values({
			conversationId: convId,
			name: "Kairo",
			phone: "11987654321",
			email: null,
		});
		const res = await GET(new Request(`http://localhost/api/leads/${convId}`), {
			params: Promise.resolve({ conversationId: convId }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({
			name: "Kairo",
			phone: "11987654321",
			email: "",
		});
	});

	it("retorna só contactName se lead ainda não existe", async () => {
		const res = await GET(new Request(`http://localhost/api/leads/${convId}`), {
			params: Promise.resolve({ conversationId: convId }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ name: "Kairo", phone: "", email: "" });
	});

	it("404 em conversation inexistente (UUID válido mas sem row)", async () => {
		// UUID v4 válido pelo regex mas não existe na tabela
		const fakeId = "12345678-1234-4234-8234-123456789abc";
		const res = await GET(new Request(`http://localhost/api/leads/${fakeId}`), {
			params: Promise.resolve({ conversationId: fakeId }),
		});
		expect(res.status).toBe(404);
	});

	it("400 em conversationId inválido", async () => {
		const res = await GET(new Request(`http://localhost/api/leads/not-uuid`), {
			params: Promise.resolve({ conversationId: "not-uuid" }),
		});
		expect(res.status).toBe(400);
	});
});
