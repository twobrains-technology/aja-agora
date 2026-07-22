import { requireRole } from "@/lib/admin/require-role";
import {
	getClientDocumentDownloadUrl,
	recordClientDocumentDownload,
} from "@/lib/documents/client-documents";

// FIX-83: download de documento de cliente (PII de identidade) — regra dura:
// SÓ via URL pré-assinada de curta expiração, atrás de auth de ADMIN (não
// viewer/attendant — mais restrito que a listagem), com audit de quem baixou.
// Nunca expõe s3Bucket/s3Key ao chamador.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error, session } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;
	const url = await getClientDocumentDownloadUrl(id);
	if (!url) {
		return Response.json({ error: "Documento não encontrado" }, { status: 404 });
	}

	await recordClientDocumentDownload(id, session.user.id);

	return Response.json({ url });
}
