import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extrai o texto completo de um PDF (todas as páginas concatenadas) usando unpdf
 * (build serverless do pdf.js, zero deps nativas — ver ADR bloco-mesa-a). É o
 * texto que o copiloto da mesa injeta no system prompt (DEC-C: full-text, não RAG).
 *
 * Encapsula a lib: trocar de extrator não vaza pra rota nem pro copiloto. A
 * extração que falha é responsabilidade do chamador (o upload grava o doc com
 * textoExtraido nulo e pode re-tentar).
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
	const pdf = await getDocumentProxy(bytes);
	const { text } = await extractText(pdf, { mergePages: true });
	return text.trim();
}
