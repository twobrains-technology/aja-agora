/**
 * Link PÚBLICO e curto da proposta do cliente: `/api/proposta/<beviProposalId>`.
 *
 * Existe porque a URL assinada do S3 é impublicável na conversa — 400+
 * caracteres de `X-Amz-Signature` colados no meio de um balão de chat, e ainda
 * por cima expirando em 5 minutos (o cliente que voltasse depois do almoço
 * clicava num link morto). Aqui o endereço é curto, estável e sobrevive ao
 * tempo: a assinatura é gerada na hora do clique e o cliente é redirecionado.
 *
 * O identificador é o UUID da linha em `bevi_proposals` — não enumerável e sem
 * PII. Mesma classe de exposição do link assinado que já ia pro cliente, só que
 * sem a data de validade.
 */
import { NextResponse } from "next/server";
import { getProposalPdfDownloadUrl } from "@/lib/proposal/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!UUID.test(id)) return new NextResponse("Not Found", { status: 404 });

	const url = await getProposalPdfDownloadUrl(id).catch((err) => {
		console.error(
			JSON.stringify({
				level: "error",
				source: "proposta-link",
				event: "resolucao_falhou",
				proposalRowId: id,
				error: err instanceof Error ? err.message : String(err),
			}),
		);
		return null;
	});
	if (!url) return new NextResponse("Proposta não encontrada", { status: 404 });

	// 302 (nunca 301): a URL de destino é assinada e muda a cada clique — cachear
	// o redirecionamento entregaria uma assinatura vencida na segunda visita.
	return NextResponse.redirect(url, { status: 302 });
}
