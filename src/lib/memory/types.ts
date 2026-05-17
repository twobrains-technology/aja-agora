// src/lib/memory/types.ts
//
// Tipos da camada de memória persistente cross-channel. Ver ADR
// 2026-05-16-aja-agora-letta-sidecar-integration.

import type { ConsorcioCategory } from "@/lib/adapters/types";

// ─── Identidade ─────────────────────────────────────────────────────────────

export type IdentityKind = "phone" | "email" | "anon-cookie";

/**
 * Identifica uma pessoa real no Letta. O `kind` determina como a chave foi
 * obtida; o `value` é o identificador (E.164 pra phone, hash do cookie pra
 * anon, etc.); o `namespace` separa ambientes (prod/dev/local-<workspace>).
 */
export interface UserIdentity {
	kind: IdentityKind;
	value: string;
	namespace: string;
}

// ─── Lead stage (espelha enum do schema Drizzle) ────────────────────────────

export type LeadStage =
	| "novo"
	| "engajado"
	| "qualificado"
	| "em_negociacao"
	| "proposta_enviada"
	| "fechado_ganho"
	| "perdido";

// ─── Memory block "human" ───────────────────────────────────────────────────

/**
 * JSON serializado no memory_block "human" do Letta. Tudo é opcional pra
 * tolerar agents antigos (queries defensive). `schemaVersion` permite
 * migração lazy se o schema evoluir.
 */
export interface HumanMemoryBlock {
	schemaVersion: 1;

	// Identidade
	name?: string;
	phone?: string;
	email?: string;

	// Estado de jornada
	stage?: LeadStage;
	lastInteractionAt?: string; // ISO 8601
	channels?: ("web" | "whatsapp")[];

	// Domínio
	category?: ConsorcioCategory;
	creditMin?: number;
	creditMax?: number;
	termMonthsPreferred?: number;
	monthlyBudget?: number;

	// Histórico recente
	lastSimulation?: {
		creditValue: number;
		termMonths: number;
		monthlyPrice: number;
		date: string;
	};
	lastRecommendation?: {
		label: string;
		groupId: string;
		date: string;
	};

	// Sinais
	objections?: string[];
	expertiseLevel?: "first" | "experienced";

	// Audit
	reconciledFrom?: string; // agent.id de origem em caso de merge
}

// ─── Context retornado por loadContext ──────────────────────────────────────

export interface MemoryContext {
	agentId: string;
	block: HumanMemoryBlock;
	archivalHits: ArchivalHit[];
	/**
	 * Dias desde lastInteractionAt. null se primeira interação.
	 * Computado em loadContext pra evitar drift de relógio.
	 */
	daysSinceLastInteraction: number | null;
}

// ─── Fatos extraídos do turno ───────────────────────────────────────────────

export type MemoryEntryKind =
	| "fact"
	| "preference"
	| "objection"
	| "simulation"
	| "recommendation"
	| "summary";

/**
 * Unidade que será persistida no archival (busca semântica) e potencialmente
 * refletida no memory_block via `StoreMetadata.blockPatch`.
 */
export interface MemoryEntry {
	text: string;
	kind: MemoryEntryKind;
	metadata?: Record<string, unknown>;
}

// ─── Archival hit ───────────────────────────────────────────────────────────

export interface ArchivalHit {
	id: string;
	text: string;
	score: number;
	createdAt: string;
	metadata?: Record<string, unknown>;
}

// ─── Metadados de store ─────────────────────────────────────────────────────

export interface StoreMetadata {
	conversationId: string;
	channel: "web" | "whatsapp";
	/**
	 * Atualizações específicas do memory_block "human" pra mesclar.
	 * Adapter faz read-modify-write; campos undefined preservam valor atual.
	 */
	blockPatch?: Partial<HumanMemoryBlock>;
}

// ─── Erros ──────────────────────────────────────────────────────────────────

export class MemoryError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "MemoryError";
	}
}

export class MemoryTimeoutError extends MemoryError {
	constructor(operation: string, timeoutMs: number) {
		super(`Memory operation "${operation}" timed out after ${timeoutMs}ms`);
		this.name = "MemoryTimeoutError";
	}
}
