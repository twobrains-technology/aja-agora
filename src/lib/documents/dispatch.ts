// Despacho do documento do cliente (FIX-84) — consumidor BEST-EFFORT do ativo
// guardado em client_documents (FIX-82). Nunca um bloqueador: falha de envio
// NUNCA perde nem apaga o documento já guardado no nosso S3 — só marca
// dispatchStatus="failed" e segue acessível pro operador no Kanban (FIX-83).
//
// Contrato exportado — consumido pelo bloco-c (fechamento Trilho B) com
// target="bevi_b". Design: docs/superpowers/specs/2026-06-28-gestao-documentos-cliente-design.md.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientDocuments } from "@/db/schema";
import { uploadContractDocument } from "@/lib/bevi/fulfillment";
import { getClientDocumentFile } from "./client-documents";

export type ClientDocumentDispatchTarget = "bevi_a" | "bevi_b" | "mesa";
export type ClientDocumentDispatchStatus = "pending" | "sent" | "failed" | "manual";

export interface DispatchClientDocumentResult {
	documentId: string;
	dispatchStatus: ClientDocumentDispatchStatus;
	error?: string;
}

async function markDispatch(
	documentId: string,
	dispatchStatus: ClientDocumentDispatchStatus,
	target: ClientDocumentDispatchTarget,
): Promise<void> {
	await db
		.update(clientDocuments)
		.set({
			dispatchStatus,
			dispatchTarget: target,
			// dispatchedAt marca quando o documento efetivamente SAIU daqui —
			// pending/failed ainda não saíram (failed pode ser reprocessado depois).
			...(dispatchStatus === "sent" || dispatchStatus === "manual"
				? { dispatchedAt: new Date() }
				: {}),
		})
		.where(eq(clientDocuments.id, documentId));
}

export async function dispatchClientDocument(
	documentId: string,
	target: ClientDocumentDispatchTarget,
): Promise<DispatchClientDocumentResult> {
	if (target === "mesa") {
		// Mesa manual: o operador assume pelo Kanban — não há envio automatizado.
		await markDispatch(documentId, "manual", target);
		return { documentId, dispatchStatus: "manual" };
	}

	if (target === "bevi_b") {
		// TODO(bevi_b): validar step de doc do self-contract ao vivo (portal CONEXIA
		// do Trilho B) antes de implementar o envio real — PENDENTE-KAIRO. Por ora
		// fica pending (não perde o doc; não é enviado ainda).
		await markDispatch(documentId, "pending", target);
		return { documentId, dispatchStatus: "pending" };
	}

	// Documento inexistente é erro do CHAMADOR (documentId errado) — não é o tipo
	// de falha best-effort que este contrato absorve; propaga (fail fast).
	const { doc, bytes } = await getClientDocumentFile(documentId);

	// bevi_a: reusa o fluxo de upload já validado (fulfillment.ts → ProposalGateway
	// → ConexiaDocsClient) em vez de reimplementar a resolução de link/gateway.
	try {
		const { ok, fallbackLink } = await uploadContractDocument(doc.conversationId, {
			slot: doc.slot,
			file: bytes,
			filename: doc.filename,
			mimeType: doc.mimeType,
		});
		if (!ok) {
			await markDispatch(documentId, "failed", target);
			return {
				documentId,
				dispatchStatus: "failed",
				error: fallbackLink
					? `upload automatizado falhou — link manual: ${fallbackLink}`
					: "falha no upload",
			};
		}
		await markDispatch(documentId, "sent", target);
		return { documentId, dispatchStatus: "sent" };
	} catch (err) {
		const message = err instanceof Error ? err.message : "falha no despacho";
		await markDispatch(documentId, "failed", target);
		return { documentId, dispatchStatus: "failed", error: message };
	}
}
