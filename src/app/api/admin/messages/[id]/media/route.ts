import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna } from "@/lib/admin/role-scope";
import { conversaPertenceAoAtendente, getMesaAttendantByUserId } from "@/lib/mesa/handoff";
import { getClientDocsStorageConfig, getSignedDownloadUrl } from "@/lib/storage";

/**
 * GET — abre o anexo de uma mensagem.
 *
 * O banco guarda a CHAVE do objeto; a URL é assinada aqui, no momento do
 * clique, e dura poucos minutos. Isso é o que permite o histórico envelhecer
 * sem colecionar links quebrados — e o que impede que uma URL vazada num log
 * continue valendo amanhã.
 *
 * Redireciona (302) em vez de servir os bytes: o download sai direto do S3, sem
 * passar pelo servidor da aplicação.
 *
 * @route GET /api/admin/messages/[id]/media
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session, role } = await requireRole(
		"admin",
		"attendant",
		"viewer",
		"mesa_externa",
	);
	if (error) return error;

	const { id } = await params;

	const [msg] = await db
		.select({
			conversationId: messages.conversationId,
			mediaKey: messages.mediaKey,
			mediaFilename: messages.mediaFilename,
		})
		.from(messages)
		.where(eq(messages.id, id))
		.limit(1);

	if (!msg?.mediaKey) {
		return Response.json({ error: "NotFound", message: "Anexo não encontrado" }, { status: 404 });
	}

	// A mesa externa só abre anexo de conversa dela — vale pro que ela mandou e
	// pro que o cliente mandou.
	if (isMesaExterna(role)) {
		const atendente = await getMesaAttendantByUserId(session.user.id);
		if (!atendente || !atendente.isActive) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}
		if (!(await conversaPertenceAoAtendente(msg.conversationId, atendente.id))) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}
	}

	const url = await getSignedDownloadUrl(msg.mediaKey, getClientDocsStorageConfig());
	return Response.redirect(url, 302);
}
