// src/lib/utils/simulator-clock-wrap.ts
//
// Helpers de wrap pros entrypoints do simulador. Lê `metadata.simulator.clockOffsetMs`
// da conversa e roda a função dentro de `runWithSimulatorClock` quando a conv
// é simulada. Em conv real (`is_simulated=false`), executa direto sem ALS
// context — zero impacto.
//
// Também: persiste `metadata.simulator.lettaCookieKey` quando a 1ª passagem
// web fornece um `userKey`, pra que GET /memory consiga reconstruir identity
// de qualquer admin (cookie do browser é por-sessão).

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { runWithSimulatorClock } from "./simulator-clock";

interface ConvLike {
	id: string;
	isSimulated?: boolean | null;
	metadata?: unknown;
}

/**
 * Lê o offset persistido em `metadata.simulator.clockOffsetMs` (default 0).
 */
export function readSimulatorOffsetMs(conv: ConvLike | null | undefined): number {
	if (!conv?.isSimulated) return 0;
	const meta = (conv.metadata as Record<string, unknown> | null) ?? {};
	const sim = (meta.simulator as Record<string, unknown> | undefined) ?? {};
	const raw = sim.clockOffsetMs;
	if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
	if (typeof raw === "string") {
		const n = Number(raw);
		return Number.isFinite(n) && n >= 0 ? n : 0;
	}
	return 0;
}

/**
 * Roda `fn` dentro de `runWithSimulatorClock` se a conv é simulada com offset
 * > 0; senão executa direto. Async-friendly — propaga via Promise.
 */
export async function withSimulatorClockIfNeeded<T>(
	conv: ConvLike | null | undefined,
	fn: () => Promise<T> | T,
): Promise<T> {
	if (!conv?.isSimulated) return await fn();
	const offsetMs = readSimulatorOffsetMs(conv);
	if (offsetMs <= 0) return await fn();
	return runWithSimulatorClock({ offsetMs, conversationId: conv.id }, async () => await fn());
}

/**
 * Idempotente: grava o cookie key web no `metadata.simulator.lettaCookieKey`
 * da primeira vez que aparece, pra GET /memory poder reconstruir identity de
 * outros admins. No-op se já gravado ou se conv não é web simulada.
 */
export async function persistSimulatorCookieKey(
	conv: ConvLike & { channel?: string | null },
	userKey: string | null,
): Promise<void> {
	if (!conv?.isSimulated || conv.channel !== "web" || !userKey) return;
	const meta = (conv.metadata as Record<string, unknown> | null) ?? {};
	const sim = (meta.simulator as Record<string, unknown> | undefined) ?? {};
	if (sim.lettaCookieKey === userKey) return;
	await db
		.update(conversations)
		.set({
			metadata: sql`jsonb_set(
				COALESCE(${conversations.metadata}, '{}'::jsonb),
				'{simulator,lettaCookieKey}',
				to_jsonb(${userKey}::text),
				true
			)`,
		})
		.where(and(eq(conversations.id, conv.id), eq(conversations.isSimulated, true)));
}
