/**
 * BullMQ queue factory — Redis-backed queues pro motor de automações de funil.
 *
 * Convenção: 1 conexão Redis compartilhada por processo (singleton).
 * Workers ficam isolados em src/worker/index.ts. Producers (API routes,
 * triggers) só importam `getQueue(name)` e enfileiram jobs.
 *
 * Queues:
 *  - automation:evaluate  — recebe trigger (lead event, idle tick) e decide
 *    quais automações ativas devem rodar pra esse lead. Cria automation_runs.
 *  - automation:step      — executa 1 nó do grafo. Enfileira o próximo nó na
 *    própria queue (sem delay) ou em automation:delayed (com delay).
 *  - automation:delayed   — wait nodes. Re-enfileira em step após o delay.
 */

import { type JobsOptions, Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";

let connection: Redis | null = null;
const queues = new Map<string, Queue>();

function getRedisUrl(): string {
	const url = process.env.REDIS_URL;
	if (!url) {
		throw new Error(
			"REDIS_URL is not set. Configure it in .env (default local: redis://localhost:6379).",
		);
	}
	return url;
}

export function getRedisConnection(): Redis {
	if (connection) return connection;
	connection = new IORedis(getRedisUrl(), {
		maxRetriesPerRequest: null,
		enableReadyCheck: false,
	});
	connection.on("error", (err) => {
		console.error("[queue] Redis connection error:", err.message);
	});
	return connection;
}

export const QUEUE_NAMES = {
	evaluate: "automation-evaluate",
	step: "automation-step",
	delayed: "automation-delayed",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
	attempts: 5,
	backoff: { type: "exponential", delay: 2000 },
	removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
	removeOnFail: { age: 60 * 60 * 24 * 7 },
};

export function getQueue(name: QueueName): Queue {
	const existing = queues.get(name);
	if (existing) return existing;
	const queue = new Queue(name, {
		connection: getRedisConnection(),
		defaultJobOptions: DEFAULT_JOB_OPTIONS,
	});
	queues.set(name, queue);
	return queue;
}

export async function closeAllQueues(): Promise<void> {
	const all = Array.from(queues.values());
	for (const q of all) await q.close();
	queues.clear();
	if (connection) {
		await connection.quit();
		connection = null;
	}
}
