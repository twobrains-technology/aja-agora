// O WATCHDOG DA CONVERSA — o agendamento que morreu junto com o worker de gates.
//
// Na main, `gate-reengage-poll.ts` era um único job que rodava quatro ciclos:
// re-engajamento por gate (removido com o funil), retomada, acolhida N1,
// reconciliação — mais a campainha diária do SLA da mesa num job próprio. Os
// quatro módulos de ciclo sobreviveram à refatoração; o ÚNICO chamador agendado
// foi apagado com o arquivo do funil. Resultado: acolhida N1, SLA da mesa e
// reconciliação existiam, testavam e nunca rodavam em produção.
//
// Aqui está de volta o agendamento, sem nada de funil. Os quatro ciclos são os
// mesmos, com a MESMA cadência de antes (comparado com a main):
//
//   retomada · acolhida N1 · reconciliação   30 s, job repetível "poll"
//   SLA da mesa                              cron 9h de Brasília
//
// O que NÃO volta: `pendingGate`, `nextGate` e o re-engajamento por gate. Não há
// gate neste motor — o vendedor é livre.
//
// Dois jobs com períodos muito diferentes na MESMA fila exigem o handler
// ramificar por `job.name`: sem isso, ou o alarme vira 2.880 e-mails por dia, ou
// a retomada passa a rodar uma vez por dia — silencioso, e mata venda.

import type { ConnectionOptions } from "bullmq";
import { CRON_DA_CAMPAINHA } from "./sla-da-mesa-cycle";

const QUEUE_NAME = "watchdog-da-conversa";

/** O intervalo do tick de conversa. 30 s é a ordem de grandeza do silêncio que a
 * retomada persegue (2 min na web) — reagir mais rápido não muda nada. */
export const INTERVALO_DO_TICK_MS = Number(process.env.WATCHDOG_POLL_INTERVAL_MS ?? 30_000);

export const JOB_TICK = "poll";
export const JOB_SLA_MESA = "sla-da-mesa";

/**
 * Sobe a fila + worker BullMQ com os jobs repetíveis. Exige Redis (REDIS_URL) —
 * degrada com log se ausente, igual aos irmãos (não derruba o worker de proposta).
 *
 * O `jobId` FIXO é o que garante UMA cópia por período, mesmo com duas réplicas
 * do ECS: `repeat.every` sozinho criaria um job novo a cada intervalo. É por isso
 * que não existe `setInterval` aqui.
 */
export async function startWatchdogDaConversaWorker() {
	const REDIS_URL = process.env.REDIS_URL;
	if (!REDIS_URL) {
		console.warn(
			"[watchdog-da-conversa] REDIS_URL ausente — retomada, acolhida N1, reconciliação e SLA da mesa NÃO agendados",
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
		JOB_TICK,
		{},
		{
			repeat: { every: INTERVALO_DO_TICK_MS },
			jobId: "watchdog-da-conversa-cron",
			removeOnComplete: true,
		},
	);
	// `pattern` e não `every`: o `every` do BullMQ alinha à ÉPOCA, e 24 h caía à
	// meia-noite UTC — 21h de Brasília. Medido contra o Redis na main. A hora do
	// alarme se decide em `sla-da-mesa-cycle.ts`, ao lado do ciclo.
	await queue.add(
		JOB_SLA_MESA,
		{},
		{
			repeat: { pattern: CRON_DA_CAMPAINHA, tz: "UTC" },
			jobId: "sla-da-mesa-cron",
			removeOnComplete: true,
		},
	);

	const worker = new Worker(
		QUEUE_NAME,
		async (job) => {
			if (job?.name === JOB_SLA_MESA) {
				const { runSlaDaMesaCycle } = await import("./sla-da-mesa-cycle");
				const sla = await runSlaDaMesaCycle();
				if (sla.novos > 0 || sla.jaAlertados > 0) {
					console.log(`[sla-da-mesa] ${JSON.stringify(sla)}`);
				}
				return;
			}

			// Os três ciclos do tick. Cada um trata um conjunto diferente de
			// conversas: a retomada olha `active` cuja última fala é do cliente, a
			// acolhida olha `handed_off` em que o cliente voltou a escrever, e a
			// reconciliação não age — só publica o sinal de fala × estado.
			const { runRetomadaCycle } = await import("./retomada-cycle");
			const { runAcolhidaN1Cycle } = await import("./acolhida-n1-cycle");
			const { runReconciliacaoCycle } = await import("./reconciliacao-cycle");

			const retomada = await runRetomadaCycle();
			const acolhida = await runAcolhidaN1Cycle();
			const reconciliacao = await runReconciliacaoCycle();

			if (reconciliacao.publicadas > 0) {
				console.log(`[reconciliacao] ${JSON.stringify(reconciliacao.sinais)}`);
			}
			if (retomada.retomadas > 0 || acolhida.acolhidas > 0) {
				console.log(
					`[watchdog-da-conversa] ciclo: ${JSON.stringify({
						retomadas: retomada.retomadas,
						acolhidasN1: acolhida.acolhidas,
					})}`,
				);
			}
		},
		{ connection },
	);

	console.log(`[watchdog-da-conversa] worker ativo (tick ${INTERVALO_DO_TICK_MS}ms)`);
	return { queue, worker };
}
