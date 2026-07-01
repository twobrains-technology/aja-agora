/**
 * Interactive-reply endpoint for the dev attendant simulator (FIX-174).
 * Simula o clique num botão interativo (ex.: "Vou atender" da mesa) vindo do
 * atendente, roteando pelo MESMO processInteractiveReply que o webhook real chama
 * — mesma precedência mesa-primeiro (processor.ts), mesmo claim atômico (D16).
 * Mirrors /api/admin/simulator/whatsapp/[conversationId]/send (kind=interactive).
 *
 * POST /api/admin/simulator/attendant/<attendantId>/interactive-reply  { replyId, replyTitle }
 *
 * Dev-only: returns 404 in production.
 */
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isSimulatorEnabled } from "@/lib/utils/env";
import { processInteractiveReply } from "@/lib/whatsapp/processor";

const interactiveReplySchema = z.object({
	replyId: z.string().min(1),
	replyTitle: z.string().min(1).max(4096),
});

export async function POST(req: Request, { params }: { params: Promise<{ attendantId: string }> }) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}

	const { error } = await requireRole("admin");
	if (error) return error;

	const { attendantId } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
	}

	const parsed = interactiveReplySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Dados inválidos", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const attendant = await db.query.user.findFirst({
		where: and(eq(userTable.id, attendantId), eq(userTable.role, "attendant")),
		columns: { phone: true, isActive: true },
	});

	if (!attendant || !attendant.phone) {
		return NextResponse.json({ error: "Atendente não encontrado" }, { status: 404 });
	}

	await processInteractiveReply(attendant.phone, parsed.data.replyId, parsed.data.replyTitle);
	return NextResponse.json({ ok: true });
}
