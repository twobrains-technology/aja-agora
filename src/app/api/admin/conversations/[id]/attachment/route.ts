import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna } from "@/lib/admin/role-scope";
import { conversaPertenceAoAtendente, getMesaAttendantByUserId } from "@/lib/mesa/handoff";
import { getClientDocsStorageConfig, getSignedDownloadUrl, putObject } from "@/lib/storage";
import { sendAudioMessage, sendDocumentMessage, sendImageMessage } from "@/lib/whatsapp/api";
import { validarAnexo } from "@/lib/whatsapp/media-kind";
import { isWindowOpen } from "@/lib/whatsapp/window";

/**
 * A Meta BUSCA o arquivo na URL que a gente manda — ela não recebe os bytes.
 * 5 minutos (o default de PII) é apertado pra um documento grande sendo baixado
 * do outro lado; 15 dá folga sem virar link perene.
 */
const EXPIRACAO_PARA_A_META_SEGUNDOS = 15 * 60;

/**
 * POST — envia um ANEXO (imagem, documento ou áudio) do painel para o cliente.
 *
 * Corpo `multipart/form-data`: `file` (obrigatório) e `caption` (opcional).
 *
 * O arquivo vai pro bucket de documentos de cliente (o mesmo que já guarda PII
 * de identidade, com KMS em prod) e o que fica no banco é a CHAVE — nunca a URL
 * assinada, que expiraria e deixaria o histórico com anexo quebrado.
 *
 * @route POST /api/admin/conversations/[id]/attachment  (id = conversationId)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session, role } = await requireRole("admin", "attendant", "mesa_externa");
	if (error) return error;

	const { id: conversationId } = await params;

	// Mesmo porteiro do envio de texto: a mesa externa só fala com o cliente dela.
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

	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return Response.json(
			{ error: "Validation", message: "Envie o arquivo como multipart/form-data." },
			{ status: 400 },
		);
	}

	const file = form.get("file");
	if (!(file instanceof File)) {
		return Response.json(
			{ error: "Validation", message: "Nenhum arquivo recebido no campo `file`." },
			{ status: 400 },
		);
	}
	const caption = (form.get("caption") as string | null)?.trim() || undefined;

	// Valida ANTES do upload: não faz sentido gastar S3 com algo que a Meta recusa.
	const validacao = validarAnexo({
		mimeType: file.type,
		tamanho: file.size,
		nome: file.name,
	});
	if (!validacao.ok) {
		return Response.json({ error: "Validation", message: validacao.motivo }, { status: 400 });
	}
	const tipo = validacao.tipo;

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
				message: "Este cliente não tem WhatsApp vinculado — não dá para enviar anexo por aqui.",
			},
			{ status: 422 },
		);
	}

	// Janela de 24h: a Meta não deixa mandar mídia fora dela, e template com
	// anexo exige cabeçalho aprovado — fora do escopo. Melhor recusar claro do
	// que deixar a Meta recusar com um erro que o atendente não entende.
	const janela = await isWindowOpen(conversationId);
	if (!janela.open) {
		return Response.json(
			{
				error: "WindowClosed",
				message:
					"A janela de 24h está fechada. Reabra a conversa com um template antes de enviar o anexo.",
				windowClosed: { expiresAt: janela.expiresAt, reopenMethod: "sendTemplate" },
			},
			{ status: 429 },
		);
	}

	const cfg = getClientDocsStorageConfig();
	const extensao = file.name.includes(".") ? file.name.split(".").pop() : undefined;
	const key = `conversas/${conversationId}/${crypto.randomUUID()}${extensao ? `.${extensao}` : ""}`;

	try {
		await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type, cfg);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		console.error("[conversations/attachment] upload falhou:", message);
		return Response.json(
			{ error: "UploadFailed", message: "Não foi possível guardar o arquivo. Tente de novo." },
			{ status: 502 },
		);
	}

	const link = await getSignedDownloadUrl(key, cfg, EXPIRACAO_PARA_A_META_SEGUNDOS);

	let messageId: string | undefined;
	try {
		if (tipo === "image") {
			({ messageId } = await sendImageMessage(conv.waId, link, caption));
		} else if (tipo === "audio") {
			({ messageId } = await sendAudioMessage(conv.waId, link));
		} else {
			({ messageId } = await sendDocumentMessage(conv.waId, link, file.name, caption));
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : "Erro desconhecido";
		console.error("[conversations/attachment] envio falhou:", message);
		return Response.json(
			{ error: "SendFailed", message: `O WhatsApp recusou o anexo: ${message}` },
			{ status: 502 },
		);
	}

	// O histórico guarda a CHAVE. Quem for exibir assina na hora.
	await db.insert(messages).values({
		conversationId,
		role: "assistant",
		content: caption ?? file.name,
		channel: "whatsapp",
		personaId: null,
		mediaKey: key,
		mediaType: tipo,
		mediaMimeType: file.type,
		mediaFilename: file.name,
	});

	return Response.json({ success: true, type: tipo, messageId, filename: file.name });
}
