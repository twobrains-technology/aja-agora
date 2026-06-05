/**
 * POST — reseta o offset do clock simulado para 0.
 *
 * - Idempotente: chamar N vezes deixa offset = 0 sempre.
 * - NÃO rebobina timestamps já gravados (`messages.createdAt`,
 *   `block.lastInteractionAt` no Letta etc.). Apenas zera o offset corrente;
 *   próximas gravações usam tempo real.
 *
 * Dev-only: 404 em produção via `isSimulatorEnabled()`.
 */
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isSimulatorEnabled } from "@/lib/utils/env";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;
	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, id), eq(conversations.isSimulated, true)),
		columns: { id: true },
	});
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	const nowIso = new Date().toISOString();
	const [updated] = await db
		.update(conversations)
		.set({
			metadata: sql`COALESCE(${conversations.metadata}, '{}'::jsonb) ||
				jsonb_build_object('simulator',
					COALESCE(${conversations.metadata} -> 'simulator', '{}'::jsonb) ||
					jsonb_build_object(
						'clockOffsetMs', 0,
						'clockAdvancedAt', ${nowIso}::text
					)
				)`,
			updatedAt: new Date(),
		})
		.where(and(eq(conversations.id, id), eq(conversations.isSimulated, true)))
		.returning();

	if (!updated) return new NextResponse("Not Found", { status: 404 });

	return NextResponse.json({
		offsetMs: 0,
		simulatedNow: new Date().toISOString(),
		conversation: { id: updated.id, metadata: updated.metadata },
	});
}
