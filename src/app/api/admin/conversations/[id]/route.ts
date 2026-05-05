import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id } = await params;

	if (!UUID_RE.test(id)) {
		return Response.json({ error: "Invalid conversation ID format" }, { status: 400 });
	}

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, id),
		with: {
			messages: {
				orderBy: (m, { asc }) => [asc(m.createdAt)],
				with: {
					artifacts: true,
				},
			},
			handedOffUser: {
				columns: { id: true, name: true, phone: true },
			},
			leads: true,
		},
	});

	if (!conv) {
		return Response.json({ error: "Conversation not found" }, { status: 404 });
	}

	const meta = (conv.metadata ?? {}) as Record<string, unknown>;
	const currentCategory =
		typeof meta.currentCategory === "string" ? (meta.currentCategory as string) : null;

	return Response.json({
		conversation: {
			id: conv.id,
			contactName: conv.contactName,
			waId: conv.waId,
			channel: conv.channel,
			status: conv.status,
			currentCategory,
			metadata: conv.metadata,
			handedOffUser: conv.handedOffUser
				? {
						id: conv.handedOffUser.id,
						name: conv.handedOffUser.name,
						phone: conv.handedOffUser.phone,
					}
				: null,
			createdAt: conv.createdAt,
			updatedAt: conv.updatedAt,
		},
		messages: conv.messages,
		lead: conv.leads?.[0] ?? null,
	});
}
