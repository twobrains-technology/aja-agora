// src/lib/memory/noop-adapter.ts
//
// NoopMemoryAdapter — implementação que NÃO persiste nada. Usado:
// 1. Em testes (mock fácil)
// 2. Quando MEMORY_ADAPTER=noop no env (feature flag)
// 3. Como FALLBACK em runtime quando o Letta tá indisponível
//    (circuit breaker em src/lib/memory/index.ts decide quando usar)

import type { MemoryAdapter } from "./adapter";
import type { ArchivalHit, MemoryContext, MemoryEntry, StoreMetadata, UserIdentity } from "./types";

export class NoopMemoryAdapter implements MemoryAdapter {
	async loadContext(_identity: UserIdentity): Promise<MemoryContext | null> {
		return null;
	}

	async storeMemories(
		_identity: UserIdentity,
		_memories: MemoryEntry[],
		_metadata: StoreMetadata,
	): Promise<void> {
		// no-op
	}

	async searchArchival(
		_identity: UserIdentity,
		_query: string,
		_limit?: number,
	): Promise<ArchivalHit[]> {
		return [];
	}

	async reconcileIdentity(_from: UserIdentity, _to: UserIdentity): Promise<void> {
		// no-op
	}

	async purgeIdentity(_identity: UserIdentity): Promise<void> {
		// no-op
	}

	isPersistent(): boolean {
		return false;
	}
}
