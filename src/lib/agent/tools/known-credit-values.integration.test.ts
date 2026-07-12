// Integration (DB real) — FIX-287: loadKnownGroupCreditValues mina o creditValue
// REAL de todos os simulation_result já persistidos pra uma conversa. Skip se
// DATABASE_URL ausente (mesmo padrão de shown-groups.integration.test.ts).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-287 — loadKnownGroupCreditValues (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let loadKnownGroupCreditValues: typeof import("./known-credit-values").loadKnownGroupCreditValues;

	let conversationId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ loadKnownGroupCreditValues } = await import("./known-credit-values"));

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		conversationId = conv.id;

		// turno 1: comparison_table (valor-alvo da busca) — NÃO deve contaminar o mapa.
		const [m1] = await db
			.insert(schema.messages)
			.values({ conversationId, role: "assistant", content: "Encontramos opções!", channel: "web" })
			.returning({ id: schema.messages.id });
		await db.insert(schema.artifacts).values({
			messageId: m1.id,
			type: "comparison_table",
			payload: {
				groups: [{ id: "grupo-bb", administradora: "BANCO DO BRASIL", creditValue: 120000 }],
			},
		});

		// turno 2: simulation_result do grupo-bb com o nominal REAL (diverge do alvo).
		const [m2] = await db
			.insert(schema.messages)
			.values({ conversationId, role: "assistant", content: "Simulação!", channel: "web" })
			.returning({ id: schema.messages.id });
		await db.insert(schema.artifacts).values({
			messageId: m2.id,
			type: "simulation_result",
			payload: { groupId: "grupo-bb", administradora: "BANCO DO BRASIL", creditValue: 160000 },
		});

		// turno 3: simulation_result de outro grupo, sem divergência.
		const [m3] = await db
			.insert(schema.messages)
			.values({ conversationId, role: "assistant", content: "Outra simulação!", channel: "web" })
			.returning({ id: schema.messages.id });
		await db.insert(schema.artifacts).values({
			messageId: m3.id,
			type: "simulation_result",
			payload: { groupId: "grupo-canopus", administradora: "CANOPUS", creditValue: 220000 },
		});
	});

	afterAll(async () => {
		await db.delete(schema.messages).where(eq(schema.messages.conversationId, conversationId));
		await db.delete(schema.conversations).where(eq(schema.conversations.id, conversationId));
	});

	it("mina o creditValue REAL de cada groupId já simulado em qualquer turno da conversa", async () => {
		const known = await loadKnownGroupCreditValues(conversationId);
		expect(known.get("grupo-bb")).toBe(160000);
		expect(known.get("grupo-canopus")).toBe(220000);
	});

	it("NÃO inclui grupos que só apareceram num comparison_table (nunca simulados)", async () => {
		const known = await loadKnownGroupCreditValues(conversationId);
		expect(known.has("grupo-bb-nunca-simulado")).toBe(false);
	});

	it("conversa sem nenhum simulation_result → devolve mapa vazio, não quebra", async () => {
		const [empty] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		const known = await loadKnownGroupCreditValues(empty.id);
		expect(known.size).toBe(0);
		await db.delete(schema.conversations).where(eq(schema.conversations.id, empty.id));
	});
});
