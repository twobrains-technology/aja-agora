import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";

vi.mock("@/lib/whatsapp/proxy", () => ({
	handoffToAgents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

const { POST } = await import("./route");

function makeReq(body: unknown): NextRequest {
	return new Request("http://localhost/api/leads", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-forwarded-for": "127.0.0.1",
		},
		body: JSON.stringify(body),
	}) as unknown as NextRequest;
}

async function cleanup(convId: string): Promise<void> {
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe("POST /api/leads", () => {
	let convId: string;
	beforeEach(async () => {
		const [c] = await db.insert(conversations).values({}).returning();
		convId = c.id;
	});
	afterEach(async () => {
		await cleanup(convId);
	});

	it("aceita submit com phone, sem email", async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				name: "Kairo",
				phone: "(11) 98765-4321",
				email: "",
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(lead?.phone).toBe("11987654321");
		expect(lead?.email).toBeNull();
	});

	it("rejeita submit sem phone", async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				name: "Kairo",
				phone: "",
				email: "k@a.com",
			}),
		);
		expect(res.status).toBe(400);
	});

	it("FIX-27: salvar lead com phone seta contactPhone (mascarado) no meta", async () => {
		await POST(makeReq({ conversationId: convId, name: "Kairo", phone: "(11) 98765-4321" }));
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
		// o opt-in passa a enxergar o telefone já informado → vira confirmação
		expect(meta.contactPhone).toBe("(11) 9...-4321");
	});

	it("idempotente — segundo submit atualiza, não duplica", async () => {
		await POST(
			makeReq({
				conversationId: convId,
				name: "Kairo",
				phone: "11987654321",
			}),
		);
		await POST(
			makeReq({
				conversationId: convId,
				name: "Kairo",
				phone: "11987654321",
				email: "k@a.com",
			}),
		);
		const all = await db.query.leads.findMany({
			where: eq(leads.conversationId, convId),
		});
		expect(all.length).toBe(1);
		expect(all[0].email).toBe("k@a.com");
	});
});
