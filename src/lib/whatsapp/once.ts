// Idempotência do canal WhatsApp — "isso só pode acontecer UMA vez".
//
// Primitiva única (`claimOnce`) em cima de `whatsapp_once_keys`: quem consegue
// INSERIR a chave ganha o direito de executar; quem esbarra no conflito é
// duplicata e não executa. Vale entre processos/tasks (o estado é o Postgres,
// não memória do processo).
//
// FAIL-OPEN por decisão: se o banco der erro, `claimOnce` devolve `true` (deixa
// acontecer). Infraestrutura de idempotência nunca pode ser o motivo de um
// cliente real ficar sem resposta — o pior caso vira o comportamento de hoje
// (possível duplicata), nunca silêncio.

import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { whatsappOnceKeys } from "@/db/schema";

export type OnceScope = "inbound" | "beat" | "click";

/**
 * Reivindica `key` para este executor.
 *
 * @param windowMs quando informado, a chave EXPIRA: uma nova reivindicação
 *   passa a ser aceita depois desse tempo (usado no guard de clique duplo —
 *   clicar de novo 1 minuto depois é intenção real, clicar de novo em 2s é
 *   dedo ansioso porque o botão do WhatsApp não desabilita). Sem ele a chave é
 *   permanente (dedupe de messageId da Meta, beat de contexto).
 * @returns `true` se ESTE chamador ganhou (pode executar); `false` se já estava
 *   reivindicada (duplicata — não executa).
 */
export async function claimOnce(
	key: string,
	scope: OnceScope,
	windowMs?: number,
): Promise<boolean> {
	try {
		if (windowMs && windowMs > 0) {
			const cutoff = new Date(Date.now() - windowMs);
			const rows = await db
				.insert(whatsappOnceKeys)
				.values({ key, scope })
				.onConflictDoUpdate({
					target: whatsappOnceKeys.key,
					set: { createdAt: sql`now()` },
					setWhere: lt(whatsappOnceKeys.createdAt, cutoff),
				})
				.returning({ key: whatsappOnceKeys.key });
			return rows.length > 0;
		}
		const rows = await db
			.insert(whatsappOnceKeys)
			.values({ key, scope })
			.onConflictDoNothing()
			.returning({ key: whatsappOnceKeys.key });
		return rows.length > 0;
	} catch (err) {
		console.warn(`[whatsapp-once] falha ao reivindicar "${key}" (fail-open, segue):`, err);
		return true;
	}
}

/** Dedupe da reentrega de webhook da Meta — `message.id` é único por mensagem. */
export function claimInboundMessage(messageId: string): Promise<boolean> {
	return claimOnce(`inbound:${messageId}`, "inbound");
}

/** Beat de contexto determinístico do canal (aviso LGPD / educação): UMA vez por
 * conversa e gate. */
export function claimContextBeat(conversationId: string, gate: string): Promise<boolean> {
	return claimOnce(`beat:${conversationId}:${gate}`, "beat");
}

/** Janela do guard de clique duplo. Cobre as pausas de cadência do adapter
 * (POST_INTERACTIVE_PAUSE_MS + typing delay) com folga — depois dela, clicar de
 * novo volta a ser intenção real do usuário. */
export const DOUBLE_CLICK_WINDOW_MS = 12_000;

/** Clique de botão: `false` = o MESMO botão foi clicado há segundos (clique
 * duplo, não intenção nova). Chaveado pelo `waId` porque o guard mora na PORTA
 * do canal, antes de a conversa ser resolvida. */
export function claimButtonClick(waId: string, replyId: string): Promise<boolean> {
	return claimOnce(`click:${waId}:${replyId}`, "click", DOUBLE_CLICK_WINDOW_MS);
}
