import { createGatewayAnthropic } from "@/lib/llm/gateway-anthropic";
import { generateText } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leadInsights } from "@/db/schema";
import { buildInsightPrompt, INSIGHTS_SYSTEM_PROMPT } from "@/lib/admin/insights-prompt";
import { requireRole } from "@/lib/admin/require-role";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface InsightsPayload {
	intent: string;
	budget: { monthly: number | null; total: number | null; notes: string };
	objections: string[];
	next_action: string;
}

function parseCachedInsights(
	rows: Array<{ insightType: string; content: string }>,
): InsightsPayload {
	const map: Record<string, string> = {};
	for (const row of rows) {
		map[row.insightType] = row.content;
	}
	return {
		intent: map.intent ? JSON.parse(map.intent) : "",
		budget: map.budget ? JSON.parse(map.budget) : { monthly: null, total: null, notes: "" },
		objections: map.objections ? JSON.parse(map.objections) : [],
		next_action: map.next_action ? JSON.parse(map.next_action) : "",
	};
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id: conversationId } = await params;

	if (!UUID_RE.test(conversationId)) {
		return Response.json({ error: "Invalid conversation ID format" }, { status: 400 });
	}

	const cacheFilter = and(
		eq(leadInsights.conversationId, conversationId),
		isNull(leadInsights.leadId),
	);

	const cached = await db.query.leadInsights.findMany({ where: cacheFilter });

	if (cached.length > 0) {
		const mostRecent = cached.reduce((latest, row) =>
			row.generatedAt > latest.generatedAt ? row : latest,
		);
		const age = Date.now() - mostRecent.generatedAt.getTime();
		if (age < CACHE_TTL_MS) {
			return Response.json({
				insights: parseCachedInsights(cached),
				source: "cache",
			});
		}
	}

	const conversation = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		with: {
			messages: {
				orderBy: (messages, { asc }) => [asc(messages.createdAt)],
			},
		},
	});

	if (!conversation || conversation.messages.length === 0) {
		return Response.json({ error: "Nenhuma mensagem para analisar" }, { status: 400 });
	}

	const anthropic = createGatewayAnthropic();
	let parsed: InsightsPayload;

	try {
		const { text } = await generateText({
			model: anthropic("claude-haiku-4-5-20251001"),
			system: INSIGHTS_SYSTEM_PROMPT,
			prompt: buildInsightPrompt(conversation.messages),
		});

		const cleaned = text
			.replace(/^```(?:json)?\s*\n?/i, "")
			.replace(/\n?```\s*$/i, "")
			.trim();

		parsed = JSON.parse(cleaned);
	} catch (err) {
		console.error("[conversation-insights] Failed to generate insights:", err);
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		return Response.json({ error: `Falha ao processar insights: ${message}` }, { status: 500 });
	}

	await db.delete(leadInsights).where(cacheFilter);

	const now = new Date();
	const modelName = "claude-haiku-4-5-20251001";

	await db.insert(leadInsights).values([
		{
			conversationId,
			insightType: "intent" as const,
			content: JSON.stringify(parsed.intent),
			model: modelName,
			generatedAt: now,
		},
		{
			conversationId,
			insightType: "budget" as const,
			content: JSON.stringify(parsed.budget),
			model: modelName,
			generatedAt: now,
		},
		{
			conversationId,
			insightType: "objections" as const,
			content: JSON.stringify(parsed.objections),
			model: modelName,
			generatedAt: now,
		},
		{
			conversationId,
			insightType: "next_action" as const,
			content: JSON.stringify(parsed.next_action),
			model: modelName,
			generatedAt: now,
		},
	]);

	return Response.json({ insights: parsed, source: "generated" });
}
