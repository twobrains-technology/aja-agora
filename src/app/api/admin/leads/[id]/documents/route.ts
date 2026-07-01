import { requireRole } from "@/lib/admin/require-role";
import { type ClientDocumentRow, listClientDocuments } from "@/lib/documents/client-documents";

// FIX-83: aba "Documentos" no lead-detail — lista os client_documents do lead.
// DTO enxuto: nunca expõe s3Bucket/s3Key (regra dura de PII — download só via
// endpoint pré-assinado, ver [id]/download).
function toDocDTO(row: ClientDocumentRow) {
	return {
		id: row.id,
		slot: row.slot,
		filename: row.filename,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes,
		status: row.status,
		dispatchStatus: row.dispatchStatus,
		dispatchTarget: row.dispatchTarget,
		createdAt: row.createdAt,
	};
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	// Mesma política de leitura das outras abas do lead-detail (conversa/insights).
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id } = await params;
	const docs = await listClientDocuments({ leadId: id });
	return Response.json({ documents: docs.map(toDocDTO) });
}
