// src/lib/memory/reconciler.ts
//
// Reconcilia identidade temporária (cookie web anônimo) numa permanente
// (phone). Disparado quando o lead é capturado no chat web. Idempotente.
//
// Registra evento no `memory_events` (audit) — ver schema na task #14.

import type { MemoryAdapter } from "./adapter";
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

		// TODO(task #14): insert em `memory_events`:
		//   { conversationId, eventType: "reconciled", payload: { from, to }, latencyMs }

		return { success: true, durationMs: Date.now() - start };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(
			`[memory] reconcileIdentity failed conv=${conversationId} ${from.kind}:${from.value.slice(0, 8)} → ${to.kind}:${to.value.slice(0, 8)}: ${msg}`,
		);
		return { success: false, error: msg, durationMs: Date.now() - start };
	}
}
