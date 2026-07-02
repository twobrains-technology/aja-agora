// Integration (DB real) — FIX-179 (Mirella, 2026-07-01): a IA pulou pra
// simulate_quota/get_group_details/present_decision_prompt sobre "Embracon",
// um grupo REAL da Bevi (visto no discovery cache) que NUNCA apareceu em tela
// pro usuário. Trava: essas 3 tools só podem operar sobre grupo cujo
// id/administradora JÁ passou por um artifact de exibição
// (comparison_table/group_card/recommendation_card/simulation_result) — nesta
// conversa, seja em turno anterior (DB) ou neste mesmo turno (in-memory).
// Skip se DATABASE_URL ausente.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { fixtureDiscoveryAdapter } from "../../../../tests/helpers/fixture-discovery-adapter";
import { buildConsorcioTools } from "./ai-sdk";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const NOT_SHOWN_DIRECTIVE = /nao foi exibid|não foi exibid|apresente.*antes|reapresent/i;

describeIfDb("FIX-179 — trava de segurança: grupo não-exibido bloqueado (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		__setDiscoveryAdapterFactoryForTests(() => fixtureDiscoveryAdapter());
	});

	afterAll(() => {
		__setDiscoveryAdapterFactoryForTests(null);
	});

	async function discoverRealGroupId(conversationId: string): Promise<string> {
		const tools = buildConsorcioTools({ conversationId });
		const exec = tools.search_groups.execute;
		if (!exec) throw new Error("search_groups.execute undefined");
		const result = (await exec(
			{ category: "auto", creditMin: 20_000, creditMax: 200_000 },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as { groups: Array<{ id: string; administradora: string }> };
		if (!result.groups?.length) throw new Error("fixture não devolveu grupos");
		return result.groups[0].id;
	}

	it("get_group_details BLOQUEIA grupo real da Bevi que nunca foi exibido em tela (raiz do bug Mirella)", async () => {
		const conversationId = randomUUID();
		const realGroupId = await discoverRealGroupId(conversationId);

		// NOVA instância de tools (turno novo) — nada foi apresentado, nem em DB
		// nem neste turno. O grupo EXISTE na Bevi mas nunca chegou na tela.
		const tools = buildConsorcioTools({ conversationId });
		const exec = tools.get_group_details.execute;
		if (!exec) throw new Error("get_group_details.execute undefined");
		const out = (await exec(
			{ groupId: realGroupId },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as { error?: string };

		expect(out.error).toMatch(NOT_SHOWN_DIRECTIVE);
	});

	it("simulate_quota BLOQUEIA grupo real da Bevi que nunca foi exibido em tela", async () => {
		const conversationId = randomUUID();
		const realGroupId = await discoverRealGroupId(conversationId);

		const tools = buildConsorcioTools({ conversationId });
		const exec = tools.simulate_quota.execute;
		if (!exec) throw new Error("simulate_quota.execute undefined");
		const out = (await exec(
			{ groupId: realGroupId, creditValue: 100_000 },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as { error?: string };

		expect(out.error).toMatch(NOT_SHOWN_DIRECTIVE);
	});

	it("get_group_details PERMITE grupo apresentado NESTE MESMO turno (present_comparison_table antes)", async () => {
		const conversationId = randomUUID();
		const realGroupId = await discoverRealGroupId(conversationId);

		// MESMA instância de tools = mesmo turno: apresenta o comparativo
		// primeiro, depois pede detalhes do MESMO grupo.
		const tools = buildConsorcioTools({ conversationId });
		const presentExec = tools.present_comparison_table.execute;
		if (!presentExec) throw new Error("present_comparison_table.execute undefined");
		await presentExec(
			{
				groups: [
					{
						id: realGroupId,
						administradora: "ITAÚ",
						category: "auto",
						creditValue: 100_000,
						monthlyPayment: 1_500,
						adminFeePercent: 18,
						termMonths: 80,
						availableSlots: 5,
						contemplationRate: 8,
					},
				],
			},
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t1", messages: [] } as any,
		);

		const detailsExec = tools.get_group_details.execute;
		if (!detailsExec) throw new Error("get_group_details.execute undefined");
		const out = (await detailsExec(
			{ groupId: realGroupId },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t2", messages: [] } as any,
		)) as { error?: string; id?: string };

		expect(out.error).toBeUndefined();
		expect(out.id).toBe(realGroupId);
	});

	it("get_group_details PERMITE grupo apresentado em TURNO ANTERIOR (persistido no banco)", async () => {
		const conversationId = randomUUID();
		const realGroupId = await discoverRealGroupId(conversationId);

		// Persiste o comparativo como se fosse um turno anterior JÁ salvo.
		const [conv] = await db
			.insert(schema.conversations)
			.values({ id: conversationId, channel: "web", status: "active", metadata: {} })
			.returning({ id: schema.conversations.id })
			.onConflictDoNothing();
		const convId = conv?.id ?? conversationId;
		const [msg] = await db
			.insert(schema.messages)
			.values({ conversationId: convId, role: "assistant", content: "Encontramos opções!", channel: "web" })
			.returning({ id: schema.messages.id });
		await db.insert(schema.artifacts).values({
			messageId: msg.id,
			type: "comparison_table",
			payload: { groups: [{ id: realGroupId, administradora: "ITAÚ" }] },
		});

		// NOVA instância de tools (turno novo, cache local vazio) — precisa
		// carregar do banco pra reconhecer o grupo como já exibido.
		const tools = buildConsorcioTools({ conversationId });
		const exec = tools.get_group_details.execute;
		if (!exec) throw new Error("get_group_details.execute undefined");
		const out = (await exec(
			{ groupId: realGroupId },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as { error?: string; id?: string };

		expect(out.error).toBeUndefined();
		expect(out.id).toBe(realGroupId);

		await db.delete(schema.messages).where(eq(schema.messages.conversationId, convId));
		await db.delete(schema.conversations).where(eq(schema.conversations.id, convId));
	});

	it("present_decision_prompt BLOQUEIA administradora nunca apresentada (o bug exato: 'Embracon' do nada)", async () => {
		const conversationId = randomUUID();
		const tools = buildConsorcioTools({ conversationId });
		const exec = tools.present_decision_prompt.execute;
		if (!exec) throw new Error("present_decision_prompt.execute undefined");
		const out = (await exec(
			{ administradora: "Embracon" },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as string;

		expect(out).toMatch(NOT_SHOWN_DIRECTIVE);
	});

	it("present_decision_prompt PERMITE administradora já apresentada", async () => {
		const conversationId = randomUUID();
		const realGroupId = await discoverRealGroupId(conversationId);
		const tools = buildConsorcioTools({ conversationId });

		const cardExec = tools.present_group_card.execute;
		if (!cardExec) throw new Error("present_group_card.execute undefined");
		await cardExec(
			{
				id: realGroupId,
				administradora: "ITAÚ",
				category: "auto",
				creditValue: 100_000,
				monthlyPayment: 1_500,
				adminFeePercent: 18,
				termMonths: 80,
				availableSlots: 5,
				contemplationRate: 8,
			},
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t1", messages: [] } as any,
		);

		const decisionExec = tools.present_decision_prompt.execute;
		if (!decisionExec) throw new Error("present_decision_prompt.execute undefined");
		const out = (await decisionExec(
			{ administradora: "ITAÚ" },
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t2", messages: [] } as any,
		)) as string;

		expect(out).not.toMatch(NOT_SHOWN_DIRECTIVE);
		expect(out).toMatch(/decis/i);
	});

	it("present_decision_prompt SEM administradora (omitida) não é bloqueado — nada pra validar", async () => {
		const conversationId = randomUUID();
		const tools = buildConsorcioTools({ conversationId });
		const exec = tools.present_decision_prompt.execute;
		if (!exec) throw new Error("present_decision_prompt.execute undefined");
		const out = (await exec(
			{},
			// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx not exported
			{ toolCallId: "t", messages: [] } as any,
		)) as string;

		expect(out).not.toMatch(NOT_SHOWN_DIRECTIVE);
	});
});
