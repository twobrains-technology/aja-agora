// Registra no HISTÓRICO da conversa a mídia que o cliente manda.
//
// Isto é ortogonal ao `document-inbound.ts`: lá a foto do RG é consumida pelo
// KYC (vira slot de documento na proposta) e some da vista; aqui ela vira uma
// mensagem como outra qualquer, pra que o atendente ABRA a conversa e veja o que
// o cliente enviou. Antes, quem olhava o painel via um buraco: o cliente mandava
// um comprovante e a timeline não registrava nada.
//
// Os dois convivem de propósito — um não substitui o outro, e a mesma imagem
// pode legitimamente virar slot de KYC E linha do histórico.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { getClientDocsStorageConfig, putObject } from "@/lib/storage";
import { downloadMedia } from "./api";
import { type TipoDeMidia, tipoDeMidia } from "./media-kind";

const EXTENSAO_POR_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"application/pdf": "pdf",
	"audio/ogg": "ogg",
	"audio/mpeg": "mp3",
	"audio/mp4": "m4a",
	"audio/amr": "amr",
};

/** O que a timeline mostra quando o anexo veio sem legenda. */
const DESCRICAO: Record<TipoDeMidia, string> = {
	image: "Imagem recebida",
	document: "Documento recebido",
	audio: "Áudio recebido",
};

export interface MidiaRecebida {
	/** waId do cliente (o `from` do webhook). */
	from: string;
	/** id da mídia na Graph API. */
	mediaId: string;
	/** Nome original, quando o WhatsApp manda (documento tem; imagem não). */
	filename?: string;
	/** Legenda que o cliente digitou junto do anexo. */
	caption?: string;
}

/**
 * Baixa a mídia da Meta, guarda no S3 e grava a mensagem.
 *
 * Best-effort de propósito, igual ao resto do webhook: se o download ou o
 * upload falhar, isso NÃO pode derrubar o turno do cliente nem impedir o 200
 * que a Meta espera — no pior caso o histórico fica sem o anexo, que é bem
 * menos grave do que a conversa travar.
 */
export async function registrarMidiaRecebida(input: MidiaRecebida): Promise<void> {
	const { from, mediaId, filename, caption } = input;

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.waId, from),
	});
	if (!conv) {
		console.warn("[media-inbound] mídia sem conversa correspondente — ignorada");
		return;
	}

	let media: { bytes: Uint8Array; mimeType: string };
	try {
		media = await downloadMedia(mediaId);
	} catch (err) {
		console.error("[media-inbound] download falhou:", err);
		return;
	}

	const tipo = tipoDeMidia(media.mimeType) ?? "document";
	const extensao = EXTENSAO_POR_MIME[media.mimeType] ?? "bin";
	const key = `conversas/${conv.id}/recebidos/${crypto.randomUUID()}.${extensao}`;

	try {
		await putObject(key, media.bytes, media.mimeType, getClientDocsStorageConfig());
	} catch (err) {
		console.error("[media-inbound] upload pro S3 falhou:", err);
		return;
	}

	await db.insert(messages).values({
		conversationId: conv.id,
		role: "user",
		content: caption?.trim() || DESCRICAO[tipo],
		channel: "whatsapp",
		mediaKey: key,
		mediaType: tipo,
		mediaMimeType: media.mimeType,
		mediaFilename: filename ?? null,
	});

	console.log(`[media-inbound] ${tipo} de ${conv.id} registrado no histórico`);
}
