// src/lib/memory/orchestrator-bridge.ts
//
// Bridge entre o orquestrador (src/lib/agent/orchestrator/index.ts) e a
// camada de memória. Encapsula:
// 1. Resolução de identidade a partir do contexto da conversa
// 2. Load do contexto pré-turno (com timeout/circuit breaker)
// 3. Extração + store assíncrono pós-turno
//
// Mantém a logica de memória fora do orquestrador propriamente dito —
// import do bridge é 1 só.

import type { ProducedArtifact } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";

import { extractMemoriesFromTurn } from "./extractor";
import {
	getNamespace,
	identityFromCookie,
	identityFromWaId,
	shouldCreateAnonAgent,
} from "./identity";
import { getMemoryAdapter } from "./index";
import { buildMemorySystemMessage } from "./reactivation";
import type { MemoryContext, UserIdentity } from "./types";

// ─── Identidade ─────────────────────────────────────────────────────────────

interface ResolveIdentityInput {
	channel: "web" | "whatsapp";
	conv: { waId?: string | null } | null | undefined;
	userKey?: string; // cookie value pro web anônimo
	userTurnCount: number; // pra threshold de engajamento (N=3)
}

/**
 * Resolve a identidade do usuário do turno atual. Retorna `null` quando
 * não há identidade utilizável agora (ex: web sem cookie ainda, ou
 * engajamento abaixo do threshold pra criar agent anônimo).
 *
 * Regras:
 * - whatsapp: sempre tem `waId` → phone identity (criação imediata)
 * - web: precisa `userKey` (cookie) E `userTurnCount >= 3` pra justificar
 *   criar agent. Antes disso, retorna null (sem memória).
 */
export function resolveIdentityForTurn(input: ResolveIdentityInput): UserIdentity | null {
	const { channel, conv, userKey, userTurnCount } = input;
	const namespace = getNamespace();

	if (channel === "whatsapp") {
		const waId = conv?.waId;
		if (!waId) return null;
		try {
			return identityFromWaId(waId, namespace);
		} catch {
			return null;
		}
	}

	// channel === "web"
	if (!userKey) return null;
	if (!shouldCreateAnonAgent(userTurnCount)) return null;
	try {
		return identityFromCookie(userKey, namespace);
	} catch {
		return null;
	}
}

// ─── Load context ───────────────────────────────────────────────────────────

interface LoadContextInput {
	identity: UserIdentity | null;
	userText: string;
}

/**
 * Carrega contexto de memória pra prepend ao prompt. Aplica timeout 2s
 * (do contrato MemoryAdapter). Em qualquer erro, retorna null.
 */
export async function loadMemoryContextForTurn(
	input: LoadContextInput,
): Promise<MemoryContext | null> {
	const { identity, userText } = input;
	if (!identity) return null;

	const adapter = getMemoryAdapter();
	if (!adapter.isPersistent()) return null;

	return adapter.loadContext(identity, {
		timeoutMs: 2000,
		archivalQuery: userText.slice(0, 200),
	});
}

/**
 * Converte um MemoryContext em system message pronto pra prepend, ou null.
 */
export function memorySystemMessageFromContext(
	context: MemoryContext | null,
): { role: "system"; content: string } | null {
	const text = buildMemorySystemMessage(context);
	if (!text) return null;
	return { role: "system", content: text };
}

// ─── Store pós-turno ────────────────────────────────────────────────────────

interface StoreInput {
	identity: UserIdentity | null;
	artifacts: ProducedArtifact[];
	meta: ConversationMetadata;
	channel: "web" | "whatsapp";
	userText: string;
	conversationId: string;
}

/**
 * Extrai memórias do turno e dispara store. **Fire-and-forget** — caller
 * NÃO deve `await`. Retorna a Promise pra quem quiser observar/instrumentar.
 *
 * Implementação:
 * - Se `identity` é null, no-op silencioso.
 * - Extrai entries + blockPatch via heurística (extractor.ts).
 * - Se nada foi extraído E não houve interação relevante, ainda assim
 *   atualiza `lastInteractionAt` no block (touch).
 */
export function storeMemoriesForTurn(input: StoreInput): Promise<void> {
	const { identity, artifacts, meta, channel, userText, conversationId } = input;
	if (!identity) return Promise.resolve();

	const adapter = getMemoryAdapter();
	if (!adapter.isPersistent()) return Promise.resolve();

	const { entries, blockPatch } = extractMemoriesFromTurn({
		artifacts,
		meta,
		channel,
		userText,
	});

	return adapter
		.storeMemories(identity, entries, {
			conversationId,
			channel,
			blockPatch,
		})
		.catch((err) => {
			console.warn(`[memory-bridge] storeMemories failed conv=${conversationId}: ${String(err)}`);
		});
}
