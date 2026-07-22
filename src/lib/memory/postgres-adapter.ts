// src/lib/memory/postgres-adapter.ts
//
// PostgresMemoryAdapter — re-home da memória cross-channel do Letta pro
// Postgres que o app já opera (FIX-81 / ADR 2026-06-25-remocao-letta-postgres,
// Opção B). Implementa o contrato `MemoryAdapter` preservando 100% do
// comportamento observável do `LettaMemoryAdapter`:
//   - read-side (loadContext/searchArchival) NUNCA throw → null/[];
//   - write-side (storeMemories/reconcileIdentity/purgeIdentity) é best-effort:
//     engole erro transiente e loga, nunca derruba o turno;
//   - merge de block determinístico (channels/objections com dedup, destino
//     "vence" no reconcile) idêntico ao Letta.
//
// O "agent Letta" (KV-store REST remoto, 1 blob jsonb por identidade) vira 1
// LINHA na tabela `memory_identities`, keyed por (namespace, kind, value). O
// read-modify-write remoto + lock anti-race do Letta vira uma transação com
// `SELECT ... FOR UPDATE`. Archival semântico (busca por embedding) fica de
// fora — estava MORTO no Letta (OpenAI 429 sem impacto de UX); pgvector é a
// fase 2 opcional do ADR.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memoryIdentities } from "@/db/schema";
import { simulatorNow } from "@/lib/utils/simulator-clock";

import type { MemoryAdapter } from "./adapter";
import { logMemoryOp, maskIdentity, recordMemoryEvent } from "./observability";
import type {
	ArchivalHit,
	HumanMemoryBlock,
	MemoryContext,
	MemoryEntry,
	StoreMetadata,
	UserIdentity,
} from "./types";

const READ_TIMEOUT_MS = 2000;

/**
 * Chave canônica e estável de uma identidade — espelha `UserIdentity` e serve
 * de `agentId` no `MemoryContext` (o orchestrator/reconciler usam-na como
 * identificador opaco; antes era o UUID do agent Letta). Determinística: não
 * muda se a linha for recriada, o que torna a idempotência do reconcile robusta.
 * Phone E.164: sem `+`. Cookie: 16 chars (suficiente p/ unicidade).
 */
function identityKey(identity: UserIdentity): string {
	const safeValue =
		identity.kind === "phone"
			? identity.value.replace(/^\+/, "")
			: identity.kind === "anon-cookie"
				? identity.value.slice(0, 16)
				: identity.value.replace(/[^a-zA-Z0-9_-]/g, "_");
	return `${identity.namespace}-${identity.kind}-${safeValue}`;
}

function emptyHumanBlock(identity: UserIdentity): HumanMemoryBlock {
	return {
		schemaVersion: 1,
		phone: identity.kind === "phone" ? identity.value : undefined,
		email: identity.kind === "email" ? identity.value : undefined,
		objections: [],
		channels: [],
	};
}

function daysBetween(isoA: string | undefined, dateB: Date): number | null {
	if (!isoA) return null;
	const a = new Date(isoA).getTime();
	if (Number.isNaN(a)) return null;
	const diffMs = dateB.getTime() - a;
	// Clampa negativo a 0 (pós-reset, lastInteractionAt pode estar no "futuro"
	// vs. tempo simulado). Paridade com o LettaMemoryAdapter.
	if (diffMs < 0) return 0;
	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function uniqueChannels(
	...lists: (HumanMemoryBlock["channels"] | undefined)[]
): ("web" | "whatsapp")[] {
	const set = new Set<"web" | "whatsapp">();
	for (const list of lists) for (const c of list ?? []) set.add(c);
	return Array.from(set);
}

/**
 * Merge do block no STORE — read-modify-write idêntico ao
 * `LettaMemoryAdapter.storeMemories`: aplica o `blockPatch`, sempre atualiza
 * `lastInteractionAt`, faz union do canal atual e dedup das objections.
 */
function mergeForStore(
	current: HumanMemoryBlock,
	blockPatch: Partial<HumanMemoryBlock> | undefined,
	channel: "web" | "whatsapp",
): HumanMemoryBlock {
	return {
		...current,
		...(blockPatch ?? {}),
		lastInteractionAt: simulatorNow().toISOString(),
		channels: uniqueChannels(current.channels, [channel]),
		objections: blockPatch?.objections
			? Array.from(new Set([...(current.objections ?? []), ...blockPatch.objections]))
			: current.objections,
	};
}

export class PostgresMemoryAdapter implements MemoryAdapter {
	isPersistent(): boolean {
		return true;
	}

	async loadContext(
		identity: UserIdentity,
		options?: { timeoutMs?: number; archivalQuery?: string },
	): Promise<MemoryContext | null> {
		const timeoutMs = options?.timeoutMs ?? READ_TIMEOUT_MS;
		const start = Date.now();
		try {
			const row = await withTimeout(this.findRow(identity), timeoutMs);
			if (!row) {
				logMemoryOp({
					letta_op: "load_context",
					letta_latency_ms: Date.now() - start,
					identity_kind: identity.kind,
					identity_value_prefix: maskIdentity(identity.value),
					namespace: identity.namespace,
					agent_found: false,
				});
				return null;
			}
			const block = row.block;
			const daysSinceLastInteraction = daysBetween(block.lastInteractionAt, simulatorNow());
			logMemoryOp({
				letta_op: "load_context",
				letta_latency_ms: Date.now() - start,
				letta_agent_id: identityKey(identity),
				identity_kind: identity.kind,
				identity_value_prefix: maskIdentity(identity.value),
				namespace: identity.namespace,
				agent_found: true,
				archival_hits: 0,
				days_since_last_interaction: daysSinceLastInteraction,
			});
			return {
				agentId: identityKey(identity),
				block,
				archivalHits: [],
				daysSinceLastInteraction,
			};
		} catch (err) {
			// Read-side NUNCA throw — log e devolve null (o orchestrator segue sem memória).
			logMemoryOp(
				{
					letta_op: "load_context",
					letta_latency_ms: Date.now() - start,
					letta_fallback: true,
					identity_kind: identity.kind,
					identity_value_prefix: maskIdentity(identity.value),
					namespace: identity.namespace,
					error: err instanceof Error ? err.message : String(err),
				},
				"warn",
			);
			return null;
		}
	}

	async storeMemories(
		identity: UserIdentity,
		memories: MemoryEntry[],
		metadata: StoreMetadata,
	): Promise<void> {
		const start = Date.now();
		try {
			// UPSERT atômico via transação com SELECT ... FOR UPDATE. Substitui o
			// read-modify-write remoto + lock in-memory do Letta. `memories`
			// (archival) é ignorado na fase 1 — archival morto; pgvector é fase 2.
			await db.transaction(async (tx) => {
				const [existing] = await tx
					.select()
					.from(memoryIdentities)
					.where(keyWhere(identity))
					.for("update");

				const current = existing?.block ?? emptyHumanBlock(identity);
				const merged = mergeForStore(current, metadata.blockPatch, metadata.channel);

				await tx
					.insert(memoryIdentities)
					.values({
						namespace: identity.namespace,
						kind: identity.kind,
						value: identity.value,
						block: merged,
						reconciledFrom: merged.reconciledFrom ?? null,
						lastInteractionAt: new Date(merged.lastInteractionAt as string),
					})
					.onConflictDoUpdate({
						target: [memoryIdentities.namespace, memoryIdentities.kind, memoryIdentities.value],
						set: {
							block: merged,
							reconciledFrom: merged.reconciledFrom ?? null,
							lastInteractionAt: new Date(merged.lastInteractionAt as string),
							updatedAt: new Date(), // real-time-intentional: coluna de auditoria (wall-clock), não tempo de turno
						},
					});
			});

			const latency = Date.now() - start;
			logMemoryOp({
				letta_op: "store_memories",
				letta_latency_ms: latency,
				letta_agent_id: identityKey(identity),
				identity_kind: identity.kind,
				identity_value_prefix: maskIdentity(identity.value),
				namespace: identity.namespace,
				conversation_id: metadata.conversationId,
				entries_count: memories.length,
				channel: metadata.channel,
			});

			void recordMemoryEvent({
				conversationId: metadata.conversationId,
				lettaAgentId: identityKey(identity),
				eventType: "memory_stored",
				payload: {
					entries_count: memories.length,
					kinds: memories.map((m) => m.kind),
					block_patch_keys: Object.keys(metadata.blockPatch ?? {}),
				},
				latencyMs: latency,
			});
		} catch (err) {
			// Fire-and-forget — log e drop, nunca derruba o turno.
			logMemoryOp(
				{
					letta_op: "store_memories",
					letta_latency_ms: Date.now() - start,
					identity_kind: identity.kind,
					identity_value_prefix: maskIdentity(identity.value),
					conversation_id: metadata.conversationId,
					error: err instanceof Error ? err.message : String(err),
				},
				"warn",
			);
		}
	}

	/** Archival semântico — fase 2 opcional (pgvector). Hoje retorna [] (paridade
	 * com o archival morto do Letta). Read-side: nunca throw. */
	async searchArchival(
		_identity: UserIdentity,
		_query: string,
		_limit?: number,
	): Promise<ArchivalHit[]> {
		return [];
	}

	async reconcileIdentity(from: UserIdentity, to: UserIdentity): Promise<void> {
		const start = Date.now();
		try {
			const fromKey = identityKey(from);
			await db.transaction(async (tx) => {
				const [fromRow] = await tx
					.select()
					.from(memoryIdentities)
					.where(keyWhere(from))
					.for("update");
				if (!fromRow) return; // nada a migrar — idempotente

				const [toRow] = await tx.select().from(memoryIdentities).where(keyWhere(to)).for("update");

				const fromBlock = fromRow.block;
				const toBlock = toRow?.block ?? emptyHumanBlock(to);

				// Idempotência: destino já reconciliado desta origem → no-op.
				if (toBlock.reconciledFrom === fromKey) return;

				// Destino "vence" em campos sobrepostos; campos só da origem são
				// herdados (continuidade web → WhatsApp). Paridade com o Letta.
				const merged: HumanMemoryBlock = {
					...fromBlock,
					...toBlock,
					reconciledFrom: fromKey,
					channels: uniqueChannels(fromBlock.channels, toBlock.channels),
					objections: Array.from(
						new Set([...(fromBlock.objections ?? []), ...(toBlock.objections ?? [])]),
					),
				};

				await tx
					.insert(memoryIdentities)
					.values({
						namespace: to.namespace,
						kind: to.kind,
						value: to.value,
						block: merged,
						reconciledFrom: fromKey,
						lastInteractionAt: merged.lastInteractionAt ? new Date(merged.lastInteractionAt) : null,
					})
					.onConflictDoUpdate({
						target: [memoryIdentities.namespace, memoryIdentities.kind, memoryIdentities.value],
						set: { block: merged, reconciledFrom: fromKey, updatedAt: new Date() }, // real-time-intentional: coluna de auditoria (wall-clock)
					});
			});

			const latency = Date.now() - start;
			logMemoryOp({
				letta_op: "reconcile",
				letta_latency_ms: latency,
				letta_agent_id: identityKey(to),
				from_agent_id: fromKey,
				from_identity_kind: from.kind,
				to_identity_kind: to.kind,
			});
			void recordMemoryEvent({
				lettaAgentId: identityKey(to),
				eventType: "reconciled",
				payload: { from_agent_id: fromKey, from_kind: from.kind, to_kind: to.kind },
				latencyMs: latency,
			});
		} catch (err) {
			// Write-side best-effort — engole e loga.
			logMemoryOp(
				{
					letta_op: "reconcile",
					letta_latency_ms: Date.now() - start,
					identity_kind: from.kind,
					identity_value_prefix: maskIdentity(from.value),
					error: err instanceof Error ? err.message : String(err),
				},
				"warn",
			);
		}
	}

	async purgeIdentity(identity: UserIdentity): Promise<void> {
		const start = Date.now();
		try {
			await db.delete(memoryIdentities).where(keyWhere(identity));
			const latency = Date.now() - start;
			logMemoryOp({
				letta_op: "agent_purged",
				letta_latency_ms: latency,
				letta_agent_id: identityKey(identity),
				identity_kind: identity.kind,
				identity_value_prefix: maskIdentity(identity.value),
				namespace: identity.namespace,
			});
			void recordMemoryEvent({
				lettaAgentId: identityKey(identity),
				eventType: "purged",
				payload: { identity_kind: identity.kind, namespace: identity.namespace, reason: "reset" },
				latencyMs: latency,
			});
		} catch (err) {
			// Write-side best-effort (D17): engole erro transiente, só loga.
			logMemoryOp(
				{
					letta_op: "agent_purged",
					letta_latency_ms: Date.now() - start,
					identity_kind: identity.kind,
					identity_value_prefix: maskIdentity(identity.value),
					namespace: identity.namespace,
					error: err instanceof Error ? err.message : String(err),
				},
				"warn",
			);
		}
	}

	// ─── Privates ────────────────────────────────────────────────────────────

	private async findRow(identity: UserIdentity) {
		const [row] = await db.select().from(memoryIdentities).where(keyWhere(identity)).limit(1);
		return row ?? null;
	}
}

/** WHERE da chave de negócio (namespace, kind, value). */
function keyWhere(identity: UserIdentity) {
	return and(
		eq(memoryIdentities.namespace, identity.namespace),
		eq(memoryIdentities.kind, identity.kind),
		eq(memoryIdentities.value, identity.value),
	);
}

/**
 * Honra o contrato "loadContext SEMPRE retorna em < timeoutMs": corre a query
 * contra um timeout. No estouro, rejeita e o caller cai pro null. Postgres
 * local responde em ms; isto é a rede de segurança do contrato.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`memory loadContext timed out after ${timeoutMs}ms`)),
			timeoutMs,
		);
		promise.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			},
		);
	});
}
