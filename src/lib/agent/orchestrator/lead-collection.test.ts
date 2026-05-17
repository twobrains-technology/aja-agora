import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { initializeLeadCollection } from "./lead-collection";

async function cleanup(convId: string): Promise<void> {
	await db.delete(leads).where(eq(leads.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describe("initializeLeadCollection — skip stages com dados capturados", () => {
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

	it("começa em 'name' se não há lead nem nome", async () => {
		const emptyConv = await db
			.insert(conversations)
			.values({})
			.returning();
		const id = emptyConv[0].id;
		try {
			const lc = await initializeLeadCollection(id);
			expect(lc.stage).toBe("name");
			expect(lc.name).toBeUndefined();
			expect(lc.phone).toBeUndefined();
		} finally {
			await cleanup(id);
		}
	});

	it("começa em 'phone' se tem nome capturado mas sem phone", async () => {
		await db.insert(leads).values({ conversationId: convId, name: "Kairo" });
		const lc = await initializeLeadCollection(convId);
		expect(lc.stage).toBe("phone");
		expect(lc.name).toBe("Kairo");
		expect(lc.phone).toBeUndefined();
	});

	it("começa em 'email' se nome e phone já foram capturados", async () => {
		await db.insert(leads).values({
			conversationId: convId,
			name: "Kairo",
			phone: "11987654321",
		});
		const lc = await initializeLeadCollection(convId);
		expect(lc.stage).toBe("email");
		expect(lc.name).toBe("Kairo");
		expect(lc.phone).toBe("11987654321");
	});
});
