// Integration (DB real) — FIX-46: retomada same-device.
// getResumableConversation acha a conversa do cookie (web, ativa) com mensagens.
// Skip se DATABASE_URL ausente.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-46 — getResumableConversation (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let getResumableConversation: typeof import("./resume").getResumableConversation;

	const COOKIE = `cookie-fix46-${Date.now()}`;
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ getResumableConversation } = await import("./resume"));
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
	});

	async function seedConv(opts: {
		cookie: string | null;
		channel?: "web" | "whatsapp";
		status?: "active" | "handed_off" | "closed";
		withMessage?: boolean;
	}) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: opts.channel ?? "web",
				status: opts.status ?? "active",
				metadata: opts.cookie ? { webCookie: opts.cookie } : {},
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		if (opts.withMessage ?? true) {
			await db
				.insert(schema.messages)
				.values({
					conversationId: conv.id,
					role: "user",
					content: "oi, quero um carro",
					channel: "web",
				});
		}
		return conv.id;
	}

	it("retorna a conversa do cookie com as mensagens", async () => {
		const id = await seedConv({ cookie: COOKIE });
		const r = await getResumableConversation(COOKIE);
		expect(r?.conversationId).toBe(id);
		expect(r?.messages.length).toBe(1);
		expect(r?.messages[0].content).toBe("oi, quero um carro");
	});

	it("cookie ausente → null (primeira vez)", async () => {
		expect(await getResumableConversation(null)).toBeNull();
		expect(await getResumableConversation(undefined)).toBeNull();
	});

	it("cookie de outro device → null (não vaza conversa alheia)", async () => {
		await seedConv({ cookie: COOKIE });
		expect(await getResumableConversation("cookie-de-outro-totalmente-diferente")).toBeNull();
	});

	it("conversa handed_off é excluída (atendimento humano não retoma no chat)", async () => {
		const c = `${COOKIE}-handed`;
		await seedConv({ cookie: c, status: "handed_off" });
		expect(await getResumableConversation(c)).toBeNull();
	});

	it("conversa sem mensagens úteis → null (não ressuscita vazia)", async () => {
		const c = `${COOKIE}-empty`;
		await seedConv({ cookie: c, withMessage: false });
		expect(await getResumableConversation(c)).toBeNull();
	});
});
