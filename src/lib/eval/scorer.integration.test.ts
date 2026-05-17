import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// "test_sentinel" é a URL placeholder definida em vitest.setup.ts pra módulos
// que importam @/db mas não tocam queries. Aqui o test PRECISA de DB real,
// então só roda quando a URL é REAL (não a sentinel).
const HAS_REAL_DB =
	Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL.includes("test_sentinel");
const skipIfNoDb = HAS_REAL_DB ? describe : describe.skip;

skipIfNoDb("scoreConversation (integration, requer DATABASE_URL)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let scoreConversation: typeof import("./scorer").scoreConversation;
	let __setJudgeImplForTests: typeof import("./scorer").__setJudgeImplForTests;
	let __resetJudgeImplForTests: typeof import("./scorer").__resetJudgeImplForTests;

	const createdConversationIds: string[] = [];

	beforeAll(async () => {
		// Imports lazy pra não falhar quando DATABASE_URL não está setado
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ scoreConversation, __setJudgeImplForTests, __resetJudgeImplForTests } = await import(
			"./scorer"
		));
	});

	afterAll(async () => {
		for (const id of createdConversationIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		__resetJudgeImplForTests();
	});

	async function createFixtureConversation(opts: {
		userTurns: number;
		hoursIdle: number;
		status?: "active" | "handed_off" | "closed";
	}): Promise<string> {
		const updatedAt = new Date(Date.now() - opts.hoursIdle * 60 * 60 * 1000);
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				status: opts.status ?? "active",
				updatedAt,
				metadata: { currentCategory: "imovel" },
			})
			.returning({ id: schema.conversations.id });
		createdConversationIds.push(conv.id);

		const messageRows: Array<{
			conversationId: string;
			role: "user" | "assistant";
			content: string;
		}> = [];
		for (let i = 0; i < opts.userTurns; i++) {
			messageRows.push({ conversationId: conv.id, role: "user", content: `user msg ${i + 1}` });
			messageRows.push({
				conversationId: conv.id,
				role: "assistant",
				content: `assistant reply ${i + 1}`,
			});
		}
		if (messageRows.length > 0) {
			await db.insert(schema.messages).values(messageRows);
		}

		return conv.id;
	}

	it("conversa elegível + judge mockado → linha persistida com dimensões e overall", async () => {
		__setJudgeImplForTests(async () => ({
			result: {
				dimensions: {
					engajamento: { score: 0.9, reasoning: "x" },
					discovery: { score: 0.8, reasoning: "x" },
					continuidade: { score: 0.85, reasoning: "x" },
					naturalidade: { score: 0.9, reasoning: "x" },
					assertividade: { score: 0.95, reasoning: "x" },
				},
				flags: {
					hallucination: false,
					missedHandoff: false,
					incompleteDiscovery: false,
					lowEngagement: false,
				},
				topIssues: [],
				topStrengths: ["bom"],
			},
			tokensInput: 4500,
			tokensOutput: 480,
			durationMs: 12,
		}));

		const convId = await createFixtureConversation({ userTurns: 4, hoursIdle: 14 });
		const out = await scoreConversation(convId);

		expect(out.skipped).toBe(false);
		if (out.skipped) return;
		expect(out.success).toBe(true);
		if (!out.success) return;
		expect(out.overallScore).toBeGreaterThan(0);

		const evals = await db.query.conversationEvaluations.findMany({
			where: eq(schema.conversationEvaluations.conversationId, convId),
		});
		expect(evals).toHaveLength(1);
		expect(evals[0].rubricVersion).toBe("v1");
		expect(evals[0].judgeModel).toBe("claude-sonnet-4-6");
		expect(evals[0].dimensions?.conversao).toBeDefined();
		expect(evals[0].error).toBeNull();
		expect(evals[0].tokensInput).toBe(4500);
	});

	it("conversa não-elegível (3 user turns) → skipped, nada persistido", async () => {
		const convId = await createFixtureConversation({ userTurns: 3, hoursIdle: 14 });
		const out = await scoreConversation(convId);
		expect(out.skipped).toBe(true);
		if (!out.skipped) return;
		expect(out.reason).toContain("< 4 requeridos");

		const evals = await db.query.conversationEvaluations.findMany({
			where: eq(schema.conversationEvaluations.conversationId, convId),
		});
		expect(evals).toHaveLength(0);
	});

	it("judge falha → linha salva com error preenchido e scores nulos", async () => {
		const { JudgeError } = await import("./judge");
		__setJudgeImplForTests(async () => {
			throw new JudgeError("network down");
		});

		const convId = await createFixtureConversation({ userTurns: 4, hoursIdle: 14 });
		const out = await scoreConversation(convId);
		expect(out.skipped).toBe(false);
		if (out.skipped) return;
		expect(out.success).toBe(false);

		const evals = await db.query.conversationEvaluations.findMany({
			where: eq(schema.conversationEvaluations.conversationId, convId),
		});
		expect(evals).toHaveLength(1);
		expect(evals[0].error).toContain("network down");
		expect(evals[0].dimensions).toBeNull();
		expect(evals[0].overallScore).toBeNull();
	});
});
