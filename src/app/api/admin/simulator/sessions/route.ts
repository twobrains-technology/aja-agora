/**
 * CRUD genérico de conversas simuladas (canal web ou whatsapp).
 *
 * - POST: cria uma nova conversation com is_simulated=true. Pra channel="whatsapp"
 *   gera waId sintético SIM-<uuid> (chave usada pelo processor real). Pra "web"
 *   só o conversationId basta.
 * - GET: lista todas conversas simuladas pra inbox compartilhada do simulador.
 *
 * Dev-only: returns 404 in production.
 */
import { desc, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversations, user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isSimulatorEnabled } from "@/lib/utils/env";

const createSchema = z.object({
	channel: z.enum(["web", "whatsapp"]),
});

const ALLOWED_CHANNEL_FILTER = ["web", "whatsapp"] as const;

export async function POST(req: NextRequest) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error, session } = await requireRole("admin");
	if (error) return error;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
	}
	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const { channel } = parsed.data;
	const waId = channel === "whatsapp" ? `SIM-${crypto.randomUUID()}` : null;

	const [created] = await db
		.insert(conversations)
		.values({
			channel,
			waId,
			isSimulated: true,
			metadata: { createdBySimUserId: session?.user?.id ?? null },
		})
		.returning({
			id: conversations.id,
			channel: conversations.channel,
			waId: conversations.waId,
			createdAt: conversations.createdAt,
		});

	return NextResponse.json(
		{
			conversationId: created.id,
			channel: created.channel,
			waId: created.waId,
			createdAt: created.createdAt,
		},
		{ status: 201 },
	);
}

export async function GET(req: NextRequest) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error, session } = await requireRole("admin");
	if (error) return error;
	const currentUserId = session?.user?.id ?? null;

	const sp = req.nextUrl.searchParams;
	const channelParam = sp.get("channel");
	const channelFilter = ALLOWED_CHANNEL_FILTER.includes(
		channelParam as (typeof ALLOWED_CHANNEL_FILTER)[number],
	)
		? (channelParam as (typeof ALLOWED_CHANNEL_FILTER)[number])
		: null;
	// Filtro "mine": só sessões que o usuário corrente criou. Default = todas.
	const onlyMine = sp.get("mine") === "true";

	const rows = await db
		.select({
			conversationId: conversations.id,
			channel: conversations.channel,
			waId: conversations.waId,
			status: conversations.status,
			contactName: conversations.contactName,
			metadata: conversations.metadata,
			createdAt: conversations.createdAt,
			updatedAt: conversations.updatedAt,
		})
		.from(conversations)
		.where(eq(conversations.isSimulated, true))
		.orderBy(desc(conversations.updatedAt));

	const byChannel = channelFilter ? rows.filter((r) => r.channel === channelFilter) : rows;
	const filtered =
		onlyMine && currentUserId
			? byChannel.filter(
					(r) =>
						(r.metadata as { createdBySimUserId?: string } | null)?.createdBySimUserId ===
						currentUserId,
				)
			: byChannel;

	// Resolve autor via metadata.createdBySimUserId, com inArray pra evitar N+1.
	const userIds = Array.from(
		new Set(
			filtered
				.map(
					(r) =>
						(r.metadata as { createdBySimUserId?: string } | null)?.createdBySimUserId ?? null,
				)
				.filter((id): id is string => Boolean(id)),
		),
	);
	const users =
		userIds.length > 0
			? await db
					.select({ id: userTable.id, name: userTable.name })
					.from(userTable)
					.where(inArray(userTable.id, userIds))
			: [];
	const usersById = new Map(users.map((u) => [u.id, u.name]));

	// lastMessagePreview: pega última mensagem de cada conversa via DISTINCT ON.
	// Em volumes baixos (dev tool) é trivial; se virar bottleneck, mover pra subquery.
	const previews =
		filtered.length > 0
			? await db.execute<{ conversation_id: string; content: string }>(sql`
				SELECT DISTINCT ON (conversation_id) conversation_id, content
				FROM messages
				WHERE conversation_id IN (${sql.join(
					filtered.map((r) => sql`${r.conversationId}`),
					sql`,`,
				)})
				ORDER BY conversation_id, created_at DESC
			`)
			: { rows: [] as Array<{ conversation_id: string; content: string }> };
	const previewRows = (previews as { rows: Array<{ conversation_id: string; content: string }> })
		.rows;
	const previewByConv = new Map(previewRows.map((p) => [p.conversation_id, p.content]));

	const items = filtered.map((r) => {
		const createdById =
			(r.metadata as { createdBySimUserId?: string } | null)?.createdBySimUserId ?? null;
		const preview = previewByConv.get(r.conversationId) ?? null;
		return {
			conversationId: r.conversationId,
			channel: r.channel,
			waId: r.waId,
			status: r.status,
			contactName: r.contactName,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
			createdBy: createdById ? { id: createdById, name: usersById.get(createdById) ?? null } : null,
			lastMessagePreview: preview ? preview.slice(0, 80) : null,
		};
	});

	return NextResponse.json({ items, currentUserId });
}
