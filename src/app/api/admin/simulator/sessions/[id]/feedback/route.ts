/**
 * POST — feedback humano (👍/👎) de uma conversa do SIMULADOR → score
 * `user_feedback` (BOOLEAN 1/0) no Langfuse, no trace do turno quando a UI
 * mandar `traceId` (data-part `data-trace`), senão na session (= conversa).
 *
 * Leis: Langfuse desligado/fora do ar NUNCA vira 500 — responde
 * `{ ok:false, reason }` e a vida segue (observabilidade não quebra o app).
 * Dev-only: 404 em produção via `isSimulatorEnabled()`.
 */
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { getLangfuseClient } from "@/lib/observability/langfuse/client";
import { isSimulatorEnabled } from "@/lib/utils/env";

const bodySchema = z.object({
	value: z.enum(["up", "down"]),
	traceId: z.string().min(1).optional(),
	comment: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, id), eq(conversations.isSimulated, true)),
	});
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	const langfuse = getLangfuseClient();
	if (!langfuse) {
		return NextResponse.json({ ok: false, reason: "langfuse-disabled" });
	}

	const { value, traceId, comment } = parsed.data;
	try {
		await langfuse.score.create({
			name: "user_feedback",
			value: value === "up" ? 1 : 0,
			dataType: "BOOLEAN",
			...(comment ? { comment } : {}),
			...(traceId ? { traceId } : { sessionId: id }),
		});
	} catch (err) {
		console.error("[langfuse] score user_feedback falhou (ignorado):", err);
		return NextResponse.json({ ok: false, reason: "langfuse-error" });
	}

	return NextResponse.json({ ok: true });
}
