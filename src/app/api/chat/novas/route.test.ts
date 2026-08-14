// O delta que faz a retomada chegar ao cliente no web sem ele recarregar nada.

import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { GET } from "./route";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const T0 = new Date("2026-08-13T12:00:00.000Z");
const T1 = new Date("2026-08-13T12:05:00.000Z");

describeIfDb("GET /api/chat/novas", () => {
	const criadas: string[] = [];
	afterAll(async () => {
		if (criadas.length > 0) {
			await db.delete(messages).where(inArray(messages.conversationId, criadas));
			await db.delete(conversations).where(inArray(conversations.id, criadas));
		}
	});

	it("devolve só a fala do agente posterior ao `after`", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "web", status: "active" })
			.returning({ id: conversations.id });
		const id = conv?.id as string;
		criadas.push(id);

		await db.insert(messages).values([
			{
				conversationId: id,
				role: "assistant",
				content: "fala antiga",
				channel: "web",
				createdAt: T0,
			},
			{ conversationId: id, role: "user", content: "oi", channel: "web", createdAt: T1 },
			{
				conversationId: id,
				role: "assistant",
				content: "retomada nova",
				channel: "web",
				createdAt: new Date(T1.getTime() + 60_000),
			},
			// Marcador de card: é do log do admin, não da conversa do cliente.
			{
				conversationId: id,
				role: "assistant",
				content: "[card: group_card]",
				channel: "web",
				createdAt: new Date(T1.getTime() + 61_000),
			},
		]);

		const res = await GET(
			new Request(`http://x/api/chat/novas?conversationId=${id}&after=${T1.toISOString()}`),
		);
		const body = (await res.json()) as { messages: Array<{ content: string }> };
		const textos = body.messages.map((m) => m.content);

		expect(textos).toContain("retomada nova");
		// Nada do que o cliente já tinha na tela volta.
		expect(textos).not.toContain("fala antiga");
		expect(textos).not.toContain("oi");
		expect(textos.some((t) => t.startsWith("[card:"))).toBe(false);
	});

	it("exige conversationId", async () => {
		const res = await GET(new Request("http://x/api/chat/novas"));
		expect(res.status).toBe(400);
	});
});
