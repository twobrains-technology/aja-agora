import { NextResponse } from "next/server";
import { z } from "zod";
import { uploadContractDocument } from "@/lib/bevi/fulfillment";

// FIX-10 (teste manual Kairo 2026-06-05): upload de documento SILENCIOSO —
// fora do turno de chat. Antes, cada slot subia via action de chat e postava
// "Enviei meu documento" + resposta do bot ANTES do verso. Agora o arquivo
// sobe aqui (sem mensagem); a conclusão é a action documents-done no chat.

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
		const { ok, fallbackLink } = await uploadContractDocument(parsed.conversationId, {
			slot: parsed.slot,
			file,
			filename: parsed.filename,
			mimeType: parsed.mimeType,
		});
		return NextResponse.json({ ok, fallbackLink: fallbackLink ?? null });
	} catch (err) {
		// Sem proposta/links (fluxo fora de ordem) ou erro do portal — o
		// componente mostra a falha no slot; nada de mensagem fantasma no chat.
		const message = err instanceof Error ? err.message : "falha no upload";
		return NextResponse.json({ ok: false, error: message }, { status: 422 });
	}
}
