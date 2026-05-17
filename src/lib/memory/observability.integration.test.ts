// src/lib/memory/observability.integration.test.ts
//
// Integration tests pra recordMemoryEvent contra Postgres real. Plano §5.
// Skip se DATABASE_URL ausente.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordMemoryEvent } from "./observability";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("recordMemoryEvent (integration, Postgres)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	const createdConversationIds: string[] = [];
	const createdEventIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
	});

	afterAll(async () => {
		for (const id of createdEventIds) {
			await db.delete(schema.memoryEvents).where(eq(schema.memoryEvents.id, id));
		}
		for (const id of createdConversationIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
	});

	it("insere row com FK válida pra conversation existente", async () => {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		createdConversationIds.push(conv.id);

		await recordMemoryEvent({
			conversationId: conv.id,
			lettaAgentId: "agent-test-123",
			eventType: "agent_created",
			payload: { kind: "test" },
			latencyMs: 42,
		});

		const rows = await db
			.select()
			.from(schema.memoryEvents)
			.where(eq(schema.memoryEvents.conversationId, conv.id));
		expect(rows.length).toBe(1);
		expect(rows[0].eventType).toBe("agent_created");
		expect(rows[0].lettaAgentId).toBe("agent-test-123");
		expect(rows[0].latencyMs).toBe(42);
		expect(rows[0].payload).toEqual({ kind: "test" });
		createdEventIds.push(rows[0].id);
	});

	it("FK inválida cai no try/catch sem throw", async () => {
		// UUID válido em formato mas que não existe na tabela conversations
		const fakeId = "00000000-0000-0000-0000-000000000999";
		await expect(
			recordMemoryEvent({
				conversationId: fakeId,
				lettaAgentId: "agent-fk-fail",
				eventType: "fallback_triggered",
				payload: undefined,
			}),
		).resolves.toBeUndefined();
		// Não deve haver row inserida — FK falhou
		const rows = await db
			.select()
			.from(schema.memoryEvents)
			.where(eq(schema.memoryEvents.lettaAgentId, "agent-fk-fail"));
		expect(rows.length).toBe(0);
	});

	it("conversationId null é permitido (ex: fallback_triggered global)", async () => {
		await recordMemoryEvent({
			conversationId: null,
			lettaAgentId: "agent-no-conv",
			eventType: "fallback_triggered",
			payload: { reason: "letta_health_check_failed" },
		});

		const rows = await db
			.select()
			.from(schema.memoryEvents)
			.where(eq(schema.memoryEvents.lettaAgentId, "agent-no-conv"));
		expect(rows.length).toBe(1);
		expect(rows[0].conversationId).toBeNull();
		createdEventIds.push(rows[0].id);
	});
});
