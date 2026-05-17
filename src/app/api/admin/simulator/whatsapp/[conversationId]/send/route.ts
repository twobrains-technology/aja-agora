/**
 * POST: encaminha mensagem do cliente simulado pro mesmo entrypoint que o webhook
 * real chama (processTextMessage / processInteractiveReply). Garante que a
 * simulação percorre exatamente o mesmo caminho da conversa real.
 * Dev-only.
 */
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { processInteractiveReply, processTextMessage } from "@/lib/whatsapp/processor";
import { isSimulatorEnabled } from "@/lib/utils/env";

const sendSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("text"), text: z.string().min(1).max(4096) }),
	z.object({
		kind: z.literal("interactive"),
		replyId: z.string().min(1),
		replyTitle: z.string().min(1),
	}),
]);

export async function POST(
	req: Request,
	{ params }: { params: Promise<{ conversationId: string }> },
) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
	if (error) return error;

	const { conversationId } = await params;

	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, conversationId), eq(conversations.isSimulated, true)),
		columns: { id: true, waId: true, channel: true, contactName: true },
	});
	if (!conv || conv.channel !== "whatsapp" || !conv.waId) {
		return new NextResponse("Conversa simulada de whatsapp não encontrada", { status: 404 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
	}
	const parsed = sendSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const contactName = conv.contactName ?? undefined;
	const data = parsed.data;
	// Disparamos em fire-and-forget: o processor pode levar segundos (LLM); a
	// resposta vem pelo SSE do stream/route. Aqui só damos ACK rápido.
	if (data.kind === "text") {
		void processTextMessage(conv.waId, data.text, contactName).catch((err) => {
			console.error("[sim-whatsapp-send] processTextMessage error", err);
		});
	} else {
		void processInteractiveReply(conv.waId, data.replyId, data.replyTitle, contactName).catch(
			(err) => {
				console.error("[sim-whatsapp-send] processInteractiveReply error", err);
			},
		);
	}

	return new NextResponse(null, { status: 204 });
}
