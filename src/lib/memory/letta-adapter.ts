// src/lib/memory/letta-adapter.ts
//
// LettaMemoryAdapter — implementação real do MemoryAdapter contra Letta OSS.
// Acessa via REST (sem provider do AI SDK). Ver ADR 2026-05-16.

import type { MemoryAdapter } from "./adapter";
import { lettaFetch } from "./letta-client";
import type {
	ArchivalHit,
	HumanMemoryBlock,
	MemoryContext,
	MemoryEntry,
	StoreMetadata,
	UserIdentity,
} from "./types";
import { MemoryError, MemoryTimeoutError } from "./types";

// ─── Letta API types (subset que usamos) ────────────────────────────────────
// Validado contra Letta OSS v0.16.8 (openapi.json em http://localhost:8283).

interface LettaMemoryBlock {
	id: string;
	label: string;
	value: string;
	description?: string;
	limit?: number;
}

/**
 * Agent shape do Letta v1.x: `memory.blocks[]` é aninhado em `memory` (NÃO
 * é `memory_blocks` flat — esse campo existe mas vem null em GET).
 */
interface LettaAgent {
	id: string;
	name: string;
	memory: {
		blocks: LettaMemoryBlock[];
		file_blocks?: unknown[];
		prompt_template?: string;
	};
	tags?: string[];
	created_at: string;
}

/** Passage = entrada do archival memory (vector store). */
interface LettaPassage {
	id: string;
	text: string;
	tags?: string[] | null;
	created_at: string;
	archive_id?: string;
}

/**
 * Letta v0.16+ retorna `/search` como `{ results, count }`, com `content`
 * em vez de `text` e `timestamp` em vez de `created_at`. Sem score.
 */
interface LettaArchivalSearchResponse {
	results: Array<{
		id: string;
		content: string;
		timestamp: string;
		tags?: string[];
	}>;
	count: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";
const DEFAULT_EMBEDDING = "openai/text-embedding-3-small";
const HUMAN_BLOCK_LABEL = "human";

/**
 * Monta o nome canônico do agent Letta a partir de uma identity.
 * Formato: `<namespace>-<kind>-<safeValue>`
 * Phone E.164: sem `+` (Letta não aceita em nomes). Cookie: primeiros 16
 * chars (suficientes pra unicidade, evita name gigante).
 */
function agentNameFor(identity: UserIdentity): string {
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

function parseHumanBlock(block: LettaMemoryBlock | undefined): HumanMemoryBlock {
	if (!block?.value) return { schemaVersion: 1, objections: [], channels: [] };
	try {
		const parsed = JSON.parse(block.value) as Partial<HumanMemoryBlock>;
		return {
			schemaVersion: parsed.schemaVersion ?? 1,
			objections: parsed.objections ?? [],
			channels: parsed.channels ?? [],
			...parsed,
		};
	} catch {
		// Block existe mas não é JSON — pode ser conteúdo legado/manual.
		// Retorna struct vazio com `name` setado pro valor cru (informativo).
		return { schemaVersion: 1, objections: [], channels: [], name: block.value };
	}
}

function serializeHumanBlock(block: HumanMemoryBlock): string {
	return JSON.stringify(block, null, 2);
}

function daysBetween(isoA: string | undefined, isoB: Date): number | null {
	if (!isoA) return null;
	const a = new Date(isoA).getTime();
	if (Number.isNaN(a)) return null;
	const diffMs = isoB.getTime() - a;
	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class LettaMemoryAdapter implements MemoryAdapter {
	isPersistent(): boolean {
		return true;
	}

	async loadContext(
		identity: UserIdentity,
		options?: { timeoutMs?: number; archivalQuery?: string },
	): Promise<MemoryContext | null> {
		const timeoutMs = options?.timeoutMs ?? 2000;
		try {
			const agent = await this.findAgent(identity, timeoutMs);
			if (!agent) return null;

			const humanBlock = agent.memory.blocks.find((b) => b.label === HUMAN_BLOCK_LABEL);
			const block = parseHumanBlock(humanBlock);

			let archivalHits: ArchivalHit[] = [];
			if (options?.archivalQuery) {
				archivalHits = await this.searchArchivalByAgentId(agent.id, options.archivalQuery, 5, timeoutMs).catch(
					() => [],
				);
			}

			return {
				agentId: agent.id,
				block,
				archivalHits,
				daysSinceLastInteraction: daysBetween(block.lastInteractionAt, new Date()),
			};
		} catch (err) {
			// Circuit breaker: read-side NUNCA throw — log e devolve null.
			if (err instanceof MemoryTimeoutError) {
				console.warn(
					`[memory] loadContext timeout (${timeoutMs}ms) for ${identity.kind}:${identity.value.slice(0, 8)}... — falling back to no memory`,
				);
			} else if (err instanceof MemoryError) {
				console.warn(`[memory] loadContext error: ${err.message}`);
			} else {
				console.warn("[memory] loadContext unexpected error", err);
			}
			return null;
		}
	}

	async storeMemories(
		identity: UserIdentity,
		memories: MemoryEntry[],
		metadata: StoreMetadata,
	): Promise<void> {
		try {
			const agent = await this.findOrCreateAgent(identity);

			// 1. Inserir cada memory entry no archival
			for (const entry of memories) {
				await this.insertArchival(agent.id, entry).catch((err) => {
					console.warn(`[memory] insertArchival failed for ${entry.kind}: ${String(err)}`);
				});
			}

			// 2. Aplicar blockPatch + lastInteractionAt
			const currentBlock = parseHumanBlock(
				agent.memory.blocks.find((b) => b.label === HUMAN_BLOCK_LABEL),
			);
			const updatedBlock: HumanMemoryBlock = {
				...currentBlock,
				...(metadata.blockPatch ?? {}),
				lastInteractionAt: new Date().toISOString(),
				channels: Array.from(
					new Set([...(currentBlock.channels ?? []), metadata.channel]),
				) as ("web" | "whatsapp")[],
				objections: metadata.blockPatch?.objections
					? Array.from(new Set([...(currentBlock.objections ?? []), ...metadata.blockPatch.objections]))
					: currentBlock.objections,
			};

			await this.updateHumanBlock(agent.id, updatedBlock).catch((err) => {
				console.warn(`[memory] updateHumanBlock failed: ${String(err)}`);
			});
		} catch (err) {
			// Fire-and-forget — log e drop.
			console.warn(`[memory] storeMemories error for ${agentNameFor(identity)}: ${String(err)}`);
		}
	}

	async searchArchival(
		identity: UserIdentity,
		query: string,
		limit = 5,
	): Promise<ArchivalHit[]> {
		try {
			const agent = await this.findAgent(identity, 2000);
			if (!agent) return [];
			return await this.searchArchivalByAgentId(agent.id, query, limit, 2000);
		} catch {
			return [];
		}
	}

	async reconcileIdentity(from: UserIdentity, to: UserIdentity): Promise<void> {
		const fromAgent = await this.findAgent(from, 2000);
		if (!fromAgent) return; // nada a migrar

		const toAgent = await this.findOrCreateAgent(to);

		// Idempotência: se o destino já tem `reconciledFrom == fromAgent.id`,
		// pula (não copia de novo).
		const toBlock = parseHumanBlock(
			toAgent.memory.blocks.find((b) => b.label === HUMAN_BLOCK_LABEL),
		);
		if (toBlock.reconciledFrom === fromAgent.id) return;

		// Copia archival do origem pro destino
		const archival = await this.listArchival(fromAgent.id);
		for (const entry of archival) {
			await this.insertArchival(toAgent.id, {
				text: entry.text,
				kind: "fact",
				metadata: { tags: [...(entry.tags ?? []), `migrated:${fromAgent.id}`] },
			}).catch((err) => {
				console.warn(`[memory] reconcile insert failed: ${String(err)}`);
			});
		}

		// Atualiza block do destino com reconciledFrom + campos preservados
		const fromBlock = parseHumanBlock(
			fromAgent.memory.blocks.find((b) => b.label === HUMAN_BLOCK_LABEL),
		);
		const merged: HumanMemoryBlock = {
			...fromBlock,
			...toBlock, // destino "vence" em campos sobrepostos
			reconciledFrom: fromAgent.id,
			channels: Array.from(
				new Set([...(fromBlock.channels ?? []), ...(toBlock.channels ?? [])]),
			) as ("web" | "whatsapp")[],
			objections: Array.from(
				new Set([...(fromBlock.objections ?? []), ...(toBlock.objections ?? [])]),
			),
		};
		await this.updateHumanBlock(toAgent.id, merged);
	}

	// ─── Privates ────────────────────────────────────────────────────────────

	private async findAgent(identity: UserIdentity, timeoutMs: number): Promise<LettaAgent | null> {
		const name = agentNameFor(identity);
		const list = await lettaFetch<LettaAgent[]>(
			`/v1/agents/?name=${encodeURIComponent(name)}`,
			{ timeoutMs },
		);
		return list.find((a) => a.name === name) ?? null;
	}

	private async findOrCreateAgent(identity: UserIdentity): Promise<LettaAgent> {
		const existing = await this.findAgent(identity, 2000);
		if (existing) return existing;

		const name = agentNameFor(identity);
		const initialBlock = emptyHumanBlock(identity);

		const created = await lettaFetch<LettaAgent>("/v1/agents/", {
			method: "POST",
			timeoutMs: 5000, // criação é mais lenta que lookups
			body: JSON.stringify({
				name,
				model: process.env.LETTA_MODEL ?? DEFAULT_MODEL,
				embedding: process.env.LETTA_EMBEDDING ?? DEFAULT_EMBEDDING,
				memory_blocks: [
					{
						label: HUMAN_BLOCK_LABEL,
						description: "JSON-serialized state about the user (aja-agora HumanMemoryBlock schema)",
						value: serializeHumanBlock(initialBlock),
						limit: 4000,
					},
				],
				tags: [
					`namespace:${identity.namespace}`,
					`kind:${identity.kind}`,
					"app:aja-agora",
				],
			}),
		});
		return created;
	}

	private async updateHumanBlock(agentId: string, block: HumanMemoryBlock): Promise<void> {
		// Letta API: PATCH /v1/agents/{id}/core-memory/blocks/{label}
		// Body: { value: string }
		await lettaFetch<unknown>(
			`/v1/agents/${agentId}/core-memory/blocks/${HUMAN_BLOCK_LABEL}`,
			{
				method: "PATCH",
				body: JSON.stringify({ value: serializeHumanBlock(block) }),
			},
		);
	}

	private async insertArchival(agentId: string, entry: MemoryEntry): Promise<void> {
		// Schema CreateArchivalMemory: { text, tags?, created_at? }
		// Não há campo `metadata` na API REST — usa-se tags pra categorizar.
		// Embedding é gerado pelo Letta no POST (pode levar segundos), por isso
		// timeout maior aqui.
		const customTags = (entry.metadata?.tags as string[] | undefined) ?? [];
		await lettaFetch<LettaPassage>(`/v1/agents/${agentId}/archival-memory`, {
			method: "POST",
			timeoutMs: 8000,
			body: JSON.stringify({
				text: entry.text,
				tags: [entry.kind, ...customTags],
			}),
		});
	}

	private async searchArchivalByAgentId(
		agentId: string,
		query: string,
		limit: number,
		timeoutMs: number,
	): Promise<ArchivalHit[]> {
		const params = new URLSearchParams({ query, top_k: String(limit) });
		const resp = await lettaFetch<LettaArchivalSearchResponse>(
			`/v1/agents/${agentId}/archival-memory/search?${params}`,
			{ timeoutMs },
		);
		return resp.results.map((h) => ({
			id: h.id,
			text: h.content,
			score: 0, // Letta search não retorna score numérico — só ordena por relevância
			createdAt: h.timestamp,
			metadata: h.tags ? { tags: h.tags } : undefined,
		}));
	}

	private async listArchival(agentId: string): Promise<LettaPassage[]> {
		return lettaFetch<LettaPassage[]>(
			`/v1/agents/${agentId}/archival-memory?limit=999`,
		);
	}
}
