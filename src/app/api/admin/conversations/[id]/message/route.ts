import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { sendTemplate, sendTextMessage } from "@/lib/whatsapp/api";
import { isWindowOpen } from "@/lib/whatsapp/window";

/**
 * POST — Operador envia mensagem pelo chat do Kanban (FIX-87).
 *
 * Auth: sessão de admin OU atendente (cookie, via requireRole) — igual às demais
 * rotas /api/admin. (Antes era um placeholder que aceitava qualquer Bearer e que o
 * componente nem mandava → 401 sempre.)
 *
 * Roteamento: o destinatário é o NÚMERO de WhatsApp do cliente (conversations.waId),
 * resolvido a partir do id da conversa na URL. (Antes mandava o UUID da conversa como
 * telefone.) Janela de 24h decide texto livre × template HSM.
 *
 * @route POST /api/admin/conversations/[id]/message  (id = conversationId)
 * @body { text: string } — texto livre (janela aberta)
 * @body { templateName: string, languageCode: string } — template HSM (janela fechada)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "attendant");
	if (error) return error;

	const { id: conversationId } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Validation", message: "JSON inválido" }, { status: 400 });
	}

	const { text, templateName, languageCode } = (body ?? {}) as {
		text?: string;
		templateName?: string;
		languageCode?: string;
	};

	if (!text && !(templateName && languageCode)) {
		return Response.json(
			{
				error: "Validation",
				message:
					"Informe `text` (janela aberta) ou `templateName` + `languageCode` (template HSM).",
			},
			{ status: 400 },
		);
	}

	// O destino do WhatsApp é o telefone do cliente, não o id da conversa.
	const [conv] = await db
		.select({ waId: conversations.waId })
		.from(conversations)
		.where(eq(conversations.id, conversationId))
		.limit(1);

	if (!conv) {
		return Response.json(
			{ error: "NotFound", message: "Conversa não encontrada" },
			{ status: 404 },
		);
	}
	if (!conv.waId) {
		return Response.json(
			{
				error: "NoWhatsapp",
				message: "Este cliente não tem WhatsApp vinculado — não dá para enviar por aqui.",
			},
			{ status: 422 },
		);
	}

	const windowStatus = await isWindowOpen(conversationId);

	let messageId: string | undefined;
	let sentType: "text" | "template";

	if (windowStatus.open) {
		if (!text) {
			return Response.json(
				{ error: "Validation", message: "Texto obrigatório quando a janela está aberta." },
				{ status: 400 },
			);
		}
		const result = await sendTextMessage(conv.waId, text);
		messageId = result.messageId;
		sentType = "text";
	} else {
		// Janela fechada → texto livre é proibido pela Meta; só template HSM reabre.
		if (text) {
			return Response.json(
				{
					error: "WindowClosed",
					message:
						"A janela de 24h do WhatsApp está fechada. Envie um template HSM para reabrir a conversa.",
					windowClosed: { expiresAt: windowStatus.expiresAt, reopenMethod: "sendTemplate" },
				},
				{ status: 429 },
			);
		}
		if (!templateName || !languageCode) {
			return Response.json(
				{
					error: "Validation",
					message: "templateName e languageCode são obrigatórios quando a janela está fechada.",
				},
				{ status: 400 },
			);
		}
		const result = await sendTemplate(conv.waId, templateName, languageCode);
		messageId = result.messageId;
		sentType = "template";
	}

	if (messageId) {
		await db.insert(messages).values({
			conversationId,
			role: "assistant",
			content: text ?? `Template enviado: ${templateName}`,
			channel: "whatsapp",
			personaId: null, // mensagem do operador, não de persona
		});
	}

	return Response.json({ success: true, type: sentType, messageId, windowStatus });
}
