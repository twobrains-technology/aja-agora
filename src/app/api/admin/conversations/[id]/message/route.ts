import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { globalDb } from "@/db";
import { conversations, messages } from "@/db/schema";
import { isWindowOpen } from "@/lib/whatsapp/window";
import { sendTextMessage, sendTemplate } from "@/lib/whatsapp/api";

/**
 * POST — Operador envia mensagem pelo chat do Kanban.
 *
 * Gate de segurança:
 * 1. Verifica Bearer token na Authorization header (placeholder)
 * 2. Verifica janela de 24h do WhatsApp:
 *    - Janela aberta → envia texto livre (sendTextMessage)
 *    - Janela fechada → só permite enviar template HSM (sendTemplate)
 * 3. Persiste mensagem no DB (role=assistant, channel=whatsapp, autor=operador)
 *
 * @route POST /api/admin/conversations/[id]/message
 * @body { conversationId: string, text: string? } — texto livre
 * @body { conversationId: string, templateName: string, languageCode: string } — template HSM
 */
export async function POST(
	req: NextRequest,
	{ params }: { params: { id: string } },
) {
	// ---- Gate de autenticação (Bearer token) ----
	// NOTA: Implementar com melhor-auth quando estiver disponível
	const authHeader = req.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return NextResponse.json(
			{ error: "Unauthorized", message: "Bearer token necessário" },
			{ status: 401 },
		);
	}

	try {
		const db = globalDb;
		if (!db) {
			return NextResponse.json(
				{ error: "Internal", message: "Database não inicializado" },
				{ status: 500 },
			);
		}

		// ---- Extrair corpo da requisição ----
		const body = await req.json();
		const { conversationId, text, templateName, languageCode } = body;

		// Validação básica
		if (!conversationId || (!text && !(templateName && languageCode))) {
			return NextResponse.json(
				{
					error: "Validation",
					message: "conversationId, text ou templateName+languageCode são obrigatórios",
				},
				{ status: 400 },
			);
		}

		// ---- Verificar janela de 24h (FIX-86) ----
		const windowStatus = await isWindowOpen(conversationId);

		let messageId: string | undefined;
		let sentType: "text" | "template" | "rejected" = "rejected";

		// ---- Escolher método de envio baseado na janela ----
		if (windowStatus.open) {
			// Janela aberta → texto livre
			if (!text) {
				return NextResponse.json(
					{
						error: "Validation",
						message: "Texto obrigatório quando janela está aberta",
					},
					{ status: 400 },
				);
			}

			const result = await sendTextMessage(conversationId, text);
			messageId = result.messageId;
			sentType = "text";

			console.log(`[admin-chat] Texto livre enviado (janela aberta): ${messageId}`);
		} else {
			// Janela fechada → PROIBIDO texto livre
			if (text) {
				return NextResponse.json(
					{
						error: "WindowClosed",
						message:
							"A janela de 24h do WhatsApp está fechada. Envie um template HSM para reabrir a conversa.",
						windowClosed: {
							expiresAt: windowStatus.expiresAt,
							reopenMethod: "sendTemplate",
						},
					},
					{ status: 429 },
				);
			}

			// Só template permitido
			if (!templateName || !languageCode) {
				return NextResponse.json(
					{
						error: "Validation",
						message: "templateName e languageCode obrigatórios quando janela está fechada",
					},
					{ status: 400 },
				);
			}

			const result = await sendTemplate(
				conversationId,
				templateName,
				languageCode,
				undefined, // componentes opcionais
			);
			messageId = result.messageId;
			sentType = "template";

			console.log(`[admin-chat] Template enviado (janela fechada): ${messageId}`);
		}

		// ---- Persistir mensagem no DB ----
		if (messageId) {
			const [newMessage] = await db
				.insert(messages)
				.values({
					conversationId,
					role: "assistant",
					content: text ?? `Template enviado: ${templateName}`,
					channel: "whatsapp",
					personaId: null, // Mensagem do operador (não persona)
					createdAt: new Date(),
				})
				.returning({
					id: messages.id,
					createdAt: messages.createdAt,
				});

			console.log(`[admin-chat] Persistida: ${newMessage.id}`);
		}

		return NextResponse.json({
			success: true,
			type: sentType,
			messageId,
			windowStatus,
		});
	} catch (err) {
		console.error("[admin-chat] Error sending message:", err);
		return NextResponse.json(
			{
				error: "Internal",
				message: "Erro ao enviar mensagem",
			},
			{ status: 500 },
		);
	}
}
