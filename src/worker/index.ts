/**
 * Worker entrypoint — processa queues BullMQ do motor de automações.
 *
 * Roda como container separado (Dockerfile.worker / docker-compose service "worker").
 * Em dev local fora de container: `npm run worker:dev`.
 *
 * Cada queue tem seu próprio Worker com concurrency configurável. Os processors
 * concretos ficam em src/worker/processors/ (criados na Fase 4 quando o engine
 * estiver pronto). Este arquivo é só o boot — registra workers, lida com
 * sinais de shutdown e logs.
 */
import { Queue, Worker } from "bullmq";
import type { EvaluateJob } from "../lib/automation/triggers";
import { closeAllQueues, getRedisConnection, QUEUE_NAMES } from "../lib/queue";
import { processEvaluateJob } from "./processors/evaluate";
import { processIdleScannerJob } from "./processors/idle-scanner";
import { processStepJob, type StepJob } from "./processors/step";

const IDLE_SCAN_QUEUE = "automation-idle-scan";
const IDLE_SCAN_INTERVAL_MS = Number(
	process.env.AUTOMATION_IDLE_SCAN_INTERVAL_MS ?? 5 * 60 * 1000,
);

const workers: Worker[] = [];

function registerWorker(
	name: string,
	processor: (job: { id?: string; name: string; data: unknown }) => Promise<unknown>,
	concurrency = 5,
) {
	const worker = new Worker(name, processor as never, {
		connection: getRedisConnection(),
		concurrency,
	});

	worker.on("ready", () => console.log(`[worker:${name}] ready`));
	worker.on("active", (job) =>
		console.log(`[worker:${name}] active job=${job.id} name=${job.name}`),
	);
	worker.on("completed", (job) => console.log(`[worker:${name}] completed job=${job.id}`));
	worker.on("failed", (job, err) =>
		console.error(
			`[worker:${name}] failed job=${job?.id} attempt=${job?.attemptsMade} err=${err.message}`,
		),
	);
	worker.on("error", (err) => console.error(`[worker:${name}] error:`, err.message));

	workers.push(worker);
	return worker;
}

async function main() {
	console.log("[worker] booting…");

	registerWorker(QUEUE_NAMES.evaluate, async (job) => {
		return processEvaluateJob(job.data as EvaluateJob);
	});

	registerWorker(QUEUE_NAMES.step, async (job) => {
		await processStepJob(job.data as StepJob);
	});

	// "delayed" só re-enfileira em "step" quando o wait expira. Como usamos
	// `delay` direto nos jobs, eles caem no próprio step quando prontos.
	// Worker registrado pra capturar caso futuro (manutenção / replay).
	registerWorker(QUEUE_NAMES.delayed, async (job) => {
		await processStepJob(job.data as StepJob);
	});

	// Idle scanner — varre leads parados e enfileira evaluate.
	registerWorker(IDLE_SCAN_QUEUE, async (job) => {
		return processIdleScannerJob(job.data as Parameters<typeof processIdleScannerJob>[0]);
	}, 1);
	const idleQueue = new Queue(IDLE_SCAN_QUEUE, { connection: getRedisConnection() });
	// Repeatable job — BullMQ deduplica automaticamente por jobId+pattern.
	await idleQueue.add(
		"scan",
		{ scanAt: new Date().toISOString() },
		{
			repeat: { every: IDLE_SCAN_INTERVAL_MS },
			jobId: "idle-scan-tick",
		},
	);

	console.log(
		"[worker] ready — listening on queues:",
		[...Object.values(QUEUE_NAMES), IDLE_SCAN_QUEUE].join(", "),
	);
}

async function shutdown(signal: string) {
	console.log(`[worker] received ${signal}, shutting down…`);
	for (const w of workers) await w.close();
	await closeAllQueues();
	console.log("[worker] shutdown complete");
	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
	console.error("[worker] fatal:", err);
	process.exit(1);
});
