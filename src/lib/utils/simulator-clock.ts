// src/lib/utils/simulator-clock.ts
//
// Clock virtual por conversa simulada. Permite avançar o tempo dentro de um
// scope `runWithSimulatorClock(ctx, fn)` — qualquer `simulatorNow()` chamado
// dentro do scope retorna `new Date(Date.now() + ctx.offsetMs)`. Fora do scope,
// retorna `new Date()` puro (comportamento idêntico ao caminho real).
//
// Ver `docs/specs/2026-05-17-simulator-time-travel-design.md`.

import { AsyncLocalStorage } from "node:async_hooks";

export interface ClockContext {
	/** Offset em milissegundos a somar a `Date.now()`. Sempre ≥ 0 em uso normal. */
	offsetMs: number;
	/** Conversation id (debug/log; não usado pra lógica). */
	conversationId: string;
}

const als = new AsyncLocalStorage<ClockContext>();

/**
 * Roda `fn` dentro de um scope onde `simulatorNow()` aplica o offset. ALS
 * propaga por todos os `await`/promises encadeados dentro do scope, incluindo
 * fire-and-forget (a promise interna mantém o contexto enquanto resolve).
 */
export function runWithSimulatorClock<T>(ctx: ClockContext, fn: () => T): T {
	return als.run(ctx, fn);
}

/**
 * Retorna `Date` "agora" — afetado pelo offset se houver scope ativo.
 * Fora de scope: retorna `new Date()` puro. Seguro pra usar em qualquer
 * código; em path real, o resultado é idêntico a `new Date()`.
 */
export function simulatorNow(): Date {
	const ctx = als.getStore();
	return ctx ? new Date(Date.now() + ctx.offsetMs) : new Date();
}

/** Offset corrente em ms (0 fora de scope). */
export function getCurrentClockOffset(): number {
	return als.getStore()?.offsetMs ?? 0;
}
