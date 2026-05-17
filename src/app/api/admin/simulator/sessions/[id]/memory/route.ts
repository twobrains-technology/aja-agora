/**
 * GET — snapshot da memória Letta da identidade da conversa simulada.
 *
 * Resp:
 *   identity, agentExists, block, daysSinceLastInteraction,
 *   reactivationHint (preview do hint que próximo turno injetaria),
 *   archivalSample (top 10 mais recentes), clockOffsetMs, simulatedNow,
 *   lettaAvailable, webEngagementProgress
 *
 * Read-only. Não cria agent. Em qualquer erro de Letta, retorna shape válido
 * com `lettaAvailable=false`.
 *
 * Dev-only: 404 em produção via `isSimulatorEnabled()`.
 */
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { inspectSimulatorMemory } from "@/lib/memory/inspect";
import { isSimulatorEnabled } from "@/lib/utils/env";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;
	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, id), eq(conversations.isSimulated, true)),
		columns: {
			id: true,
			channel: true,
			waId: true,
			metadata: true,
		},
	});
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	const snapshot = await inspectSimulatorMemory({ conversation: conv });

	return NextResponse.json(snapshot, {
		headers: {
			// Não cachear: clock pode mudar a qualquer momento; UI precisa fresh.
			"Cache-Control": "no-store",
		},
	});
}
