// src/lib/memory/reconciler.ts
//
// Reconcilia identidade temporária (cookie web anônimo) numa permanente
// (phone). Disparado quando o lead é capturado no chat web. Idempotente.
//
// Registra evento no `memory_events` (audit) — ver schema na task #14.

import type { MemoryAdapter } from "./adapter";
import { logMemoryOp, maskIdentity, recordMemoryEvent } from "./observability";
import type { UserIdentity } from "./types";

export interface ReconcileInput {
	adapter: MemoryAdapter;
	from: UserIdentity;
	to: UserIdentity;
	conversationId: string;
}

export interface ReconcileResult {
	success: boolean;
	error?: string;
	durationMs: number;
}

/**
 * Migra memória do agent temporário (cookie) pro agent permanente (phone).
 * - Adapter faz a cópia de archival + atualiza block com `reconciledFrom`.
 * - Caller é responsável por marcar `conversations.metadata.letta.reconciled = true`
 *   após sucesso (pra evitar re-disparo).
 * - Erros são engolidos: retorna `success: false` mas não throw.
 */
export async function reconcileIdentity(input: ReconcileInput): Promise<ReconcileResult> {
	const { adapter, from, to, conversationId } = input;
	const start = Date.now();

	try {
		// Safety: não migra entre kinds incompatíveis
		if (from.kind === to.kind && from.value === to.value) {
			return { success: true, durationMs: 0 };
		}

		await adapter.reconcileIdentity(from, to);
		const durationMs = Date.now() - start;

		// Audit (o adapter Letta já registra recordMemoryEvent internamente quando
		// faz reconcile real; isso aqui captura o evento da perspectiva do caller
		// — necessário pra distinguir "tentou e foi idempotente" de "passou
		// pelo merge real" via diff de durationMs).
		void recordMemoryEvent({
			conversationId,
			eventType: "reconciled",
			payload: {
				from_kind: from.kind,
				from_prefix: maskIdentity(from.value),
				to_kind: to.kind,
				to_prefix: maskIdentity(to.value),
				caller_duration_ms: durationMs,
			},
			latencyMs: durationMs,
		});

		return { success: true, durationMs };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logMemoryOp(
			{
				letta_op: "reconcile",
				letta_latency_ms: Date.now() - start,
				conversation_id: conversationId,
				identity_kind: from.kind,
				identity_value_prefix: maskIdentity(from.value),
				error: msg,
			},
			"warn",
		);
		return { success: false, error: msg, durationMs: Date.now() - start };
	}
}
