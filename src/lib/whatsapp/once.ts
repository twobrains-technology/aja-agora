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

import { inArray, lt, sql } from "drizzle-orm";
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

/** Consumo PERSISTIDO do atalho de resposta rápida do WEB.
 *
 * O `quick_reply` só sumia por estado LOCAL do componente (`submitted`) —
 * recarregar a página devolvia o botão, e o cliente clica de novo (medido em
 * produção, 21/09/2026: no segundo clique o agente respondeu seco que o
 * formulário já estava na tela). Aqui a chave é PERMANENTE (sem janela: não é
 * dedo ansioso, é o mesmo atalho já usado) e chaveada por
 * `conversationId + replyId`. O `replyId` é gerado pelo SERVIDOR na emissão do
 * card e viaja dentro do payload do artifact, então é idêntico antes e depois
 * do reload.
 *
 * Mesma primitiva/tabela do WhatsApp (`claimOnce`) — nenhuma tabela nova. */
export function claimQuickReplyConsumption(
	conversationId: string,
	replyId: string,
): Promise<boolean> {
	return claimOnce(`click:${conversationId}:${replyId}`, "click");
}

/** Quais destes atalhos JÁ foram consumidos nesta conversa. Leitura para o
 * render não devolver o botão depois do reload. Fail-open de leitura (erro de
 * banco devolve lista vazia = comportamento de hoje, o botão aparece). */
export async function consumedQuickReplies(
	conversationId: string,
	replyIds: readonly string[],
): Promise<string[]> {
	if (replyIds.length === 0) return [];
	const chaves = replyIds.map((id) => `click:${conversationId}:${id}`);
	try {
		const linhas = await db
			.select({ key: whatsappOnceKeys.key })
			.from(whatsappOnceKeys)
			.where(inArray(whatsappOnceKeys.key, chaves));
		const presentes = new Set(linhas.map((l) => l.key));
		const consumidos: string[] = [];
		replyIds.forEach((id, i) => {
			if (presentes.has(chaves[i])) consumidos.push(id);
		});
		return consumidos;
	} catch (err) {
		console.warn("[whatsapp-once] falha ao ler consumo de atalhos (fail-open):", err);
		return [];
	}
}
