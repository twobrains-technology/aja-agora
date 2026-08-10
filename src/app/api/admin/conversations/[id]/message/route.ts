import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages, whatsappTemplates } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna } from "@/lib/admin/role-scope";
import { conversaPertenceAoAtendente, getMesaAttendantByUserId } from "@/lib/mesa/handoff";
import { sendTemplate, sendTextMessage } from "@/lib/whatsapp/api";
import { resolverDestinoWhatsApp } from "@/lib/whatsapp/destino";
import { montarComponents, primeiroNome } from "@/lib/whatsapp/template-params";
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
/**
 * A Meta recusou → o atendente precisa SABER.
 *
 * `callApi` não lança: devolve `{ error }`. Como a rota só olhava `messageId`,
 * uma recusa 400 virava `{ success: true }` com 200 — o atendente lia "contato
 * de retomada enviado" e o cliente nunca recebia nada (prod, 2026-08-10).
 */
function falhaDaMeta(bruto: string) {
	let motivo = bruto;
	try {
		motivo = (JSON.parse(bruto) as { error?: { message?: string } }).error?.message ?? bruto;
	} catch {
		// Não era JSON (timeout, rede) — o texto cru já é a explicação.
	}
	return Response.json(
		{
			error: "WhatsappSendFailed",
			message: `O WhatsApp recusou o envio: ${motivo}`,
			detail: bruto,
		},
		{ status: 502 },
	);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session, role } = await requireRole("admin", "attendant", "mesa_externa");
	if (error) return error;

	const { id: conversationId } = await params;

	// A mesa externa fala com o cliente — é o trabalho dela. Mas só com o cliente
	// DELA: sem esta checagem, trocar o id na URL mandaria WhatsApp em nome da
	// empresa pro lead de qualquer colega.
	if (isMesaExterna(role)) {
		const atendente = await getMesaAttendantByUserId(session.user.id);
		if (!atendente || !atendente.isActive) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}
		if (!(await conversaPertenceAoAtendente(conversationId, atendente.id))) {
			return Response.json(
				{ error: "Forbidden", reason: "conversa_de_outro_atendente" },
				{ status: 403 },
			);
		}
	}

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
		.select({ waId: conversations.waId, contactName: conversations.contactName })
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

	// Gravado como "62992496793" (sem DDI), o "62" vira código de país da
	// INDONÉSIA na Meta — o envio é aceito e não chega em ninguém. O resolvedor
	// prefere o wa_id de uma conversa real desse mesmo número (prod, 2026-08-10).
	const destino = await resolverDestinoWhatsApp(conv.waId);

	const windowStatus = await isWindowOpen(conversationId);

	let messageId: string | undefined;
	/** Corpo REAL do template, pra timeline mostrar o que o cliente leu. */
	let conteudoRegistrado: string | undefined;
	let sentType: "text" | "template";

	if (windowStatus.open) {
		if (!text) {
			return Response.json(
				{ error: "Validation", message: "Texto obrigatório quando a janela está aberta." },
				{ status: 400 },
			);
		}
		const result = await sendTextMessage(destino, text);
		if (result.error) return falhaDaMeta(result.error);
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
		// O corpo aprovado vem ANTES do envio: é ele que diz quantos `{{n}}` a Meta
		// espera. Mandar de menos é 400 (#132000) — foi o que recusou todos os
		// disparos de retomada em prod até aqui.
		const [tpl] = await db
			.select({ bodyPreview: whatsappTemplates.bodyPreview })
			.from(whatsappTemplates)
			.where(eq(whatsappTemplates.metaName, templateName))
			.limit(1);

		const nome = primeiroNome(conv.contactName) ?? "cliente";
		const components = montarComponents(tpl?.bodyPreview, conv.contactName);

		const result = await sendTemplate(destino, templateName, languageCode, components);
		if (result.error) return falhaDaMeta(result.error);
		messageId = result.messageId;
		sentType = "template";

		// O CLIENTE recebeu o corpo do template, não o nome dele. Gravar
		// "Template enviado: aja_agora_atendente_retomada" deixava a timeline
		// mentindo sobre o que foi dito — o atendente abria a conversa e via um
		// identificador técnico no lugar da mensagem que o cliente leu. Os `{{n}}`
		// saem resolvidos pelo mesmo motivo: o cliente leu "Oi, Kairo!".
		conteudoRegistrado =
			tpl?.bodyPreview?.trim().replace(/\{\{\s*\d+\s*\}\}/g, nome) ||
			`Template enviado: ${templateName}`;
	}

	if (messageId) {
		await db.insert(messages).values({
			conversationId,
			role: "assistant",
			content: text ?? conteudoRegistrado ?? `Template enviado: ${templateName}`,
			channel: "whatsapp",
			personaId: null, // mensagem do operador, não de persona
			// Marca o disparo automático: no histórico, template e mensagem escrita
			// à mão precisam ser distinguíveis meses depois.
			templateName: sentType === "template" ? (templateName ?? null) : null,
		});
	}

	return Response.json({ success: true, type: sentType, messageId, windowStatus });
}
