// src/lib/memory/index.ts
//
// Factory da camada de memória. Decide qual MemoryAdapter usar via
// `MEMORY_ADAPTER` env var (`postgres` | `noop`).
//
// Sem circuit breaker: a memória vive no MESMO Postgres que o app já opera
// (FIX-81 / ADR 2026-06-25-remocao-letta-postgres). Não há mais a dependência
// de rede remota do Letta que justificava o circuito. O contrato best-effort
// se mantém DENTRO do adapter (loadContext → null em erro; storeMemories
// engole erro transiente), então uma falha de DB degrada limpo sem derrubar o
// turno — sem precisar de fallback pro Noop em runtime.

import type { MemoryAdapter } from "./adapter";
import { NoopMemoryAdapter } from "./noop-adapter";
import { PostgresMemoryAdapter } from "./postgres-adapter";

let _adapter: MemoryAdapter | null = null;
const _noopInstance = new NoopMemoryAdapter();
let _postgresInstance: PostgresMemoryAdapter | null = null;

function createConfiguredAdapter(): MemoryAdapter {
	const choice = (process.env.MEMORY_ADAPTER ?? "postgres").toLowerCase();
	if (choice === "noop") return _noopInstance;
	if (choice !== "postgres") {
		console.warn(`[memory] Unknown MEMORY_ADAPTER="${choice}" — falling back to postgres`);
	}
	if (!_postgresInstance) _postgresInstance = new PostgresMemoryAdapter();
	return _postgresInstance;
}

/** Retorna o adapter a usar AGORA. Síncrono — singleton lazy. */
export function getMemoryAdapter(): MemoryAdapter {
	if (!_adapter) {
		_adapter = createConfiguredAdapter();
	}
	return _adapter;
}

/** Reset singleton — para testes. */
export function resetMemoryAdapter(): void {
	_adapter = null;
	_postgresInstance = null;
}

// Re-exports pra ergonomia
export type { MemoryAdapter } from "./adapter";
export { NoopMemoryAdapter } from "./noop-adapter";
export { PostgresMemoryAdapter } from "./postgres-adapter";
export type {
	ArchivalHit,
	HumanMemoryBlock,
	IdentityKind,
	LeadStage,
	MemoryContext,
	MemoryEntry,
	MemoryEntryKind,
	StoreMetadata,
	UserIdentity,
} from "./types";
export { MemoryError, MemoryTimeoutError } from "./types";
