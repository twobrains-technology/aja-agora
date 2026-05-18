// Bv2-08-novo (descoberto pelo QA DEV round 2): TypeError quando
// messages[].parts é undefined ou ausente. Ex: payload legacy
// { role, content } sem parts[] crashava com
// "Cannot read properties of undefined (reading 'filter')".
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { lastUserText, POST } from "./route";

vi.mock("@/lib/middleware/rate-limit", () => ({
	checkRateLimit: () => ({ allowed: true }),
}));

describe("lastUserText — guardrail defensivo (Bv2-08-novo)", () => {
	it("retorna texto do parts moderno", () => {
		// biome-ignore lint/suspicious/noExplicitAny: relaxar pra fixture
		const messages: any = [
			{ role: "user", parts: [{ type: "text", text: "olá" }] },
		];
		expect(lastUserText(messages)).toBe("olá");
	});

	it("não crasha quando parts é undefined (payload legacy)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: simulate legacy payload
		const messages: any = [{ role: "user", content: "oi legacy" }];
		expect(() => lastUserText(messages)).not.toThrow();
	});

	it("fallback pra msg.content quando parts ausente", () => {
		// biome-ignore lint/suspicious/noExplicitAny: simulate legacy payload
		const messages: any = [{ role: "user", content: "oi legacy" }];
		expect(lastUserText(messages)).toBe("oi legacy");
	});

	it("não crasha quando parts é null", () => {
		// biome-ignore lint/suspicious/noExplicitAny: malformed
		const messages: any = [{ role: "user", parts: null }];
		expect(() => lastUserText(messages)).not.toThrow();
		expect(lastUserText(messages)).toBeNull();
	});

	it("não crasha quando part.type ausente", () => {
		// biome-ignore lint/suspicious/noExplicitAny: malformed
		const messages: any = [{ role: "user", parts: [{ text: "sem type" }] }];
		expect(() => lastUserText(messages)).not.toThrow();
	});

	it("retorna null pra array vazio", () => {
		expect(lastUserText([])).toBeNull();
	});

	it("retorna null pra undefined", () => {
		expect(lastUserText(undefined)).toBeNull();
	});

	it("pega a última mensagem de user (não a primeira)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: fixture
		const messages: any = [
			{ role: "user", parts: [{ type: "text", text: "primeira" }] },
			{ role: "assistant", parts: [{ type: "text", text: "resposta" }] },
			{ role: "user", parts: [{ type: "text", text: "ultima" }] },
		];
		expect(lastUserText(messages)).toBe("ultima");
	});
});

describe("POST /api/chat — action whatsapp_optin", () => {
	function makeReq(body: unknown): NextRequest {
		const req = new Request("http://localhost/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-forwarded-for": "127.0.0.1",
			},
			body: JSON.stringify(body),
		}) as unknown as NextRequest & {
			cookies: { get: (name: string) => { value: string } | undefined };
		};
		req.cookies = { get: () => undefined };
		return req;
	}

	async function cleanup(convId: string): Promise<void> {
		await db.delete(leads).where(eq(leads.conversationId, convId));
		await db.delete(conversations).where(eq(conversations.id, convId));
	}

	let convId: string;
	beforeEach(async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo" })
			.returning();
		convId = c.id;
	});
	afterEach(async () => {
		await cleanup(convId);
	});

	it("whatsapp_optin salva phone + promove lead pra engajado", async () => {
		await db
			.insert(leads)
			.values({ conversationId: convId, name: "Kairo" });

		const res = await POST(
			makeReq({
				conversationId: convId,
				action: { kind: "whatsapp_optin", phone: "(11) 98765-4321" },
			}),
		);
		// Drena stream
		await res.text();

		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(lead?.phone).toBe("11987654321");
		expect(lead?.stage).toBe("engajado");
	});

	it("decline marca metadata.whatsappOptinDeclined", async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				action: { kind: "whatsapp_optin_decline" },
			}),
		);
		await res.text();

		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
		expect(meta.whatsappOptinDeclined).toBe(true);
		expect(meta.whatsappOptinShown).toBe(true);
	});

	it("optin com phone inválido retorna mensagem de erro no stream", async () => {
		const res = await POST(
			makeReq({
				conversationId: convId,
				action: { kind: "whatsapp_optin", phone: "abc" },
			}),
		);
		const text = await res.text();
		expect(text.toLowerCase()).toContain("não consegui");
	});
});
