// Serialização de turno por conversa (wa_id) no canal WhatsApp.
//
// O PROBLEMA: o turno do WhatsApp é longo por design (pausas de cadência de
// 1,2s a 1,8s entre balões + typing delay + a chamada do modelo). O cliente
// manda "quero um carro" e logo em seguida "uns 90 mil" — comportamento
// normalíssimo no canal. Sem serialização, os dois turnos rodam AO MESMO TEMPO
// sobre a mesma conversa: os balões chegam intercalados fora de ordem e, pior,
// `persistMeta` é um read-modify-write do objeto de metadata INTEIRO, então o
// segundo turno sobrescreve cegamente o que o primeiro escreveu (lost update —
// o valor some e o agente re-pergunta).
//
// A SOLUÇÃO: lease por wa_id no Postgres (`whatsapp_conversation_locks`), não
// transação longa — funciona entre processos/tasks e expira sozinho se um
// processo morrer no meio. Quem não consegue o lease ESPERA (a mensagem não é
// descartada) e roda logo depois, na ordem em que chegou.
//
// FAIL-OPEN por decisão: erro de banco ou espera longa demais NÃO bloqueiam a
// resposta ao cliente — segue sem o lease, com log. A pior falha possível deste
// arquivo é voltar ao comportamento de hoje, nunca deixar alguém sem resposta.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { whatsappConversationLocks } from "@/db/schema";

/** Validade do lease. Renovado enquanto o turno roda; se o processo cair, outro
 * turno assume depois disso em vez de a conversa travar pra sempre. */
const LOCK_TTL_MS = 60_000;
const RENEW_EVERY_MS = 20_000;
const POLL_MS = 350;
/** Teto de espera pela vez. Estourou → segue mesmo assim (fail-open). */
const ACQUIRE_TIMEOUT_MS = 90_000;

/** wa_ids cujo lease já é detido NESTE fluxo assíncrono — reentrância. Sem isto,
 * `processInteractiveReply` → `processTextMessage` (fallback) esperaria por um
 * lease que ele mesmo detém = deadlock até o teto. */
const heldLocks = new AsyncLocalStorage<Set<string>>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function tryAcquire(waId: string, holder: string): Promise<boolean> {
	const now = new Date();
	const lockedUntil = new Date(now.getTime() + LOCK_TTL_MS);
	const rows = await db
		.insert(whatsappConversationLocks)
		.values({ waId, holder, lockedUntil })
		// Só rouba o lease de quem já EXPIROU (processo morto). Lease vivo de
		// outro turno → nenhuma linha volta e a gente espera a vez.
		.onConflictDoUpdate({
			target: whatsappConversationLocks.waId,
			set: { holder, lockedUntil, updatedAt: now },
			setWhere: lt(whatsappConversationLocks.lockedUntil, now),
		})
		.returning({ waId: whatsappConversationLocks.waId });
	return rows.length > 0;
}

async function renew(waId: string, holder: string): Promise<void> {
	await db
		.update(whatsappConversationLocks)
		.set({ lockedUntil: new Date(Date.now() + LOCK_TTL_MS), updatedAt: new Date() })
		.where(
			and(eq(whatsappConversationLocks.waId, waId), eq(whatsappConversationLocks.holder, holder)),
		);
}

async function release(waId: string, holder: string): Promise<void> {
	await db
		.delete(whatsappConversationLocks)
		.where(
			and(eq(whatsappConversationLocks.waId, waId), eq(whatsappConversationLocks.holder, holder)),
		);
}

/**
 * Roda `fn` com exclusividade sobre a conversa do `waId`. Reentrante: chamadas
 * aninhadas no mesmo fluxo rodam direto, sem re-adquirir.
 */
export async function withConversationLock<T>(waId: string, fn: () => Promise<T>): Promise<T> {
	const current = heldLocks.getStore();
	if (current?.has(waId)) return fn();

	const holder = randomUUID();
	const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
	let acquired = false;
	let waited = false;
	try {
		while (Date.now() < deadline) {
			if (await tryAcquire(waId, holder)) {
				acquired = true;
				break;
			}
			waited = true;
			await sleep(POLL_MS);
		}
	} catch (err) {
		console.warn(`[whatsapp-lock] falha ao adquirir lease de ${waId} (fail-open, segue):`, err);
	}

	if (!acquired) {
		console.warn(
			`[whatsapp-lock] seguindo SEM lease para ${waId} (${waited ? "espera estourou o teto" : "indisponível"}) — turnos podem concorrer`,
		);
	}

	const renewTimer = acquired
		? setInterval(() => {
				renew(waId, holder).catch((err) =>
					console.warn(`[whatsapp-lock] falha ao renovar lease de ${waId}:`, err),
				);
			}, RENEW_EVERY_MS)
		: null;
	renewTimer?.unref?.();

	const store = new Set(current ?? []);
	store.add(waId);
	try {
		return await heldLocks.run(store, fn);
	} finally {
		if (renewTimer) clearInterval(renewTimer);
		if (acquired) {
			await release(waId, holder).catch((err) =>
				console.warn(`[whatsapp-lock] falha ao soltar lease de ${waId}:`, err),
			);
		}
	}
}
