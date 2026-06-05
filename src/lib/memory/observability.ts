// src/lib/memory/observability.ts
//
// Logging estruturado JSON + audit em memory_events pra camada de memória.
// Ver ADR 2026-05-16 — decisão #11: só logs por enquanto (alarms CloudWatch
// ficam pra fase 2 quando tivermos tráfego pra calibrar thresholds).

import { db } from "@/db";
import { memoryEvents } from "@/db/schema";

export type MemoryOp =
	| "load_context"
	| "store_memories"
	| "search_archival"
	| "reconcile"
	| "health_check"
	| "fallback_triggered"
	| "agent_created"
	| "agent_purged";

export interface MemoryLogPayload {
	letta_op: MemoryOp;
	letta_latency_ms?: number;
	letta_fallback?: boolean;
	letta_agent_id?: string;
	identity_kind?: "phone" | "anon-cookie" | "email";
	identity_value_prefix?: string; // primeiros 8 chars pra debug sem PII completa
	conversation_id?: string;
	namespace?: string;
	error?: string;
	[extra: string]: unknown;
}

/**
 * Emite uma linha JSON com campos canônicos. Em produção (NODE_ENV=production)
 * stdout vai pro CloudWatch via awslogs driver do ECS. Em dev, fica visível
 * no terminal do npm run dev.
 */
export function logMemoryOp(
	payload: MemoryLogPayload,
	level: "info" | "warn" | "error" = "info",
): void {
	const line = JSON.stringify({
		level,
		ts: new Date().toISOString(),
		source: "memory",
		...payload,
	});
	if (level === "error") console.error(line);
	else if (level === "warn") console.warn(line);
	else console.log(line);
}

/**
 * Mascara um identifier sensível mostrando só os primeiros 8 chars.
 * Pra PII no log sem expor número/cookie inteiro.
 */
export function maskIdentity(value: string): string {
	return value.slice(0, 8);
}

// ─── Audit em memory_events ─────────────────────────────────────────────────

export type MemoryEventType =
	| "agent_created"
	| "context_loaded"
	| "memory_stored"
	| "reconciled"
	| "fallback_triggered"
	| "purged";

export interface RecordEventInput {
	conversationId?: string | null;
	lettaAgentId?: string | null;
	eventType: MemoryEventType;
	payload?: Record<string, unknown>;
	latencyMs?: number;
}

/**
 * Persiste evento na tabela `memory_events` pra audit/observability futuro.
 * Idempotente em erros (engole exceção e loga warn). Não bloqueia caller.
 *
 * Use pra rastrear: agent_created (lazy first-time), reconciled (merge web→phone),
 * fallback_triggered (Letta indisponível, caiu pro Noop), purged (cleanup 365d).
 */
export async function recordMemoryEvent(input: RecordEventInput): Promise<void> {
	try {
		await db.insert(memoryEvents).values({
			conversationId: input.conversationId ?? null,
			lettaAgentId: input.lettaAgentId ?? null,
			eventType: input.eventType,
			payload: input.payload ?? null,
			latencyMs: input.latencyMs ?? null,
		});
	} catch (err) {
		logMemoryOp(
			{
				letta_op: input.eventType === "agent_created" ? "agent_created" : "store_memories",
				error: `recordMemoryEvent failed: ${String(err)}`,
			},
			"warn",
		);
	}
}
