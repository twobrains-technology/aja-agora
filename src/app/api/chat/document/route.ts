import { NextResponse } from "next/server";
import { z } from "zod";
import { storeClientDocument } from "@/lib/documents/client-documents";

// FIX-10 (teste manual Kairo 2026-06-05): upload de documento SILENCIOSO —
// fora do turno de chat. Antes, cada slot subia via action de chat e postava
// "Enviei meu documento" + resposta do bot ANTES do verso. Agora o arquivo
// sobe aqui (sem mensagem); a conclusão é a action documents-done no chat.
//
// FIX-82: o documento do cliente é um ATIVO NOSSO — grava no NOSSO S3
// (bucket dedicado, SSE-KMS) PRIMEIRO e responde de imediato. O envio à Bevi
// saiu do caminho crítico: virou despacho best-effort (dispatchClientDocument,
// FIX-84), que NÃO é disparado automaticamente daqui — ver decisão registrada
// em docs/correcoes/decisions/2026-06-28-bloco-a-documentos.md (Trilho A
// confirmado travado hoje; disparo fica pra quando houver um trigger real:
// ação do operador, cron ou o fechamento via Trilho B do bloco-c).

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB (base64 ~10.6MB)

const bodySchema = z.object({
	conversationId: z.string().uuid(),
	slot: z.enum(["identidade_frente", "identidade_verso", "comprovante_endereco"]),
	fileBase64: z.string().min(1),
	filename: z.string().min(1).max(255),
	mimeType: z.string().min(1).max(100),
});

export async function POST(req: Request): Promise<NextResponse> {
	let parsed: z.infer<typeof bodySchema>;
	try {
		parsed = bodySchema.parse(await req.json());
	} catch {
		return NextResponse.json({ ok: false, error: "payload inválido" }, { status: 400 });
	}

	const file = Buffer.from(parsed.fileBase64, "base64");
	if (file.byteLength === 0 || file.byteLength > MAX_FILE_BYTES) {
		return NextResponse.json(
			{ ok: false, error: "arquivo vazio ou acima de 8MB" },
			{ status: 400 },
		);
	}

	try {
		const { documentId } = await storeClientDocument({
			conversationId: parsed.conversationId,
			slot: parsed.slot,
			file,
			filename: parsed.filename,
			mimeType: parsed.mimeType,
		});
		return NextResponse.json({ ok: true, documentId });
	} catch (err) {
		// Falha ao gravar no NOSSO S3 — o componente mostra a falha no slot;
		// nada de mensagem fantasma no chat.
		const message = err instanceof Error ? err.message : "falha no upload";
		return NextResponse.json({ ok: false, error: message }, { status: 422 });
	}
}
