// Documentos do cliente (S3 nosso = fonte da verdade) — FIX-82/83.
//
// O documento do cliente (RG/CNH/comprovante) é um ATIVO NOSSO, guardado no
// bucket dedicado ANTES de qualquer tentativa de envio à Bevi/mesa (dispatch,
// ver dispatch.ts). Falha de despacho NUNCA perde nem bloqueia o documento
// guardado aqui — é sempre a fonte da verdade pro operador no Kanban.
//
// Design: docs/superpowers/specs/2026-06-28-gestao-documentos-cliente-design.md.

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientDocumentDownloads, clientDocuments, leads } from "@/db/schema";
import {
	getClientDocsStorageConfig,
	getObject,
	getSignedDownloadUrl,
	putObject,
} from "@/lib/storage";

export type ClientDocumentSlot = "identidade_frente" | "identidade_verso" | "comprovante_endereco";
export type ClientDocumentRow = typeof clientDocuments.$inferSelect;

export interface StoreClientDocumentInput {
	conversationId: string;
	slot: ClientDocumentSlot;
	file: Uint8Array | Buffer;
	filename: string;
	mimeType: string;
}

function extFromFilename(filename: string): string {
	const match = filename.match(/\.([a-zA-Z0-9]+)$/);
	return match ? match[1].toLowerCase() : "bin";
}

/** Grava no bucket dedicado (SSE-KMS) + registra o vínculo lead/contato. É AQUI
 * que a coleta termina do ponto de vista do cliente — o despacho (dispatch.ts)
 * é um passo SEGUINTE e best-effort. */
export async function storeClientDocument(
	input: StoreClientDocumentInput,
): Promise<{ documentId: string }> {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, input.conversationId),
	});

	const cfg = getClientDocsStorageConfig();
	const key = `clients/${lead?.id ?? input.conversationId}/${input.slot}/${randomUUID()}.${extFromFilename(input.filename)}`;
	const bytes = input.file instanceof Uint8Array ? input.file : new Uint8Array(input.file);
	await putObject(key, bytes, input.mimeType, cfg);

	const [row] = await db
		.insert(clientDocuments)
		.values({
			conversationId: input.conversationId,
			leadId: lead?.id ?? null,
			contactId: lead?.contactId ?? null,
			slot: input.slot,
			s3Bucket: cfg.bucket,
			s3Key: key,
			filename: input.filename,
			mimeType: input.mimeType,
			sizeBytes: bytes.byteLength,
		})
		.returning({ id: clientDocuments.id });

	return { documentId: row.id };
}

/** Lista os documentos do lead (Kanban) ou da conversa, mais recentes primeiro. */
export async function listClientDocuments(
	params: { leadId: string } | { conversationId: string },
): Promise<ClientDocumentRow[]> {
	if ("leadId" in params) {
		return db
			.select()
			.from(clientDocuments)
			.where(eq(clientDocuments.leadId, params.leadId))
			.orderBy(desc(clientDocuments.createdAt));
	}
	return db
		.select()
		.from(clientDocuments)
		.where(eq(clientDocuments.conversationId, params.conversationId))
		.orderBy(desc(clientDocuments.createdAt));
}

export async function getClientDocumentById(documentId: string): Promise<ClientDocumentRow | null> {
	const [row] = await db.select().from(clientDocuments).where(eq(clientDocuments.id, documentId));
	return row ?? null;
}

/** URL pré-assinada de curta expiração pro endpoint admin de download — nunca
 * expõe s3Bucket/s3Key ao chamador. `null` se o documento não existe. */
export async function getClientDocumentDownloadUrl(documentId: string): Promise<string | null> {
	const doc = await getClientDocumentById(documentId);
	if (!doc) return null;
	const cfg = { ...getClientDocsStorageConfig(), bucket: doc.s3Bucket };
	return getSignedDownloadUrl(doc.s3Key, cfg);
}

/** Audit trail (FIX-83, regra dura de PII): registra quem baixou e quando. */
export async function recordClientDocumentDownload(
	documentId: string,
	downloadedBy: string,
): Promise<void> {
	await db.insert(clientDocumentDownloads).values({ clientDocumentId: documentId, downloadedBy });
}

/** Lê o binário do documento (bucket de cliente) — usado pelo despacho (FIX-84). */
export async function getClientDocumentFile(
	documentId: string,
): Promise<{ doc: ClientDocumentRow; bytes: Uint8Array }> {
	const doc = await getClientDocumentById(documentId);
	if (!doc) throw new Error(`getClientDocumentFile: documento "${documentId}" não encontrado.`);
	const cfg = { ...getClientDocsStorageConfig(), bucket: doc.s3Bucket };
	const bytes = await getObject(doc.s3Key, cfg);
	return { doc, bytes };
}
