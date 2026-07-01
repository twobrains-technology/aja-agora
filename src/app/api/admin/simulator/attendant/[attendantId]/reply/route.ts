/**
 * Reply endpoint for the dev attendant simulator.
 * Treats the simulator input as if the attendant had replied via WhatsApp,
 * routing through the SAME processTextMessage the real webhook calls (mirrors
 * /api/admin/simulator/whatsapp/[conversationId]/send). Isso garante a mesma
 * precedência de canal do processor.ts (FIX-172): atendente de MESA cai no
 * copiloto (handleMesaCopilot), NUNCA no chat de vendas (handleAgentMessage) —
 * chamar handleAgentMessage direto (como antes) pulava essa checagem.
 *
 * POST /api/admin/simulator/<attendantId>/reply  { text }
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
import { processTextMessage } from "@/lib/whatsapp/processor";

const replySchema = z.object({
	text: z.string().min(1).max(4096),
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

	const parsed = replySchema.safeParse(body);
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

	await processTextMessage(attendant.phone, parsed.data.text);
	return NextResponse.json({ ok: true });
}
