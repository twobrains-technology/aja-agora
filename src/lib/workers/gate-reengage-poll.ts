// FIX-207 — worker de re-engajamento do funil parado (BullMQ).
//
// Rede de segurança pra CAUDA não-determinística do FIX-206: quando um turno de
// texto é classificado como dúvida/pergunta, `decideShowGate` suprime o próximo
// gate LEGITIMAMENTE e, se o usuário some, o funil fica parado. Este worker faz
// polling recorrente: varre conversas ATIVAS (WhatsApp + web) com um gate do
// funil pendente há mais que o teto de inatividade (GATE_REENGAGE_TIMEOUT_MS) e
// re-abre o funil. Espelha o proposal-status-poll (FIX-44): o ciclo
// (`runReengageCycle`) é testável SEM Redis (injeta clock + dublê de fireGate);
// o wiring BullMQ só é iniciado pelo entrypoint do worker.
//
// Entrega por canal (FIX-302): WhatsApp dispara o gate via `fireGate` (Meta Cloud
// API), sem mudança. Web não tem uma sessão SSE viva pra empurrar (o worker roda
// num processo separado do app — scripts/proposal-worker.ts — então o
// message-bus in-memory só entrega quando os dois processos coincidem; nunca
// depende disso) — persiste a mensagem de reengajamento na MESMA tabela de
// mensagens (`saveMessage`), disponível pro cliente no próximo GET
// /api/chat/resume sem reload manual. Gates de coleta obrigatória reusam a
// escada FIX-211 (`reengageQuestionForGate`) e RE-ARMAM o marcador até o teto de
// 4 tentativas (a 4ª já é a saída pro especialista — não re-arma depois).
//
// Idempotência: LIMPA o marcador ao disparar → dispara no máximo uma vez por
// pendência (exceto o re-arme controlado da escada web); só um novo turno de
// usuário ou o próprio re-arme re-marca. fireGate tem seus próprios guards
// (consent → consentOffered etc.).

import type { ConnectionOptions } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
	isMandatoryCollectionGate,
	NON_REENGAGE_GATES,
	reengageQuestionForGate,
	shouldReengageGate,
} from "@/lib/agent/gate-reengage";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { nextGate } from "@/lib/agent/qualify-state";
import { saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import type { fireGate as FireGate } from "@/lib/whatsapp/adapter";

export interface ReengageDeps {
	now?: Date;
	timeoutMs?: number;
	/** Dublê de fireGate pra teste sem tocar a Meta Cloud API. */
	fire?: typeof FireGate;
}

interface PendingConversationRow {
	id: string;
	channel: "whatsapp" | "web";
	waId: string | null;
	contactName: string | null;
	metadata: unknown;
}

/**
 * Conversas ATIVAS (qualquer canal) com um gate do funil marcado como pendente
 * (alvo do watchdog). Filtra `pendingGateSince` no próprio jsonb — sem varrer a
 * tabela toda.
 */
export async function findPendingGateConversations(): Promise<PendingConversationRow[]> {
	return db
		.select({
			id: conversations.id,
			channel: conversations.channel,
			waId: conversations.waId,
			contactName: conversations.contactName,
			metadata: conversations.metadata,
		})
		.from(conversations)
		.where(
			and(
				eq(conversations.status, "active"),
				sql`${conversations.metadata} ->> 'pendingGateSince' IS NOT NULL`,
			),
		);
}

/**
 * Um ciclo de re-engajamento: para cada conversa pendente elegível (além do teto,
 * não-terminal), re-calcula o gate atual (frescor), limpa o marcador (idempotência)
 * e dispara o gate no WhatsApp. Retorna quantas foram re-engajadas.
 */
export async function runReengageCycle(deps: ReengageDeps = {}): Promise<{ reengaged: number }> {
	const now = deps.now ?? new Date();
	const fire = deps.fire ?? (await import("@/lib/whatsapp/adapter")).fireGate;
	const rows = await findPendingGateConversations();
	let reengaged = 0;

	for (const row of rows) {
		try {
			const meta = metaOf(row);
			if (
				!shouldReengageGate({
					meta,
					pendingGateSince: meta.pendingGateSince,
					now: now.getTime(),
					timeoutMs: deps.timeoutMs,
				})
			) {
				continue;
			}

			// Re-calcula o gate no disparo — não confia cegamente no pendingGate
			// gravado (o meta pode ter mudado desde a marcação).
			const gate = nextGate(meta, { hasContactName: Boolean(row.contactName) });

			// Limpa o marcador ANTES de disparar (idempotência: no máximo um disparo
			// por pendência). Roda mesmo quando o gate deixou de ser re-engajável.
			const cleared = { ...meta };
			delete cleared.pendingGateSince;
			delete cleared.pendingGate;
			await persistMeta(row.id, cleared);

			if (NON_REENGAGE_GATES.has(gate)) continue;

			if (row.channel === "whatsapp") {
				if (!row.waId) continue;
				await fire(row.waId, row.id, gate, cleared);
				reengaged += 1;
				continue;
			}

			// channel === "web": sem sessão SSE viva pra empurrar (worker roda num
			// processo separado do app) — persiste como mensagem normal do
			// assistente, disponível no próximo /api/chat/resume.
			const mandatory = isMandatoryCollectionGate(gate);
			const attempt = (meta.gateAttempts?.[gate] ?? 0) + 1;
			const text = mandatory
				? reengageQuestionForGate(
						gate,
						meta.currentCategory ?? null,
						attempt,
						meta.recommendedOffer?.creditValue,
						meta.qualifyAnswers?.creditMentionedAtDesire,
						"web",
					)
				: gateQuestion(
						gate,
						meta.currentCategory ?? null,
						meta.recommendedOffer?.creditValue,
						"web",
						meta.qualifyAnswers?.creditMentionedAtDesire,
					);
			if (!text) continue;

			const messageId = await saveMessage(
				row.id,
				"assistant",
				text,
				"web",
				cleared.currentPersona ?? null,
			);
			try {
				const { publishMessage } = await import("@/lib/chat/message-bus");
				publishMessage(row.id, {
					id: messageId,
					role: "assistant",
					content: text,
					createdAt: now.toISOString(),
				});
			} catch {
				// Best-effort: sem assinante SSE vivo (processo separado do app) não
				// quebra o ciclo — o cliente pega no próximo /api/chat/resume.
			}

			// Escada FIX-211: re-arma o marcador pra continuar cobrando até o teto
			// de 4 tentativas (a 4ª já saiu como SPECIALIST_EXIT_OFFER — não re-arma
			// depois, evita loop infinito).
			if (mandatory && attempt < 4) {
				await persistMeta(row.id, {
					...cleared,
					gateAttempts: { ...cleared.gateAttempts, [gate]: attempt },
					pendingGateSince: now.getTime(),
					pendingGate: gate,
				});
			} else if (mandatory) {
				await persistMeta(row.id, {
					...cleared,
					gateAttempts: { ...cleared.gateAttempts, [gate]: attempt },
				});
			}

			reengaged += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "gate-reengage-poll",
					conversation_id: row.id,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	return { reengaged };
}

// ─── Wiring BullMQ (só no entrypoint do worker; nunca em testes) ──────────────

const QUEUE_NAME = "gate-reengage-poll";
/** Intervalo do polling recorrente (default 30s — o watchdog precisa reagir na
 * ordem de grandeza do teto de inatividade, não em minutos como o proposal-poll). */
const POLL_INTERVAL_MS = Number(process.env.GATE_REENGAGE_POLL_INTERVAL_MS ?? 30_000);

/**
 * Sobe a fila + worker BullMQ com job recorrente. Exige Redis (REDIS_URL).
 * Degrada com log se REDIS_URL ausente (não derruba o app — mesmo padrão do
 * proposal-status-poll). Import dinâmico de bullmq/ioredis pra não puxar Redis
 * pro bundle do app.
 */
export async function startGateReengageWorker() {
	const REDIS_URL = process.env.REDIS_URL;
	if (!REDIS_URL) {
		console.warn(
			"[gate-reengage-poll] REDIS_URL ausente — watchdog de re-engajamento NÃO iniciado (funil segue funcional; FIX-206 cobre o caminho determinístico)",
		);
		return null;
	}

	const { Queue, Worker } = await import("bullmq");
	const { default: IORedis } = await import("ioredis");
	const connection = new IORedis(REDIS_URL, {
		maxRetriesPerRequest: null,
	}) as unknown as ConnectionOptions;

	const queue = new Queue(QUEUE_NAME, { connection });
	await queue.add(
		"poll",
		{},
		{ repeat: { every: POLL_INTERVAL_MS }, jobId: "gate-reengage-cron", removeOnComplete: true },
	);

	const worker = new Worker(
		QUEUE_NAME,
		async () => {
			const result = await runReengageCycle();
			if (result.reengaged > 0) {
				console.log(`[gate-reengage-poll] ciclo: ${JSON.stringify(result)}`);
			}
		},
		{ connection },
	);

	console.log(`[gate-reengage-poll] worker ativo (intervalo ${POLL_INTERVAL_MS}ms)`);
	return { queue, worker };
}
