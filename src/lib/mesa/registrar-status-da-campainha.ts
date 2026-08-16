/**
 * O webhook de status da Meta, virando fato consultável.
 *
 * `sent` / `delivered` / `read` / `failed` já chegavam em
 * `/api/webhook/whatsapp` e viravam `console.log`. Nada era gravado — e por isso
 * "a campainha tocou?" não tinha resposta, o que fez o incidente de 14/08
 * parecer desatenção da mesa quando era a notificação levando 42 min para ser
 * entregue e 17h24 para ser lida.
 *
 * Só interessa o status de mensagem que É uma notificação de handoff: o `wamid`
 * é procurado em `handoff_notifications`, e status de qualquer outra mensagem é
 * ignorado em silêncio (o webhook recebe o status de TODA mensagem que o número
 * envia, inclusive as falas do agente ao cliente).
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { handoffNotifications } from "@/db/schema";
import { getLangfuseClient } from "@/lib/observability/langfuse/client";
import { ambienteLangfuse } from "@/lib/observability/langfuse/env";
import { scoresDaCampainha } from "./campainha";

export type StatusDaMeta = {
	id: string;
	status: string;
	timestamp?: string;
	errors?: Array<{ code?: number; title?: string }>;
};

/** O `timestamp` da Meta vem em segundos (string). Sem ele, agora. */
function instanteDoStatus(s: StatusDaMeta, agora: Date): Date {
	const segundos = Number(s.timestamp);
	return Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : agora;
}

/**
 * Grava o status e, quando ele fecha o ciclo da chamada, publica os sinais.
 *
 * Nunca lança: é observabilidade pendurada num webhook que a Meta re-tenta. Um
 * erro aqui não pode virar 500 e provocar reenvio em loop.
 */
export async function registrarStatusDaCampainha(
	status: StatusDaMeta,
	agora: Date = new Date(),
): Promise<"ignorado" | "atualizado"> {
	try {
		const [notificacao] = await db
			.select()
			.from(handoffNotifications)
			.where(eq(handoffNotifications.wamid, status.id))
			.limit(1);

		// Status de mensagem que não é notificação de handoff — o caso comum.
		if (!notificacao) return "ignorado";

		const quando = instanteDoStatus(status, agora);
		const patch: Partial<typeof handoffNotifications.$inferInsert> = {};

		if (status.status === "delivered" && !notificacao.deliveredAt) patch.deliveredAt = quando;
		if (status.status === "read" && !notificacao.readAt) patch.readAt = quando;
		if (status.status === "failed") {
			patch.failedAt = quando;
			const err = status.errors?.[0];
			patch.failureReason = err ? `${err.code ?? "?"} ${err.title ?? ""}`.trim() : "failed";
		}
		if (Object.keys(patch).length === 0) return "ignorado";

		await db
			.update(handoffNotifications)
			.set(patch)
			.where(eq(handoffNotifications.id, notificacao.id));

		publicarSinais({ ...notificacao, ...patch }, agora, notificacao.conversationId);
		return "atualizado";
	} catch (err) {
		console.error("[campainha] falha ao registrar status da notificação de handoff:", err);
		return "ignorado";
	}
}

function publicarSinais(
	n: {
		sentAt: Date;
		deliveredAt?: Date | null;
		readAt?: Date | null;
		failedAt?: Date | null;
		failureReason?: string | null;
		listenersNoHandoff: number | null;
	},
	agora: Date,
	conversationId: string,
): void {
	const scores = scoresDaCampainha(
		{
			sentAt: n.sentAt,
			deliveredAt: n.deliveredAt ?? null,
			readAt: n.readAt ?? null,
			failedAt: n.failedAt ?? null,
			failureReason: n.failureReason ?? null,
			listenersNoHandoff: n.listenersNoHandoff,
		},
		agora,
	);
	if (scores.length === 0) return;

	// Log estruturado SEMPRE, além do score: o webhook roda fora de qualquer
	// trace, e um alarme que dependa só do Langfuse morre junto com ele.
	console.log(
		JSON.stringify({
			source: "campainha",
			conversation_id: conversationId,
			scores: Object.fromEntries(scores.map((s) => [s.name, s.value])),
		}),
	);

	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scores) {
			// Score de SESSÃO: aqui não existe span ativo — o webhook da Meta não é
			// um turno de conversa. `sessionId` é o `conversationId`, o mesmo que o
			// `withLangfuseTurn` carimba nos traces.
			client.score.create({ ...score, sessionId: conversationId, environment });
		}
	} catch (err) {
		console.error("[campainha] publicação dos scores falhou (ignorado):", err);
	}
}
