// Integration (DB real) — FIX-179: loadShownGroups agrega os artifacts REAIS
// já persistidos pra uma conversa. Skip se DATABASE_URL ausente.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-179 — loadShownGroups (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let loadShownGroups: typeof import("./shown-groups").loadShownGroups;

	let conversationId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ loadShownGroups } = await import("./shown-groups"));

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		conversationId = conv.id;

		// turno 1: comparison_table com 2 grupos
		const [m1] = await db
			.insert(schema.messages)
			.values({ conversationId, role: "assistant", content: "Encontramos opções!", channel: "web" })
			.returning({ id: schema.messages.id });
		await db.insert(schema.artifacts).values({
			messageId: m1.id,
			type: "comparison_table",
			payload: {
				groups: [
					{ id: "grupo-itau", administradora: "ITAÚ" },
					{ id: "grupo-rodobens", administradora: "RODOBENS" },
				],
			},
		});

		// turno 2: recommendation_card de um grupo diferente
		const [m2] = await db
			.insert(schema.messages)
			.values({ conversationId, role: "assistant", content: "Essa é a recomendada!", channel: "web" })
			.returning({ id: schema.messages.id });
		await db.insert(schema.artifacts).values({
			messageId: m2.id,
			type: "recommendation_card",
			payload: { id: "grupo-ancora", administradora: "ÂNCORA", score: 0.9 },
		});

		// turno 3: decision_prompt (tipo sem groupId — não deve contaminar o extrator)
		const [m3] = await db
			.insert(schema.messages)
			.values({ conversationId, role: "assistant", content: "Faz sentido?", channel: "web" })
			.returning({ id: schema.messages.id });
		await db.insert(schema.artifacts).values({
			messageId: m3.id,
			type: "decision_prompt",
			payload: { administradora: "Embracon" },
		});
	});

	afterAll(async () => {
		await db.delete(schema.messages).where(eq(schema.messages.conversationId, conversationId));
		await db.delete(schema.conversations).where(eq(schema.conversations.id, conversationId));
	});

	it("agrega ids/administradoras de TODOS os turnos da conversa (comparison_table + recommendation_card)", async () => {
		const shown = await loadShownGroups(conversationId);
		expect(shown.ids.has("grupo-itau")).toBe(true);
		expect(shown.ids.has("grupo-rodobens")).toBe(true);
		expect(shown.ids.has("grupo-ancora")).toBe(true);
		expect(shown.administradoras.has("ITAÚ")).toBe(true);
		expect(shown.administradoras.has("RODOBENS")).toBe(true);
		expect(shown.administradoras.has("ÂNCORA")).toBe(true);
	});

	it("NÃO inclui administradora de um decision_prompt (não é um artifact de exibição de grupo)", async () => {
		const shown = await loadShownGroups(conversationId);
		expect(shown.administradoras.has("Embracon")).toBe(false);
	});

	it("conversa sem nenhum artifact → devolve sets vazios, não quebra", async () => {
		const [empty] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id });
		const shown = await loadShownGroups(empty.id);
		expect(shown.ids.size).toBe(0);
		expect(shown.administradoras.size).toBe(0);
		await db.delete(schema.conversations).where(eq(schema.conversations.id, empty.id));
	});
});
