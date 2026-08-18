// FIX-122 (D13) — Passo 6 (KYC) no WhatsApp: handler de mídia INBOUND.
//
// A copy `documentUploadToWhatsApp` convida "me manda a foto do RG/CNH aqui
// mesmo", mas o webhook ignorava a imagem (caía no `default` do switch com
// "Unhandled type: image") — a foto era dropada em silêncio e o cliente ficava
// sem resposta. Aqui a promessa é cumprida.
//
// REGRA de aceite = PARIDADE com o web (docs/correcoes/decisions/
// 2026-07-01-bloco-entrada-welcome-upload.md): a foto vai pro MESMO destino do
// web (`uploadContractDocument`), sem redirect e sem staging próprio. A
// persistência nossa em S3 (D12) é escopo do bloco-a e deve valer pros DOIS
// canais dentro de `uploadContractDocument` — não gambiarrar só aqui.
//
// Deps injetáveis (default = real) pra os testes exercitarem a trajetória sem
// tocar DB/HTTP — mesmo padrão de `uploadContractDocument(…, gateway)`.

import type { DocumentSlot } from "@/lib/adapters/proposal-gateway";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { type UploadContractDocInput, uploadContractDocument } from "@/lib/bevi/fulfillment";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { downloadMedia, sendTextMessage } from "./api";
import { conversaDoNumero } from "./destino";
import {
	documentDownloadFailedToWhatsApp,
	documentNoConversationToWhatsApp,
	documentNotReadyToWhatsApp,
	documentReceivedToWhatsApp,
	documentUploadFallbackToWhatsApp,
} from "./formatter";

// Ordem canônica dos slots no WhatsApp — PARIDADE com o web, que coleta
// frente → verso (o comprovante_endereco não é pedido no componente atual).
const SLOT_ORDER: DocumentSlot[] = ["identidade_frente", "identidade_verso"];

/** Próximo slot a preencher dada a lista já enviada, ou null se completo. */
export function nextDocumentSlot(sent: DocumentSlot[]): DocumentSlot | null {
	return SLOT_ORDER.find((s) => !sent.includes(s)) ?? null;
}

const EXT_BY_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"application/pdf": "pdf",
};

function defaultFilename(slot: DocumentSlot, mimeType: string): string {
	return `${slot}.${EXT_BY_MIME[mimeType] ?? "bin"}`;
}

export interface DocumentInboundInput {
	/** waId do cliente (from do webhook). */
	from: string;
	/** id da mídia na Graph API (message.image.id / message.document.id). */
	mediaId: string;
	/** filename do anexo, quando type="document" (image não traz). */
	filename?: string;
}

export interface DocumentInboundDeps {
	loadConversation: (waId: string) => Promise<{ id: string; meta: ConversationMetadata } | null>;
	persist: (conversationId: string, meta: ConversationMetadata) => Promise<void>;
	download: (mediaId: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;
	upload: (
		conversationId: string,
		input: UploadContractDocInput,
	) => Promise<{ ok: boolean; fallbackLink?: string }>;
	reply: (to: string, text: string) => Promise<unknown>;
}

/** Exportado para quem já baixou a mídia poder reaproveitar o download —
 * `midia-do-cliente` injeta o `download` e evita uma segunda ida à Graph API. */
export const defaultDocumentInboundDeps: DocumentInboundDeps = {
	// Pela chave canônica do telefone, NUNCA por igualdade de string: o wa_id que
	// a Meta entrega para número BR não traz o nono dígito, e a busca exata dava
	// "não há conversa" para cliente que estava conversando (prod, 2026-08-18).
	loadConversation: async (waId) => {
		const conv = await conversaDoNumero(waId);
		return conv ? { id: conv.id, meta: metaOf(conv) } : null;
	},
	persist: persistMeta,
	download: downloadMedia,
	upload: (conversationId, input) => uploadContractDocument(conversationId, input),
	reply: sendTextMessage,
};

/**
 * Recebe a foto do documento no WhatsApp, baixa da Graph API e sobe pro MESMO
 * destino do web (`uploadContractDocument`). Best-effort e SEMPRE responde ao
 * cliente — o bug original era o drop silencioso.
 */
export async function handleDocumentInbound(
	input: DocumentInboundInput,
	deps: DocumentInboundDeps = defaultDocumentInboundDeps,
): Promise<void> {
	const { from, mediaId, filename } = input;

	const conv = await deps.loadConversation(from);
	if (!conv) {
		await deps.reply(from, documentNoConversationToWhatsApp().text ?? "");
		return;
	}

	const sent = [...(conv.meta.documentSlotsSent ?? [])];
	const slot = nextDocumentSlot(sent);
	if (!slot) {
		// Já recebeu tudo — idempotente: confirma sem re-subir a mesma coisa.
		await deps.reply(from, documentReceivedToWhatsApp(true).text ?? "");
		return;
	}

	let media: { bytes: Uint8Array; mimeType: string };
	try {
		media = await deps.download(mediaId);
	} catch (err) {
		console.error("[whatsapp] downloadMedia falhou:", err);
		await deps.reply(from, documentDownloadFailedToWhatsApp().text ?? "");
		return;
	}

	let result: { ok: boolean; fallbackLink?: string };
	try {
		result = await deps.upload(conv.id, {
			slot,
			file: media.bytes,
			filename: filename ?? defaultFilename(slot, media.mimeType),
			mimeType: media.mimeType,
		});
	} catch (err) {
		// uploadContractDocument lança quando ainda não há links/proposta em
		// 'documentos' (foto fora de ordem). Acolhe sem prometer nada.
		console.error("[whatsapp] uploadContractDocument falhou:", err);
		await deps.reply(from, documentNotReadyToWhatsApp().text ?? "");
		return;
	}

	if (!result.ok) {
		await deps.reply(from, documentUploadFallbackToWhatsApp(result.fallbackLink ?? "").text ?? "");
		return;
	}

	const nextSent = [...sent, slot];
	await deps.persist(conv.id, { ...conv.meta, documentSlotsSent: nextSent });
	const allDone = nextDocumentSlot(nextSent) === null;
	await deps.reply(from, documentReceivedToWhatsApp(allDone).text ?? "");
}
