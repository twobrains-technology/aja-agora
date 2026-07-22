// Entrega da proposta co-branded AO CLIENTE. O PDF já era gerado no fechamento
// (`generateAndStoreProposalPdf`), mas ficava só no S3 pro back office: o
// cliente ouvia "você vai receber um email com os detalhes" e não recebia nada
// pelo canal em que estava conversando. A proposta é a peça do fechamento —
// tem que chegar na mão dele, no WhatsApp e no chat.
//
// Best-effort por natureza: nada aqui pode derrubar o fecho. Falhou, o
// fechamento segue e o log registra — nunca se finge que enviou.

import { getLatestBeviProposal } from "@/lib/bevi/proposal-repo";
import { generateAndStoreProposalPdf, getProposalPdfDownloadUrl } from "./store";

export type PropostaEntregue = {
	/** Link CURTO e estável que vai pro cliente (`/api/proposta/<id>`) — ele
	 * redireciona pra URL assinada na hora do clique. A assinada crua tem 400+
	 * caracteres e morre em 5 minutos: impublicável numa conversa. */
	url: string;
	/** URL assinada do S3, pra quem precisa do arquivo AGORA (o envio do
	 * documento no WhatsApp, que a Meta baixa na hora). */
	urlAssinada: string;
	nomeArquivo: string;
};

/** Base pública da aplicação, pra montar o link curto. Sem ela (env não
 * configurada), o caminho relativo ainda funciona no chat web. */
function baseUrl(): string {
	const base = process.env.APP_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
	return base ? base.replace(/\/$/, "") : "";
}

/** Garante o PDF (gera se ainda não existe) e devolve os endereços de download.
 * `null` quando não há proposta a documentar ou a geração falhou. */
export async function prepararPropostaParaEnvio(
	conversationId: string,
): Promise<PropostaEntregue | null> {
	try {
		const row = await getLatestBeviProposal(conversationId);
		if (!row?.id) return null;

		let urlAssinada = await getProposalPdfDownloadUrl(row.id);
		if (!urlAssinada) {
			// Ainda não estava no S3 (a geração é disparada em paralelo ao fecho e
			// pode não ter terminado). Gera agora e tenta de novo — uma vez só.
			await generateAndStoreProposalPdf(conversationId);
			urlAssinada = await getProposalPdfDownloadUrl(row.id);
		}
		if (!urlAssinada) return null;

		return {
			url: `${baseUrl()}/api/proposta/${row.id}`,
			urlAssinada,
			nomeArquivo: "Proposta-Aja-Agora.pdf",
		};
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "proposta-entrega",
				event: "preparo_falhou",
				conversationId,
				error: err instanceof Error ? err.message : String(err),
			}),
		);
		return null;
	}
}
