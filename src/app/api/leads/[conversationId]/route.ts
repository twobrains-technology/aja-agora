import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { isUuid } from "@/lib/utils/id";

/**
 * Retorna estado atual de captura de lead pra pré-preencher o form
 * fallback. Usa contactName da conversation se ainda não existe lead.
 * Campos vazios voltam como string (não null) pra simplificar bind
 * do react-hook-form.
 */
export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ conversationId: string }> },
) {
	const { conversationId } = await params;
	if (!isUuid(conversationId)) {
		return Response.json({ error: "Invalid conversationId" }, { status: 400 });
	}

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	if (!conv) {
		return Response.json({ error: "Conversation not found" }, { status: 404 });
	}

	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
	});

	return Response.json({
		name: lead?.name ?? conv.contactName ?? "",
		phone: lead?.phone ?? "",
		email: lead?.email ?? "",
	});
}
