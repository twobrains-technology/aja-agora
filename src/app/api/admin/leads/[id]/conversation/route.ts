import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id: leadId } = await params;

	if (!UUID_RE.test(leadId)) {
		return Response.json({ error: "Invalid lead ID format" }, { status: 400 });
	}

	const lead = await db.query.leads.findFirst({
		where: eq(leads.id, leadId),
		with: {
			conversation: {
				with: {
					messages: {
						orderBy: (messages, { asc }) => [asc(messages.createdAt)],
						with: {
							artifacts: true,
						},
					},
				},
			},
		},
	});

	if (!lead) {
		return Response.json({ error: "Lead not found" }, { status: 404 });
	}

	if (!lead.conversation) {
		return Response.json({ error: "No conversation found" }, { status: 404 });
	}

	return Response.json({ messages: lead.conversation.messages });
}
