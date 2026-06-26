// src/lib/memory/postgres-adapter.ts
//
// ⚠️ STUB DE ESTUDO — NÃO LIGADO NO RUNTIME. ⚠️
//
// Esboço do `PostgresMemoryAdapter` proposto pelo ADR
// `docs/correcoes/decisions/2026-06-25-remocao-letta-postgres.md` (FIX-80).
// Este arquivo existe APENAS para ilustrar o contrato do re-home da memória
// pro Postgres. Ele:
//   - NÃO é registrado no factory `getMemoryAdapter()` (src/lib/memory/index.ts).
//   - NÃO troca a env `MEMORY_ADAPTER` nem o container Letta.
//   - NÃO cria tabela Drizzle real (migração é trabalho da execução futura).
//   - Tem corpos `TODO(estudo):` — retornam os defaults seguros do contrato
//     (read não-throw → null/[]; write fire-and-forget → void) só pra
//     type-checar e documentar as assinaturas.
//
// A execução real (PENDENTE-KAIRO) deve: (1) criar a tabela `memory_identities`
// no schema Drizzle, (2) implementar os corpos abaixo, (3) cobrir com os testes
// `reactivation`/`reconciler`/`index` já existentes (que validam o contrato
// `MemoryAdapter`), (4) só ENTÃO trocar o seletor no factory atrás da flag.
//
// Pré-requisito inviolável antes de qualquer corte: a MEDIÇÃO em prod descrita
// no ADR (seção "Pré-requisitos de medição — PENDENTE-KAIRO"). Sem o dado real
// de adapter ativo + taxa de recall/reativação, NÃO ligar este adapter.

import type { MemoryAdapter } from "./adapter";
import type {
	ArchivalHit,
	HumanMemoryBlock,
	MemoryContext,
	MemoryEntry,
	StoreMetadata,
	UserIdentity,
} from "./types";

// ─── Tabela proposta (ilustrativa — NÃO é Drizzle real ainda) ────────────────
//
// 1 linha por identidade. O `extractor.ts` já produz o `blockPatch` →
// read-modify-write vira um único `upsert` atômico. Substitui o "agent Letta"
// (KV-store REST remoto) por uma linha local no Postgres que o app já opera.
//
//   export const memoryIdentities = pgTable(
//     "memory_identities",
//     {
//       id: uuid().defaultRandom().primaryKey(),
//       // chave de identidade (espelha UserIdentity) — única composta
//       namespace: varchar("namespace", { length: 120 }).notNull(),
//       kind: varchar("kind", { length: 20 }).notNull(), // phone | email | anon-cookie
//       value: varchar("value", { length: 200 }).notNull(),
//       // memory_block "human" (hoje serializado em string no Letta) → jsonb nativo
//       block: jsonb().$type<HumanMemoryBlock>().notNull(),
//       // proveniência de reconcile (cookie anônimo → phone)
//       reconciledFrom: text("reconciled_from"),
//       lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
//       createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
//       updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
//     },
//     (t) => [uniqueIndex("memory_identities_key_idx").on(t.namespace, t.kind, t.value)],
//   );
//
// Archival (busca semântica) é FASE 2 OPCIONAL — hoje está MORTO (OpenAI 429).
// Se reativado: tabela `memory_passages` + coluna `embedding vector(1536)` via
// extensão pgvector, com embeddings pelo gateway LiteLLM shared (NÃO OpenAI
// direto). O stub abaixo trata archival como vazio (paridade com o estado atual).

/**
 * Re-home da memória cross-channel pro Postgres, preservando o contrato
 * `MemoryAdapter`. Mesmo comportamento observável do `LettaMemoryAdapter`
 * (read não-throw, write fire-and-forget, degradação limpa, reativação),
 * sem o container/REST/OpenAI/circuit-breaker do Letta.
 */
export class PostgresMemoryAdapter implements MemoryAdapter {
	/**
	 * Lê a linha `memory_identities` da identidade e monta o `MemoryContext`.
	 * Calcula `daysSinceLastInteraction` em SQL/app (sem drift). Archival vazio
	 * na fase 1 (paridade com o estado morto atual). Read-side: NUNCA throw —
	 * em qualquer erro retorna null e o orchestrator segue sem memória.
	 */
	async loadContext(
		_identity: UserIdentity,
		_options?: { timeoutMs?: number; archivalQuery?: string },
	): Promise<MemoryContext | null> {
		// TODO(estudo): SELECT block, last_interaction_at WHERE (namespace,kind,value);
		// montar HumanMemoryBlock + daysSinceLastInteraction; archivalHits = [].
		return null;
	}

	/**
	 * Persiste o turno via UPSERT atômico: aplica `metadata.blockPatch` ao
	 * `block` (read-modify-write num único statement com `ON CONFLICT DO UPDATE`)
	 * e seta `lastInteractionAt = now()`. Cria a linha lazy se não existir.
	 * Write-side: engole erros transientes (log + drop), nunca bloqueia o turno.
	 */
	async storeMemories(
		_identity: UserIdentity,
		_memories: MemoryEntry[],
		_metadata: StoreMetadata,
	): Promise<void> {
		// TODO(estudo): INSERT ... ON CONFLICT (namespace,kind,value) DO UPDATE
		// SET block = jsonb_strip_nulls(block || :patch), last_interaction_at = now().
		// `channels` faz merge/dedup (array union). Fase 1 ignora `_memories`
		// (archival morto); fase 2 grava em `memory_passages` + embedding.
	}

	/**
	 * Busca semântica no archival — FASE 2 OPCIONAL (pgvector + LiteLLM). Na
	 * fase 1 retorna [] (paridade com o archival morto atual). Read-side: nunca
	 * throw.
	 */
	async searchArchival(
		_identity: UserIdentity,
		_query: string,
		_limit?: number,
	): Promise<ArchivalHit[]> {
		// TODO(estudo, fase 2): ORDER BY embedding <=> :queryEmbedding LIMIT :limit.
		return [];
	}

	/**
	 * Reconcilia identidade temporária (cookie anônimo) → permanente (phone).
	 * UPDATE da chave (ou merge do block destino com `reconciledFrom`) numa
	 * transação. Idempotente — re-chamar não duplica. Write-side: erros engolidos.
	 */
	async reconcileIdentity(_from: UserIdentity, _to: UserIdentity): Promise<void> {
		// TODO(estudo): em transação — merge block(from) → block(to),
		// set reconciled_from = key(from); na fase 2, re-key as passages.
		// No-op idempotente se já reconciliado.
	}

	/**
	 * Apaga a memória da identidade (/reset web — D17). Write-side best-effort:
	 * engole erros, no-op se inexistente, idempotente.
	 */
	async purgeIdentity(_identity: UserIdentity): Promise<void> {
		// TODO(estudo): DELETE FROM memory_identities WHERE (namespace,kind,value)
		// (+ passages na fase 2). Idempotente.
	}

	/** Persiste de verdade → habilita o circuit/coleta no orchestrator. */
	isPersistent(): boolean {
		return true;
	}
}

// Helper de paridade com `extractor.ts`/`letta-adapter.ts`: aplica um
// `Partial<HumanMemoryBlock>` preservando campos undefined (read-modify-write).
// Deixado aqui só pra documentar a semântica do patch que o UPSERT replica em
// SQL (`jsonb_strip_nulls(block || patch)` + union de `channels`).
export function mergeHumanBlock(
	current: HumanMemoryBlock,
	patch: Partial<HumanMemoryBlock>,
): HumanMemoryBlock {
	const channels = patch.channels
		? Array.from(new Set([...(current.channels ?? []), ...patch.channels]))
		: current.channels;
	const merged: HumanMemoryBlock = { ...current };
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) (merged as unknown as Record<string, unknown>)[key] = value;
	}
	if (channels) merged.channels = channels;
	return merged;
}
