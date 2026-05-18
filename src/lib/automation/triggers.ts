/**
 * Triggers — funções que enfileiram jobs de avaliação.
 *
 * Chamadas a partir de pontos de entrada do produto:
 *  - transitionLeadStage (stage_changed)
 *  - idle scanner em src/worker/processors/idle-scanner.ts (idle_in_stage)
 *  - chat_event ainda não plugado ao chat agent (Fase 2)
 *
 * Não importa nada do DB — só enfileira. Os processors do worker fazem
 * a validação pesada (carregar automações, dispatch, criar runs).
 */

import type { LeadStage } from "@/lib/admin/lead-stages";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

export interface EvaluateStageChangedJob {
	kind: "stage_changed";
	leadEventId: string;
	leadId: string;
	fromStage: LeadStage | null;
	toStage: LeadStage;
}

export interface EvaluateIdleInStageJob {
	kind: "idle_in_stage";
	leadId: string;
	stage: LeadStage;
	idleMs: number;
	// Janela atual pro dedup — geralmente o dia ou hora corrente truncados.
	windowStartIso: string;
}

export type EvaluateJob = EvaluateStageChangedJob | EvaluateIdleInStageJob;

export async function enqueueEvaluateForLeadEvent(
	job: Omit<EvaluateStageChangedJob, "kind">,
): Promise<void> {
	const queue = getQueue(QUEUE_NAMES.evaluate);
	await queue.add(
		"evaluate-stage-changed",
		{ kind: "stage_changed", ...job } satisfies EvaluateStageChangedJob,
		{
			// Dedup leve no nível BullMQ — o real dedup é via UNIQUE em
			// automation_runs.dedup_key (cobre 2 réplicas processando o mesmo job).
			jobId: `evaluate:stage:${job.leadEventId}`,
		},
	);
}

export async function enqueueEvaluateIdle(
	job: Omit<EvaluateIdleInStageJob, "kind">,
): Promise<void> {
	const queue = getQueue(QUEUE_NAMES.evaluate);
	await queue.add(
		"evaluate-idle",
		{ kind: "idle_in_stage", ...job } satisfies EvaluateIdleInStageJob,
		{
			jobId: `evaluate:idle:${job.leadId}:${job.stage}:${job.windowStartIso}`,
		},
	);
}
