import { requireRole } from "@/lib/admin/require-role";
import { getProposalPdfDownloadUrl } from "@/lib/proposal/store";

// Download da PROPOSTA em PDF (co-branded) anexada ao card do cliente. Diferente
// do RG/CNH (PII de identidade, admin-only): a proposta faz parte do atendimento
// que o atendente da mesa conduz — mesma política de leitura do lead-detail
// (admin/viewer/attendant). Nunca expõe s3Bucket/s3Key: só a URL pré-assinada
// curta, e só se o objeto existe (geração é best-effort).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { id } = await params;
	const url = await getProposalPdfDownloadUrl(id);
	if (!url) {
		return Response.json({ error: "Proposta não disponível" }, { status: 404 });
	}
	return Response.json({ url });
}
