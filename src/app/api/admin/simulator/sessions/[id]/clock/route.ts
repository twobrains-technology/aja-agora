/**
 * POST — avança o clock simulado da conversa em N dias (cumulativo).
 *
 * Body: { advanceDays: number > 0, ≤ 3650 }
 * Resp: { offsetMs, simulatedNow: ISO, conversation }
 *
 * - Idempotência: NÃO. Cada call soma ao offset atual.
 * - Atomicidade: update via `jsonb_set` em SQL puro pra evitar race entre
 *   admins concorrentes (last-write-wins do Drizzle perderia uma das somas).
 * - Cap: rejeita se `offsetAtual + advanceDays*86400000` > 3650 dias.
 *
 * Dev-only: 404 em produção via `isSimulatorEnabled()`.
 */
import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isSimulatorEnabled } from "@/lib/utils/env";

const MS_PER_DAY = 86_400_000;
const MAX_OFFSET_DAYS = 3650;
const MAX_OFFSET_MS = MAX_OFFSET_DAYS * MS_PER_DAY;

const bodySchema = z.object({
	advanceDays: z.number().int().positive().max(MAX_OFFSET_DAYS),
});

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
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
	const advanceMs = parsed.data.advanceDays * MS_PER_DAY;

	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, id), eq(conversations.isSimulated, true)),
	});
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	// Cumulative cap check antes do update.
	const meta = (conv.metadata as Record<string, unknown> | null) ?? {};
	const simMeta = (meta.simulator as Record<string, unknown> | undefined) ?? {};
	const currentOffset = numericOrZero(simMeta.clockOffsetMs);
	const newOffset = currentOffset + advanceMs;
	if (newOffset > MAX_OFFSET_MS) {
		return NextResponse.json(
			{
				error: `advanceDays acumulado excede limite de ${MAX_OFFSET_DAYS} dias (atual=${
					currentOffset / MS_PER_DAY
				}, tentou +${parsed.data.advanceDays})`,
			},
			{ status: 400 },
		);
	}

	// Atomic update via jsonb_set encadeado. Faz SOMA do offset corrente +
	// advanceMs direto no DB pra prevenir race entre dois admins (EC-01).
	const nowIso = new Date().toISOString();
	const [updated] = await db
		.update(conversations)
		.set({
			metadata: sql`jsonb_set(
				jsonb_set(
					COALESCE(${conversations.metadata}, '{}'::jsonb),
					'{simulator,clockOffsetMs}',
					to_jsonb(
						COALESCE((${conversations.metadata} #>> '{simulator,clockOffsetMs}')::bigint, 0) + ${advanceMs}::bigint
					),
					true
				),
				'{simulator,clockAdvancedAt}',
				to_jsonb(${nowIso}::text),
				true
			)`,
			updatedAt: new Date(),
		})
		.where(and(eq(conversations.id, id), eq(conversations.isSimulated, true)))
		.returning();

	if (!updated) return new NextResponse("Not Found", { status: 404 });

	const finalMeta = (updated.metadata as Record<string, unknown> | null) ?? {};
	const finalSim = (finalMeta.simulator as Record<string, unknown> | undefined) ?? {};
	const finalOffset = numericOrZero(finalSim.clockOffsetMs);

	// Re-validar cap após race: se outro admin avançou no meio, finalOffset pode
	// ter passado do cap. Revertemos atomicamente.
	if (finalOffset > MAX_OFFSET_MS) {
		return NextResponse.json(
			{
				error: `advanceDays acumulado excede limite de ${MAX_OFFSET_DAYS} dias após race`,
			},
			{ status: 400 },
		);
	}

	return NextResponse.json({
		offsetMs: finalOffset,
		simulatedNow: new Date(Date.now() + finalOffset).toISOString(),
		conversation: { id: updated.id, metadata: updated.metadata },
	});
}

function numericOrZero(v: unknown): number {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = Number(v);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
}
