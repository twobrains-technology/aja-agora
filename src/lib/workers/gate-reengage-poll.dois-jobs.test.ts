/**
 * A fila passou a ter DOIS jobs repetíveis, e trocá-los é caro dos dois lados.
 *
 * Até aqui a fila `gate-reengage-poll` tinha um job só, e o handler ignorava
 * `job` — rodava tudo, sempre. Com a campainha do D3/E1 entrando na mesma fila
 * com período próprio (24 h contra 30 s), o handler passa a precisar saber qual
 * job chegou. Os dois erros possíveis são graves e simétricos:
 *
 *   sem ramificar, o alarme roda no job de 30 s  → ~2.880 e-mails por dia, e a
 *                                                   mesa desliga a campainha na
 *                                                   primeira manhã;
 *   sem ramificar, o funil roda no job de 24 h   → re-engajamento, retomada,
 *                                                   acolhida e reconciliação
 *                                                   passam a acontecer uma vez
 *                                                   por dia. Silencioso, e mata
 *                                                   venda.
 *
 * Nenhum dos dois quebra teste, log ou typecheck — por isso este arquivo.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type OpcoesDeJob = { repeat?: { every?: number } };
const add = vi.hoisted(() =>
	vi.fn(async (_nome: string, _dados: unknown, _opcoes?: OpcoesDeJob) => {}),
);
const runSlaDaMesaCycle = vi.hoisted(() => vi.fn(async () => ({ parados: 0, enviado: false })));
const runReengageCycle = vi.hoisted(() => vi.fn(async () => ({ reengaged: 0 })));
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
vi.mock("./sla-da-mesa-cycle", () => ({ runSlaDaMesaCycle }));
vi.mock("./acolhida-n1-cycle", () => ({ runAcolhidaN1Cycle }));
vi.mock("./reconciliacao-cycle", () => ({ runReconciliacaoCycle }));

vi.mock("./gate-reengage-poll", async (original) => {
	const real = await original<Record<string, unknown>>();
	return { ...real, runReengageCycle, runRetomadaCycle };
});

beforeEach(() => {
	handler = null;
	for (const m of [add, runSlaDaMesaCycle, runAcolhidaN1Cycle, runReconciliacaoCycle])
		m.mockClear();
	process.env.REDIS_URL = "redis://localhost:6379";
});

describe("os dois jobs repetíveis", () => {
	it("registra o alarme com período PRÓPRIO, e não o de 30 s do funil", async () => {
		const { startGateReengageWorker } = await import("./gate-reengage-poll");
		await startGateReengageWorker();

		const registros = add.mock.calls.map((c) => ({ nome: c[0], every: c[2]?.repeat?.every }));

		const funil = registros.find((r) => r.nome === "poll");
		const alarme = registros.find((r) => r.nome === "sla-da-mesa");

		expect(funil?.every).toBe(30_000);
		expect(alarme?.every).toBe(24 * 60 * 60 * 1000);
	});

	it("o job do funil NÃO dispara o alarme", async () => {
		const { startGateReengageWorker } = await import("./gate-reengage-poll");
		await startGateReengageWorker();

		await handler?.({ name: "poll" });

		expect(runSlaDaMesaCycle).not.toHaveBeenCalled();
		// E o que ele deve rodar, rodou.
		expect(runAcolhidaN1Cycle).toHaveBeenCalledTimes(1);
	});

	it("o job do alarme NÃO dispara o funil", async () => {
		const { startGateReengageWorker } = await import("./gate-reengage-poll");
		await startGateReengageWorker();

		await handler?.({ name: "sla-da-mesa" });

		expect(runSlaDaMesaCycle).toHaveBeenCalledTimes(1);
		expect(runAcolhidaN1Cycle).not.toHaveBeenCalled();
		expect(runReconciliacaoCycle).not.toHaveBeenCalled();
	});
});
