import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { conversationEvaluations, conversations, messages, user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";

const CHANNELS = ["web", "whatsapp"] as const;
const STATUSES = ["active", "handed_off", "closed"] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
	return Math.min(Math.floor(n), MAX_LIMIT);
}

function parseOffset(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

function parseDate(raw: string | null): Date | null {
	if (!raw) return null;
	const d = new Date(raw);
	return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const sp = req.nextUrl.searchParams;
	const limit = parseLimit(sp.get("limit"));
	const offset = parseOffset(sp.get("offset"));
	const channelParam = sp.get("channel");
	const statusParam = sp.get("status");
	const q = sp.get("q")?.trim() ?? "";
	const from = parseDate(sp.get("from"));
	const to = parseDate(sp.get("to"));

	const channel =
		channelParam && (CHANNELS as readonly string[]).includes(channelParam)
			? (channelParam as (typeof CHANNELS)[number])
			: null;
	const status =
		statusParam && (STATUSES as readonly string[]).includes(statusParam)
			? (statusParam as (typeof STATUSES)[number])
			: null;

	const conditions = [];
	if (channel) conditions.push(eq(conversations.channel, channel));
	if (status) conditions.push(eq(conversations.status, status));
	if (q) {
		const pattern = `%${q}%`;
		conditions.push(
			or(ilike(conversations.contactName, pattern), ilike(conversations.waId, pattern)),
		);
	}
	if (from) conditions.push(gte(conversations.updatedAt, from));
	if (to) {
		const endOfDay = new Date(to);
		endOfDay.setHours(23, 59, 59, 999);
		conditions.push(lte(conversations.updatedAt, endOfDay));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const messageCountSubquery = db
		.select({
			conversationId: messages.conversationId,
			count: count().as("message_count"),
		})
		.from(messages)
		.groupBy(messages.conversationId)
		.as("mc");

	// Latest eval por conversa, via DISTINCT ON (mais simples que window function no Drizzle).
	const latestEvalSubquery = db
		.select({
			conversationId: conversationEvaluations.conversationId,
			overallScore: sql<string | null>`${conversationEvaluations.overallScore}`.as(
				"latest_overall_score",
			),
			evaluatedAt: conversationEvaluations.evaluatedAt,
			rowNum:
				sql<number>`row_number() OVER (PARTITION BY ${conversationEvaluations.conversationId} ORDER BY ${conversationEvaluations.evaluatedAt} DESC)`.as(
					"row_num",
				),
		})
		.from(conversationEvaluations)
		.as("le");

	const rowsPromise = db
		.select({
			id: conversations.id,
			contactName: conversations.contactName,
			waId: conversations.waId,
			channel: conversations.channel,
			status: conversations.status,
			metadata: conversations.metadata,
			handedOffUserId: conversations.handedOffUserId,
			handedOffUserName: userTable.name,
			messageCount: sql<number>`COALESCE(${messageCountSubquery.count}, 0)`.as("msg_count"),
			latestEvalScore: latestEvalSubquery.overallScore,
			createdAt: conversations.createdAt,
			updatedAt: conversations.updatedAt,
		})
		.from(conversations)
		.leftJoin(userTable, eq(conversations.handedOffUserId, userTable.id))
		.leftJoin(messageCountSubquery, eq(messageCountSubquery.conversationId, conversations.id))
		.leftJoin(
			latestEvalSubquery,
			and(
				eq(latestEvalSubquery.conversationId, conversations.id),
				eq(latestEvalSubquery.rowNum, 1),
			),
		)
		.where(whereClause)
		.orderBy(desc(conversations.updatedAt))
		.limit(limit)
		.offset(offset);

	const totalPromise = db.select({ value: count() }).from(conversations).where(whereClause);

	const [rows, totalRows] = await Promise.all([rowsPromise, totalPromise]);
	const total = totalRows[0]?.value ?? 0;

	const items = rows.map((r) => {
		const meta = (r.metadata ?? {}) as Record<string, unknown>;
		const currentCategory =
			typeof meta.currentCategory === "string" ? (meta.currentCategory as string) : null;
		return {
			id: r.id,
			contactName: r.contactName,
			waId: r.waId,
			channel: r.channel,
			status: r.status,
			currentCategory,
			handedOffUser: r.handedOffUserId
				? { id: r.handedOffUserId, name: r.handedOffUserName }
				: null,
			messageCount: Number(r.messageCount ?? 0),
			latestEvalScore: r.latestEvalScore !== null ? Number(r.latestEvalScore) : null,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
		};
	});

	return Response.json({ items, total, limit, offset });
}
