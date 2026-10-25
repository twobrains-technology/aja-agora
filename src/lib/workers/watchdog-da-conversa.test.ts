/**
 * A fila do watchdog tem DOIS jobs repetíveis, e trocá-los é caro dos dois lados.
 *
 * Os ciclos existem, testam e passam — e isso não prova que alguém os agenda.
 * Aconteceu exatamente isso nesta refatoração: retomada, acolhida N1, SLA e
 * reconciliação ficaram sem chamador agendado quando o worker de gates saiu, e
 * nada ficou vermelho. Este arquivo é a prova de que o agendamento existe.
 *
 * Os dois erros possíveis são graves e simétricos:
 *
 *   sem ramificar por `job.name`, o alarme roda no tick de 30 s → ~2.880
 *                                   e-mails por dia, e a mesa desliga a
 *                                   campainha na primeira manhã;
 *   sem ramificar, a conversa roda no job de 24 h           → retomada, acolhida
 *                                   e reconciliação passam a acontecer uma vez
 *                                   por dia. Silencioso, e mata venda.
 *
 * Nenhum dos dois quebra typecheck — por isso este arquivo.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CRON_DA_CAMPAINHA } from "./sla-da-mesa-cycle";

type OpcoesDeJob = { repeat?: { every?: number; pattern?: string } };
const add = vi.hoisted(() =>
	vi.fn(async (_nome: string, _dados: unknown, _opcoes?: OpcoesDeJob) => {}),
);
const runSlaDaMesaCycle = vi.hoisted(() =>
	vi.fn(async () => ({ novos: 0, jaAlertados: 0, enviado: false })),
);
const runRetomadaCycle = vi.hoisted(() => vi.fn(async () => ({ retomadas: 0 })));
const runAcolhidaN1Cycle = vi.hoisted(() => vi.fn(async () => ({ acolhidas: 0 })));
const runReconciliacaoCycle = vi.hoisted(() => vi.fn(async () => ({ publicadas: 0, sinais: {} })));

/** Guarda o handler que o worker registrou, para poder executá-lo. */
let handler: ((job: { name: string }) => Promise<unknown>) | null = null;

vi.mock("bullmq", () => ({
	Queue: class {
		add = add;
	},
	Worker: class {
		constructor(_nome: string, fn: (job: { name: string }) => Promise<unknown>) {
			handler = fn;
		}
	},
}));
vi.mock("ioredis", () => ({ default: class {} }));
// Só os CICLOS são dublados; o cron vem do módulo real, senão o teste compararia
// o período do job contra um número que ele mesmo inventou.
vi.mock("./sla-da-mesa-cycle", async (original) => ({
	...(await original<Record<string, unknown>>()),
	runSlaDaMesaCycle,
}));
vi.mock("./retomada-cycle", () => ({ runRetomadaCycle }));
vi.mock("./acolhida-n1-cycle", () => ({ runAcolhidaN1Cycle }));
vi.mock("./reconciliacao-cycle", () => ({ runReconciliacaoCycle }));

import {
	INTERVALO_DO_TICK_MS,
	JOB_SLA_MESA,
	JOB_TICK,
	startWatchdogDaConversaWorker,
} from "./watchdog-da-conversa";

beforeEach(() => {
	handler = null;
	for (const m of [
		add,
		runSlaDaMesaCycle,
		runRetomadaCycle,
		runAcolhidaN1Cycle,
		runReconciliacaoCycle,
	])
		m.mockClear();
	process.env.REDIS_URL = "redis://localhost:6379";
});

describe("os dois jobs repetíveis", () => {
	it("registra o alarme com período PRÓPRIO, e não o do tick", async () => {
		await startWatchdogDaConversaWorker();

		const registros = add.mock.calls.map((c) => ({
			nome: c[0],
			every: c[2]?.repeat?.every,
			pattern: c[2]?.repeat?.pattern,
		}));

		const tick = registros.find((r) => r.nome === JOB_TICK);
		const alarme = registros.find((r) => r.nome === JOB_SLA_MESA);

		expect(tick?.every).toBe(INTERVALO_DO_TICK_MS);
		expect(tick?.every).toBe(30_000);
		// O alarme é agendado por CRON, não por intervalo — e isso não é detalhe:
		// o `every` do BullMQ alinha à época, e 24 h caía à meia-noite UTC, 21h de
		// Brasília. O cron fixa 9h, começo do expediente.
		expect(alarme?.every).toBeUndefined();
		expect(alarme?.pattern).toBe(CRON_DA_CAMPAINHA);
	});

	it("o tick roda retomada, acolhida N1 e reconciliação — e NÃO o alarme", async () => {
		await startWatchdogDaConversaWorker();

		await handler?.({ name: JOB_TICK });

		expect(runRetomadaCycle).toHaveBeenCalledTimes(1);
		expect(runAcolhidaN1Cycle).toHaveBeenCalledTimes(1);
		expect(runReconciliacaoCycle).toHaveBeenCalledTimes(1);
		expect(runSlaDaMesaCycle).not.toHaveBeenCalled();
	});

	it("o job do alarme NÃO roda os ciclos da conversa", async () => {
		await startWatchdogDaConversaWorker();

		await handler?.({ name: JOB_SLA_MESA });

		expect(runSlaDaMesaCycle).toHaveBeenCalledTimes(1);
		expect(runRetomadaCycle).not.toHaveBeenCalled();
		expect(runAcolhidaN1Cycle).not.toHaveBeenCalled();
		expect(runReconciliacaoCycle).not.toHaveBeenCalled();
	});

	it("sem REDIS_URL, não agenda nada e não derruba o worker de proposta", async () => {
		process.env.REDIS_URL = "";
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

		const retorno = await startWatchdogDaConversaWorker();

		expect(retorno).toBeNull();
		expect(add).not.toHaveBeenCalled();
		expect(aviso).toHaveBeenCalled();
		aviso.mockRestore();
	});
});

describe("o entrypoint do worker", () => {
	it("sobe o watchdog no MESMO processo, como os irmãos", async () => {
		// O defeito que originou este bloco: os módulos de ciclo existiam, testavam
		// e passavam — e nenhum chamador agendado os subia. Um teste do ciclo não
		// pega isso; só o entrypoint pega.
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const fonte = readFileSync(resolve(process.cwd(), "scripts/proposal-worker.ts"), "utf8");

		expect(fonte).toContain("startWatchdogDaConversaWorker");
		expect(fonte).toMatch(/await startWatchdogDaConversaWorker\(\)/);
	});
});
