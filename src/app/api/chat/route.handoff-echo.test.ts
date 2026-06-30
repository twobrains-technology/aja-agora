// FIX-31 (bloco-q) — Conversa em handoff: a bolha do usuário aparecia 2× porque
// o branch `handed_off` ecoa a user message no bus com `id: crypto.randomUUID()`
// NOVO. O provider dedupa por id (`prev.some(p => p.id === m.id)`), então o id
// do eco nunca casa com o id otimista do useChat → duplica, 100% reproduzível.
// Contrato: o eco preserva o id ORIGINAL da mensagem do cliente.
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { POST } from "./route";

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

const { publishSpy, relaySpy, saveSpy } = vi.hoisted(() => ({
	publishSpy: vi.fn(),
	relaySpy: vi.fn(async () => {}),
	saveSpy: vi.fn(async () => {}),
}));

vi.mock("@/lib/chat/message-bus", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/chat/message-bus")>()),
	publishMessage: publishSpy,
}));
vi.mock("@/lib/whatsapp/proxy", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/whatsapp/proxy")>()),
	relayWebUserToAgent: relaySpy,
}));
vi.mock("@/lib/conversation/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/conversation/messages")>()),
	saveMessage: saveSpy,
}));

describe("FIX-31 — branch handed_off ecoa user message com id original", () => {
	function makeReq(body: unknown): NextRequest {
		const req = new NextRequest("http://localhost/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-forwarded-for": "127.0.0.1",
			},
			body: JSON.stringify(body),
		});
		return req;
	}

	let convId: string;
	beforeEach(async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", status: "handed_off" })
			.returning();
		convId = c.id;
		vi.clearAllMocks();
	});
	afterEach(async () => {
		await db.delete(conversations).where(eq(conversations.id, convId));
	});

	it("publishMessage preserva o id da mensagem do cliente (dedupe do provider casa)", async () => {
		const originalId = "11111111-2222-4333-8444-555555555555";
		const res = await POST(
			makeReq({
				conversationId: convId,
				messages: [
					{
						id: originalId,
						role: "user",
						parts: [{ type: "text", text: "preciso mudar o valor" }],
					},
				],
			}),
		);
		await res.text(); // drena o stream do eco

		expect(publishSpy).toHaveBeenCalledTimes(1);
		const [pubConvId, msg] = publishSpy.mock.calls[0] as [
			string,
			{ id: string; role: string; content: string },
		];
		expect(pubConvId).toBe(convId);
		expect(msg.role).toBe("user");
		expect(msg.content).toBe("preciso mudar o valor");
		// Núcleo do bug: o id ecoado tem que ser o id ORIGINAL, não um UUID novo.
		expect(msg.id).toBe(originalId);
	});
});
