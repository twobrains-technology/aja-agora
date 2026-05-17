// src/lib/memory/index.ts
//
// Factory + circuit breaker. Decide qual MemoryAdapter usar baseado em:
// 1. `MEMORY_ADAPTER` env var (`letta` | `noop`) — feature flag estática
// 2. Health check periódico do Letta — fallback runtime pra Noop quando o
//    backend cai. Re-checa a cada CIRCUIT_RECHECK_MS pra recuperar.

import type { MemoryAdapter } from "./adapter";
import { isLettaCircuitOpen, markLettaFailure, markLettaSuccess } from "./circuit-state";
import { LettaMemoryAdapter } from "./letta-adapter";
import { lettaHealthCheck } from "./letta-client";
import { NoopMemoryAdapter } from "./noop-adapter";
import { logMemoryOp, recordMemoryEvent } from "./observability";

const CIRCUIT_RECHECK_MS = 60_000;

let _adapter: MemoryAdapter | null = null;
let _lastHealthCheckAt = 0;
let _lettaInstance: LettaMemoryAdapter | null = null;
const _noopInstance = new NoopMemoryAdapter();

function createConfiguredAdapter(): MemoryAdapter {
	const choice = (process.env.MEMORY_ADAPTER ?? "letta").toLowerCase();
	if (choice === "noop") return _noopInstance;
	if (choice !== "letta") {
		console.warn(`[memory] Unknown MEMORY_ADAPTER="${choice}" — falling back to letta`);
	}
	if (!_lettaInstance) _lettaInstance = new LettaMemoryAdapter();
	return _lettaInstance;
}

/**
 * Retorna o adapter a usar AGORA. Aplica circuit breaker:
 * - Se o circuito está aberto (Letta indisponível na última checagem),
 *   retorna NoopAdapter direto.
 * - A cada CIRCUIT_RECHECK_MS, faz health check em background pra ver se
 *   Letta voltou.
 *
 * Esta função é não-bloqueante — health check é fire-and-forget.
 */
export function getMemoryAdapter(): MemoryAdapter {
	if (!_adapter) {
		_adapter = createConfiguredAdapter();
	}

	// Se forçado pra Noop via env, não há circuit breaker.
	if (!_adapter.isPersistent()) return _adapter;

	// Health check periódico em background. Não bloqueia. Apenas pra
	// **recuperar** o circuito após erros — o adapter já abre o circuito
	// SÍNCRONAMENTE em qualquer falha (via markLettaFailure no catch).
	const now = Date.now();
	if (now - _lastHealthCheckAt > CIRCUIT_RECHECK_MS) {
		_lastHealthCheckAt = now;
		lettaHealthCheck(1000)
			.then((ok) => {
				if (ok) {
					markLettaSuccess();
				} else {
					markLettaFailure("health_check_failed");
					void recordMemoryEvent({
						eventType: "fallback_triggered",
						payload: { reason: "letta_health_check_failed" },
					});
				}
			})
			.catch(() => {});
	}

	if (isLettaCircuitOpen()) {
		logMemoryOp({ letta_op: "fallback_triggered" }, "warn");
		return _noopInstance;
	}
	return _adapter;
}

/** Reset singleton — para testes. */
export function resetMemoryAdapter(): void {
	_adapter = null;
	_lastHealthCheckAt = 0;
	_lettaInstance = null;
}

// Re-exports pra ergonomia
export type { MemoryAdapter } from "./adapter";
export type {
	ArchivalHit,
	HumanMemoryBlock,
	MemoryContext,
	MemoryEntry,
	MemoryEntryKind,
	StoreMetadata,
	UserIdentity,
	IdentityKind,
	LeadStage,
} from "./types";
export { MemoryError, MemoryTimeoutError } from "./types";
export { LettaMemoryAdapter } from "./letta-adapter";
export { NoopMemoryAdapter } from "./noop-adapter";
