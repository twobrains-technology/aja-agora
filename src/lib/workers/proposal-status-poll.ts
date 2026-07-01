// FIX-44 — worker de polling do desfecho da proposta (BullMQ).
//
// A proposta Bevi nasce automática (proposta_enviada). Daí em diante quem move é
// a MESA (back office humano), com timing da Conexia, SEM webhook. O sistema só
// sabe consultando o status. Este worker faz polling recorrente de cada proposta
// ativa, mapeia o status → raia (máquina do desfecho, stageForProposalStatus) e
// aplica a transição (forward-only). Também marca `perdido` por inatividade.
//
// O ciclo (`runPollCycle`) e a reconciliação (`reconcileProposalStage`) são
// testáveis sem Redis (injetam um gateway dublê). O wiring BullMQ só é iniciado
// pelo entrypoint do worker (`startProposalStatusWorker`).

import type { ConnectionOptions } from "bullmq";
import { and, eq, lt, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, leads } from "@/db/schema";
import { getProposalGateway } from "@/lib/adapters";
import type { ProposalGateway } from "@/lib/adapters/proposal-gateway";
import type { LeadStage } from "@/lib/admin/lead-stages";
import { transitionLeadStage } from "@/lib/admin/lead-transitions";
import { updateBeviProposal } from "@/lib/bevi/proposal-repo";
import { stageForProposalStatus } from "@/lib/bevi/proposal-status";
import { dispatchAutoTransbordo } from "@/lib/mesa/dispatch";

/** N de dias sem avanço que marca a proposta abandonada como `perdido` (a API não
 * expira proposta — o timeout é nosso). Decisão Kairo via /to-saindo: 14 dias. */
export const PERDIDO_INACTIVITY_DAYS = Number(process.env.PERDIDO_INACTIVITY_DAYS ?? 14);

/** Raias terminais — não são reprocessadas pelo polling nem regridem por inatividade. */
const TERMINAL_STAGES: LeadStage[] = ["fechado_ganho", "perdido"];

export interface ReconcileDeps {
	gateway?: ProposalGateway;
}

interface ActiveProposalRow {
	id: string;
	proposalId: string;
	leadId: string | null;
	updatedAt: Date;
}

/**
 * Consulta o status REAL de UMA proposta e aplica a raia resultante ao lead
 * (forward-only). Idempotente: re-rodar com o mesmo status é no-op (a transição
 * forward-only não duplica `lead_events`). Persiste o último statusName visto.
 */
export async function reconcileProposalStage(
	row: ActiveProposalRow,
	deps: ReconcileDeps = {},
): Promise<{ stage: LeadStage | null; applied: boolean }> {
	const gateway = deps.gateway ?? getProposalGateway();
	const status = await gateway.getStatus(row.proposalId);
	const stage = stageForProposalStatus(status);

	await updateBeviProposal(row.id, { proposalStatus: status.statusName });

	if (!stage || !row.leadId) return { stage, applied: false };

	const before = await db.query.leads.findFirst({ where: eq(leads.id, row.leadId) });
	const result = await transitionLeadStage(row.leadId, stage, { type: "system" });
	const applied = Boolean(result && before && result.stage !== before.stage);

	// FIX-123 (D14): ao o lead ENTRAR em na_administradora (raia-gatilho — Decisão 1 do
	// bloco), transborda automaticamente pra mesa (cria handoff sem dono + broadcast
	// FIX-124). Guardado por `applied` (só quando a raia REALMENTE mudou nesta
	// reconciliação → não re-dispara a cada poll do mesmo status). Best-effort: falha do
	// transbordo NÃO derruba a transição de raia nem o ciclo de polling.
	if (applied && stage === "na_administradora") {
		try {
			await dispatchAutoTransbordo(row.leadId);
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "proposal-status-poll",
					proposal_id: row.proposalId,
					error: err instanceof Error ? err.message : String(err),
					note: "auto-transbordo falhou (raia aplicada mesmo assim)",
				}),
			);
		}
	}

	return { stage, applied };
}

/** Propostas ainda em jogo (lead não-terminal) — alvo do polling. */
export async function findActiveProposals(): Promise<ActiveProposalRow[]> {
	const rows = await db
		.select({
			id: beviProposals.id,
			proposalId: beviProposals.proposalId,
			leadId: beviProposals.leadId,
			updatedAt: beviProposals.updatedAt,
			stage: leads.stage,
		})
		.from(beviProposals)
		.leftJoin(leads, eq(beviProposals.leadId, leads.id));

	return rows
		.filter((r) => !r.stage || !TERMINAL_STAGES.includes(r.stage))
		.map(({ stage: _stage, ...rest }) => rest);
}

/**
 * Marca como `perdido` propostas abandonadas (lead não-terminal sem avanço há
 * mais de PERDIDO_INACTIVITY_DAYS). Forward-only permite (perdido é terminal).
 */
export async function markStaleProposalsLost(deps: { now?: Date } = {}): Promise<number> {
	const now = deps.now ?? new Date();
	const cutoff = new Date(now.getTime() - PERDIDO_INACTIVITY_DAYS * 86_400_000);

	const stale = await db
		.select({ leadId: beviProposals.leadId, stage: leads.stage, updatedAt: leads.updatedAt })
		.from(beviProposals)
		.innerJoin(leads, eq(beviProposals.leadId, leads.id))
		.where(and(notInArray(leads.stage, TERMINAL_STAGES), lt(leads.updatedAt, cutoff)));

	let marked = 0;
	for (const row of stale) {
		if (!row.leadId) continue;
		const result = await transitionLeadStage(row.leadId, "perdido", { type: "system" });
		if (result?.stage === "perdido") marked += 1;
	}
	return marked;
}

/** Um ciclo de polling: reconcilia todas as propostas ativas + varre inatividade. */
export async function runPollCycle(deps: ReconcileDeps & { now?: Date } = {}): Promise<{
	reconciled: number;
	lost: number;
}> {
	const active = await findActiveProposals();
	let reconciled = 0;
	for (const row of active) {
		try {
			const { applied } = await reconcileProposalStage(row, deps);
			if (applied) reconciled += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "proposal-status-poll",
					proposal_id: row.proposalId,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}
	const lost = await markStaleProposalsLost(deps);
	return { reconciled, lost };
}

// ─── Wiring BullMQ (só no entrypoint do worker; nunca em testes) ──────────────

const QUEUE_NAME = "proposal-status-poll";
/** Intervalo do polling recorrente (default 15 min). */
const POLL_INTERVAL_MS = Number(process.env.PROPOSAL_POLL_INTERVAL_MS ?? 15 * 60_000);

/**
 * Sobe a fila + worker BullMQ com job recorrente. Exige Redis (REDIS_URL).
 * Chamado só pelo entrypoint do worker (scripts/proposal-worker.ts) — em prod,
 * mesmo projeto/container se der ("mesmo container se der", Kairo). Import dinâmico
 * de bullmq/ioredis pra não puxar Redis pro bundle do app.
 */
export async function startProposalStatusWorker() {
	const REDIS_URL = process.env.REDIS_URL;
	if (!REDIS_URL)
		throw new Error("REDIS_URL não definida — worker de polling exige Redis (BullMQ)");

	const { Queue, Worker } = await import("bullmq");
	const { default: IORedis } = await import("ioredis");
	// Cast: a instância ioredis É aceita pelo BullMQ em runtime; o type cross-versão
	// não reconhece (import type apagado em build — não puxa Redis pro bundle).
	const connection = new IORedis(REDIS_URL, {
		maxRetriesPerRequest: null,
	}) as unknown as ConnectionOptions;

	const queue = new Queue(QUEUE_NAME, { connection });
	await queue.add(
		"poll",
		{},
		{ repeat: { every: POLL_INTERVAL_MS }, jobId: "proposal-poll-cron", removeOnComplete: true },
	);

	const worker = new Worker(
		QUEUE_NAME,
		async () => {
			const result = await runPollCycle();
			console.log(`[proposal-status-poll] ciclo: ${JSON.stringify(result)}`);
		},
		{ connection },
	);

	console.log(`[proposal-status-poll] worker ativo (intervalo ${POLL_INTERVAL_MS}ms)`);
	return { queue, worker };
}
