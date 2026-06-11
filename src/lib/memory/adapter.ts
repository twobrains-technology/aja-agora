// src/lib/memory/adapter.ts
//
// Interface do MemoryAdapter — abstração sobre o store de memória persistente
// cross-channel. Implementações: LettaMemoryAdapter (real), NoopMemoryAdapter
// (testes + circuit breaker em runtime). Ver ADR 2026-05-16.

import type { ArchivalHit, MemoryContext, MemoryEntry, StoreMetadata, UserIdentity } from "./types";

/**
 * Contrato de qualquer backend de memória usado pelo orchestrator.
 *
 * Garantias de implementação:
 * - Todos os métodos devem respeitar timeout interno (default 2s).
 *   Em caso de timeout/erro de rede, métodos read-side (loadContext,
 *   searchArchival) retornam `null`/`[]` em vez de throw — o orchestrator
 *   trata como "sem memória" e segue.
 * - Métodos write-side (storeMemories, reconcileIdentity) podem throw em
 *   erros de programação (ex: identity inválida), mas devem **engolir**
 *   erros transientes (rede, 5xx) e apenas logar. Chamadas são
 *   fire-and-forget.
 * - Implementações são thread-safe — múltiplos turnos concorrentes podem
 *   chamar simultaneamente sem corrupção.
 */
export interface MemoryAdapter {
	/**
	 * Carrega contexto de memória pra uma identidade. Chamado ANTES do turno.
	 * Retorna `null` se agent ainda não existe OU se o backend tá indisponível.
	 *
	 * `loadContext` SEMPRE retorna em < `timeoutMs` (default 2000). Se não
	 * conseguir, retorna null silenciosamente (o orchestrator continua sem
	 * memória).
	 */
	loadContext(
		identity: UserIdentity,
		options?: { timeoutMs?: number; archivalQuery?: string },
	): Promise<MemoryContext | null>;

	/**
	 * Persiste fatos novos do turno. Chamado DEPOIS do stream (fire-and-forget).
	 * Não throw em erros transientes — log e drop.
	 *
	 * Comportamento:
	 * 1. Inserts cada entry em `archival_memory` do agent (uma op REST por entry).
	 * 2. Aplica `metadata.blockPatch` ao memory_block "human" via read-modify-write.
	 *    `lastInteractionAt` é sempre setado pelo adapter (hora atual).
	 * 3. Se o agent não existe, **cria lazy** com identity + block inicial vazio.
	 */
	storeMemories(
		identity: UserIdentity,
		memories: MemoryEntry[],
		metadata: StoreMetadata,
	): Promise<void>;

	/**
	 * Busca semântica no archival. Read-side — retorna `[]` em timeout/erro.
	 */
	searchArchival(identity: UserIdentity, query: string, limit?: number): Promise<ArchivalHit[]>;

	/**
	 * Reconcilia identidade temporária (ex: anon-cookie) numa permanente
	 * (ex: phone). Copia archival do agent de origem pro destino, aplica
	 * `reconciledFrom` no block do destino, marca origem como migrada.
	 * Idempotente — chamar 2x não duplica memórias.
	 */
	reconcileIdentity(from: UserIdentity, to: UserIdentity): Promise<void>;

	/**
	 * Apaga o agent de memória da identidade (D17 — /reset web). Write-side:
	 * engole erros transientes (rede, 5xx) e apenas loga — best-effort, nunca
	 * bloqueia o reset. Agent inexistente = no-op silencioso. Idempotente.
	 */
	purgeIdentity(identity: UserIdentity): Promise<void>;

	/**
	 * Indica se este adapter realmente persiste. NoopAdapter retorna false.
	 * Usado pelo orchestrator pra decidir se vale a pena coletar dados.
	 */
	isPersistent(): boolean;
}
