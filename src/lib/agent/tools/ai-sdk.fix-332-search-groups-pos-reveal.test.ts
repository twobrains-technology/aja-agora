// Integration (DB real) — FIX-332 (P0.1, veredito rodada 1, web 4/10 + whatsapp
// 3/10): pós-reveal, o modelo chamava search_groups/recommend_groups pra
// detalhar uma oferta já mostrada — as duas tools estavam FORA do toolset da
// fase reveal (tool-policy.ts), o AI SDK devolvia NoSuchToolError, e o runner
// descartava a fala INTEIRA do turno pro fallback enlatado (index.ts:797).
//
// Correção: search_groups/recommend_groups passam a EXISTIR pós-reveal (ver
// tool-policy.test.ts), mas NÃO re-buscam a Bevi — devolvem os grupos JÁ
// EXIBIDOS, lidos dos artifacts persistidos (mesma fonte de
// listShownOffersForConversation, choose-offer.ts). Este teste prova, com spy
// no adapter, que a Bevi NÃO é chamada de novo nesse caminho — e que o
// comportamento normal (sem reuseShownGroupsOnly) continua buscando de verdade.
//
// Skip sem DB.
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { fixtureDiscoveryAdapter } from "../../../../tests/helpers/fixture-discovery-adapter";
import { buildConsorcioTools } from "./ai-sdk";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const SHOWN_GROUPS_PAYLOAD = {
	groups: [
		{
			id: "grp-itau",
			administradora: "ITAÚ",
			creditValue: 92902,
			termMonths: 200,
			monthlyPayment: 2182.01,
		},
		{
			id: "grp-rodobens",
			administradora: "RODOBENS",
			creditValue: 90000,
			termMonths: 180,
			monthlyPayment: 1218.92,
		},
	],
};

describeIfDb("FIX-332 — search_groups/recommend_groups pós-reveal não re-buscam a Bevi", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
	});

	afterAll(() => {
		__setDiscoveryAdapterFactoryForTests(null);
	});

	async function seedComparisonTable(conversationId: string): Promise<string> {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ id: conversationId, channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id })
			.onConflictDoNothing();
		const convId = conv?.id ?? conversationId;
		const [msg] = await db
			.insert(schema.messages)
			.values({
				conversationId: convId,
				role: "assistant",
				content: "Encontramos opções!",
				channel: "web",
			})
			.returning({ id: schema.messages.id });
		await db.insert(schema.artifacts).values({
			messageId: msg.id,
			type: "comparison_table",
			payload: SHOWN_GROUPS_PAYLOAD,
		});
		return convId;
	}

	async function cleanup(convId: string): Promise<void> {
		const msgs = await db
			.select({ id: schema.messages.id })
			.from(schema.messages)
			.where(eq(schema.messages.conversationId, convId));
		const ids = msgs.map((m) => m.id);
		if (ids.length > 0) {
			await db.delete(schema.artifacts).where(inArray(schema.artifacts.messageId, ids));
		}
		await db.delete(schema.messages).where(eq(schema.messages.conversationId, convId));
		await db.delete(schema.conversations).where(eq(schema.conversations.id, convId));
	}

	it("search_groups com reuseShownGroupsOnly NÃO chama o adapter da Bevi — devolve os grupos JÁ EXIBIDOS", async () => {
		const convId = await seedComparisonTable(randomUUID());
		const adapter = fixtureDiscoveryAdapter();
		const searchSpy = vi.spyOn(adapter, "searchGroups");
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const tools = buildConsorcioTools({ conversationId: convId, reuseShownGroupsOnly: true });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const out = (await exec(
			{ category: "auto", creditMin: 80_000, creditMax: 100_000 },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as { groups: Array<{ id: string; administradora: string }>; note?: string };

		expect(searchSpy).not.toHaveBeenCalled();
		expect(out.groups.map((g) => g.id).sort()).toEqual(["grp-itau", "grp-rodobens"]);
		expect(out.note).toMatch(/j[áa]\s+exibid/i);

		await cleanup(convId);
	});

	it("recommend_groups com reuseShownGroupsOnly NÃO chama o adapter da Bevi — devolve os grupos JÁ EXIBIDOS", async () => {
		const convId = await seedComparisonTable(randomUUID());
		const adapter = fixtureDiscoveryAdapter();
		const searchSpy = vi.spyOn(adapter, "searchGroups");
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const tools = buildConsorcioTools({ conversationId: convId, reuseShownGroupsOnly: true });
		const exec = tools.recommend_groups.execute;
		if (!exec) throw new Error("recommend_groups.execute undefined");
		const out = (await exec(
			{ category: "auto", creditMin: 80_000, creditMax: 100_000, budget: 0, desiredTermMonths: 0 },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as { groups: Array<{ id: string; administradora: string }> };

		expect(searchSpy).not.toHaveBeenCalled();
		expect(out.groups.map((g) => g.id).sort()).toEqual(["grp-itau", "grp-rodobens"]);

		await cleanup(convId);
	});

	it("SEM reuseShownGroupsOnly, search_groups continua buscando a Bevi de verdade (comportamento normal preservado)", async () => {
		const convId = await seedComparisonTable(randomUUID());
		const adapter = fixtureDiscoveryAdapter();
		const searchSpy = vi.spyOn(adapter, "searchGroups");
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const tools = buildConsorcioTools({ conversationId: convId });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		await exec(
			{ category: "auto", creditMin: 20_000, creditMax: 200_000 },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		);

		expect(searchSpy).toHaveBeenCalledTimes(1);

		await cleanup(convId);
	});

	it("reuseShownGroupsOnly sem conversationId devolve o sentinel sem contexto (nunca quebra)", async () => {
		const tools = buildConsorcioTools({ reuseShownGroupsOnly: true });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const out = (await exec(
			{ category: "auto" },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as { error?: string };
		expect(out.error).toBeDefined();
	});
});
