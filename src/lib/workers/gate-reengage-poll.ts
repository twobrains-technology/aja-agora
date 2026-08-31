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
	isConversationPausedOrTerminal,
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
import { buildRetomadaDirective, podeRetomar } from "./retomada";

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

/** Quanto tempo de silêncio, por canal, antes de a conversa virar candidata a
 * retomada. Web é mais curto porque o cliente está com a tela aberta e a
 * atenção dura pouco; WhatsApp tem outro ritmo e 90s ali soaria afobado. */
const IDLE_RETOMADA_MS = {
	web: Number(process.env.RETOMADA_IDLE_WEB_MS ?? 2 * 60_000),
	whatsapp: Number(process.env.RETOMADA_IDLE_WHATSAPP_MS ?? 5 * 60_000),
};

/** Teto de conversas por ciclo — as MAIS RECENTES primeiro.
 *
 * Sem isto, o primeiro ciclo depois do deploy varreria 24 h inteiras de
 * conversas paradas e dispararia retomada em todas de uma vez: dezenas de
 * clientes recebendo mensagem no mesmo minuto, por causa de um watchdog que
 * acabou de nascer. Com o cron de 30s a fila drena rápido, e quem parou há mais
 * tempo é justamente quem menos tem chance de voltar. */
const RETOMADAS_POR_CICLO = Number(process.env.RETOMADAS_POR_CICLO ?? 5);

/**
 * A SEGUNDA fonte do watchdog: o cliente falou e ninguém respondeu.
 *
 * Não é redundante com a primeira, e a diferença importa. O marcador de
 * pendência é escrito PELO TURNO — se o turno morre no meio, ou nunca roda, o
 * marcador não existe e a conversa fica invisível (foi o caso do cliente que
 * escreveu três vezes sem receber trace nenhum). Esta fonte não depende de
 * escrita nenhuma: ela olha o estado observável — a última mensagem é do
 * cliente, e faz tempo.
 *
 * A janela de 24 h é regra de negócio, não estética: fora dela o WhatsApp não
 * entrega texto livre (só template aprovado), então retomada tardia é outra
 * feature — com template e mesa —, não este worker. De quebra, limita o scan.
 */
export async function findConversasSemResposta(now: Date): Promise<PendingConversationRow[]> {
	const rows = await db.execute(sql`
		WITH ultimas AS (
			SELECT DISTINCT ON (m.conversation_id)
			       m.conversation_id, m.role, m.created_at
			FROM messages m
			WHERE m.created_at > ${now.toISOString()}::timestamptz - interval '24 hours'
			ORDER BY m.conversation_id, m.created_at DESC
		)
		SELECT c.id, c.channel, c.wa_id AS "waId", c.contact_name AS "contactName", c.metadata
		FROM conversations c
		JOIN ultimas u ON u.conversation_id = c.id
		WHERE c.status = 'active'
		  AND c.is_simulated = false
		  AND u.role = 'user'
		  AND u.created_at < ${now.toISOString()}::timestamptz - (
		        CASE c.channel
		          WHEN 'web' THEN ${`${IDLE_RETOMADA_MS.web} milliseconds`}::interval
		          ELSE ${`${IDLE_RETOMADA_MS.whatsapp} milliseconds`}::interval
		        END)
		ORDER BY u.created_at DESC
		LIMIT ${RETOMADAS_POR_CICLO}
	`);
	return (
		Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
	) as PendingConversationRow[];
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

/** Dispara um turno de SERVIDOR na conversa. Injetável para o ciclo ser testável
 * sem tocar a Meta API nem subir o grafo. */
export type DisparaRetomada = (args: {
	conversationId: string;
	channel: "web" | "whatsapp";
	waId: string | null;
	directive: string;
}) => Promise<void>;

/**
 * Ciclo da RETOMADA: conversas em que o cliente falou e ninguém respondeu.
 *
 * Roda depois do `runReengageCycle` e ignora o que ele já tratou no mesmo ciclo
 * (`jaTratadas`) — as duas fontes se sobrepõem de propósito, mas cobrar duas
 * vezes seria pior que não cobrar.
 */
export async function runRetomadaCycle(
	deps: { now?: Date; dispara?: DisparaRetomada; jaTratadas?: ReadonlySet<string> } = {},
): Promise<{ retomadas: number }> {
	const now = deps.now ?? new Date();
	const jaTratadas = deps.jaTratadas ?? new Set<string>();
	const dispara = deps.dispara ?? disparaRetomadaReal;
	const rows = await findConversasSemResposta(now);
	let retomadas = 0;

	for (const row of rows) {
		try {
			if (jaTratadas.has(row.id)) continue;
			const meta = metaOf(row);
			// Handoff pendente, contrato fechado, coleta de lead: quem conduz não é
			// mais o agente.
			if (isConversationPausedOrTerminal(meta)) continue;
			if (!podeRetomar(meta, now.getTime())) continue;

			const minutosParado = Math.max(
				1,
				Math.round((IDLE_RETOMADA_MS[row.channel] ?? IDLE_RETOMADA_MS.web) / 60_000),
			);
			const directive = buildRetomadaDirective(meta, { minutosParado, channel: row.channel });

			// GRAVA ANTES DE DISPARAR. Se o turno morrer no meio, a tentativa continua
			// contada — um watchdog que só conta sucesso vira loop exatamente na
			// conversa que está quebrando, e aí o defeito persegue o cliente.
			await persistMeta(row.id, {
				...meta,
				retomada: { attempts: (meta.retomada?.attempts ?? 0) + 1, lastAt: now.getTime() },
			});

			await dispara({
				conversationId: row.id,
				channel: row.channel,
				waId: row.waId,
				directive,
			});
			retomadas += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "retomada",
					conversation_id: row.id,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	return { retomadas };
}

/** A retomada real: turno de servidor no runtime de verdade. No WhatsApp o
 * adapter entrega pela Meta API; no web o `persist` grava a mensagem e o cliente
 * a recebe no próximo poll/resume. */
const disparaRetomadaReal: DisparaRetomada = async ({
	conversationId,
	channel,
	waId,
	directive,
}) => {
	if (channel === "whatsapp") {
		if (!waId) return;
		const { runDirectiveWithOrchestrator } = await import("@/lib/whatsapp/adapter");
		await runDirectiveWithOrchestrator({ from: waId, conversationId, directive });
		return;
	}
	const { runTurn } = await import("@/lib/agent/orchestrator");
	for await (const _ of runTurn({
		channel: "web",
		conversationId,
		userText: directive,
		isUserTurn: false,
	})) {
		// Drenar é o que faz o turno acontecer; o `persist` grava a fala.
	}
};

// ─── Wiring BullMQ (só no entrypoint do worker; nunca em testes) ──────────────

const QUEUE_NAME = "gate-reengage-poll";
/** Intervalo do polling recorrente (default 30s — o watchdog precisa reagir na
 * ordem de grandeza do teto de inatividade, não em minutos como o proposal-poll). */
const POLL_INTERVAL_MS = Number(process.env.GATE_REENGAGE_POLL_INTERVAL_MS ?? 30_000);

/** A campainha do D3/E1 roda UMA VEZ POR DIA, e não a cada 30 s como o funil.
 *
 *  Quem garante isso é o `repeat` do BullMQ, não um `if` de relógio: ele é
 *  persistido no Redis, então vale entre reinícios e entre instâncias do worker.
 *  No período do funil, o mesmo alarme mandaria ~2.880 e-mails por dia — e a
 *  mesa desligaria a campainha na primeira manhã. */
const SLA_MESA_INTERVAL_MS = 24 * 60 * 60 * 1000;
const JOB_FUNIL = "poll";
const JOB_SLA_MESA = "sla-da-mesa";

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
		JOB_FUNIL,
		{},
		{ repeat: { every: POLL_INTERVAL_MS }, jobId: "gate-reengage-cron", removeOnComplete: true },
	);
	await queue.add(
		JOB_SLA_MESA,
		{},
		{
			repeat: { every: SLA_MESA_INTERVAL_MS },
			jobId: "sla-da-mesa-cron",
			removeOnComplete: true,
		},
	);

	const worker = new Worker(
		QUEUE_NAME,
		async (job) => {
			// A fila tem DOIS jobs repetíveis com períodos muito diferentes (30 s e
			// 24 h). Sem esta ramificação, um dos dois roda no ritmo do outro: ou o
			// alarme vira 2.880 e-mails por dia, ou o funil inteiro passa a rodar uma
			// vez por dia — silenciosamente, matando venda.
			if (job?.name === JOB_SLA_MESA) {
				const { runSlaDaMesaCycle } = await import("./sla-da-mesa-cycle");
				const sla = await runSlaDaMesaCycle();
				if (sla.parados > 0) console.log(`[sla-da-mesa] ${JSON.stringify(sla)}`);
				return;
			}

			const result = await runReengageCycle();
			// A retomada roda no MESMO ciclo e sabe o que a primeira fonte tratou —
			// as duas se sobrepõem de propósito, mas cobrar duas vezes seria pior
			// que não cobrar.
			const retomada = await runRetomadaCycle();
			// A acolhida N1 é a terceira fonte, e olha o conjunto oposto: conversas
			// `handed_off`, que as duas anteriores ignoram por construção
			// (`isConversationPausedOrTerminal`). Roda aqui, e não inline no inbound,
			// porque falar por cima do atendente é o incidente de 2026-08-10 — o
			// ciclo relê o estado da mesa imediatamente antes de emitir.
			const { runAcolhidaN1Cycle } = await import("./acolhida-n1-cycle");
			const acolhida = await runAcolhidaN1Cycle();
			// Reconciliação fala×estado: não age sobre a conversa, só publica o sinal
			// que os juízes LLM não davam — no turno que prometeu um contrato
			// inexistente, `judge_avancou` valeu 0,923 e todo indicador estava verde.
			const { runReconciliacaoCycle } = await import("./reconciliacao-cycle");
			const reconciliacao = await runReconciliacaoCycle();
			if (reconciliacao.publicadas > 0) {
				console.log(`[reconciliacao] ${JSON.stringify(reconciliacao.sinais)}`);
			}
			if (result.reengaged > 0 || retomada.retomadas > 0 || acolhida.acolhidas > 0) {
				console.log(
					`[gate-reengage-poll] ciclo: ${JSON.stringify({ ...result, ...retomada, acolhidasN1: acolhida.acolhidas })}`,
				);
			}
		},
		{ connection },
	);

	console.log(`[gate-reengage-poll] worker ativo (intervalo ${POLL_INTERVAL_MS}ms)`);
	return { queue, worker };
}
