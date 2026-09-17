// O CICLO da régua — testado com BANCO e WhatsApp MOCKADOS (nada de rede).
//
// O motor já foi provado puro (`remarketing/motor.test.ts`). Aqui o que se prova
// é a ORDEM do ciclo, que é a defesa contra duplicidade: o contador/timestamp é
// gravado ANTES do envio. E que o mesmo tick fecha o buraco do CAPI.
//
// Toda dependência de I/O entra por parâmetro (`runRemarketingCycle(deps)`), o
// que torna o teste determinístico sem `vi.mock` de banco — o mock é a injeção.
// O único `vi.mock` é do BullMQ, para provar o `jobId` FIXO do job repetível.

import { beforeEach, describe, expect, it, vi } from "vitest";

const bullmq = vi.hoisted(() => ({
	adds: [] as Array<{ name: string; data: unknown; opts: Record<string, unknown> }>,
	workers: [] as unknown[],
}));

vi.mock("bullmq", () => ({
	Queue: class {
		async add(name: string, data: unknown, opts: Record<string, unknown>) {
			bullmq.adds.push({ name, data, opts });
		}
	},
	Worker: class {
		constructor(...args: unknown[]) {
			bullmq.workers.push(args);
		}
	},
}));
vi.mock("ioredis", () => ({ default: class {} }));

import {
	type LinhaDaRegua,
	runRemarketingCycle,
	startRemarketingWorker,
} from "./remarketing-cycle";

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-09-14T15:30:00Z"); // 12h30 em Brasília

function linha(over: Partial<LinhaDaRegua> = {}): LinhaDaRegua {
	return {
		conversationId: "11111111-1111-1111-1111-111111111111",
		contactId: "22222222-2222-2222-2222-222222222222",
		objetivo: "carro",
		step: 0,
		status: "ATIVO",
		nextTouchAt: new Date(AGORA.getTime() - 60_000),
		touches30d: 0,
		motivoSaida: null,
		channel: "whatsapp",
		waId: "5562999998888",
		metadata: {},
		lastInboundAt: new Date(AGORA.getTime() - 91 * 60_000),
		phone: null,
		nome: "Ana",
		optoutDaPessoaEm: null,
		...over,
	};
}

/** As dependências de I/O, todas dubladas. `ordem` registra a sequência real. */
function deps(over: Record<string, unknown> = {}) {
	const ordem: string[] = [];
	const base = {
		agora: AGORA,
		entrarNaRegua: vi.fn(async () => 0),
		listarVencidas: vi.fn(async () => [] as LinhaDaRegua[]),
		toquesDoContato: vi.fn(async () => [] as Date[]),
		simulacaoDoContato: vi.fn(async () => null as Date | null),
		telefoneDaEquipe: vi.fn(async () => false),
		gravarEstado: vi.fn(async (_args: { estado: { step: number; status: string } }) => {
			ordem.push("grava");
		}),
		gravarRetomada: vi.fn(async () => {
			ordem.push("retomada");
		}),
		dispararTurno: vi.fn(async () => {
			ordem.push("turno");
		}),
		enviarArte: vi.fn(async () => {
			ordem.push("arte");
		}),
		enviarTemplate: vi.fn(async (_args: { usageKey: string }) => {
			ordem.push("template");
		}),
		despacharConversoes: vi.fn(async () => ({ enviados: 0 })),
		...over,
	};
	return { deps: base, ordem };
}

beforeEach(() => {
	bullmq.adds.length = 0;
	bullmq.workers.length = 0;
});

describe("o ciclo grava o contador ANTES de enviar", () => {
	it("turno de retomada: grava → conta a retomada → dispara o turno → anexa a arte", async () => {
		const { deps: d, ordem } = deps({ listarVencidas: vi.fn(async () => [linha()]) });
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(1);
		expect(ordem).toEqual(["grava", "retomada", "turno", "arte"]);
		// O que foi gravado tem o passo já contado — é o toque 01 do ciclo.
		const gravado = d.gravarEstado.mock.calls[0][0] as { estado: { step: number } };
		expect(gravado.estado.step).toBe(1);
	});

	it("template: grava → envia o template", async () => {
		const { deps: d, ordem } = deps({
			listarVencidas: vi.fn(async () => [
				linha({ lastInboundAt: new Date(AGORA.getTime() - 4 * DIA) }),
			]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(1);
		expect(ordem).toEqual(["grava", "template"]);
		// A chave lógica sai do objetivo — nunca do nome do template na Meta.
		const envio = d.enviarTemplate.mock.calls[0][0] as { usageKey: string };
		expect(envio.usageKey).toBe("remarketing_oportunidade_carro");
	});

	it("no MESMO tick, despacha as conversões pendentes do CAPI", async () => {
		const { deps: d } = deps({ listarVencidas: vi.fn(async () => [linha()]) });
		await runRemarketingCycle(d);
		expect(d.despacharConversoes).toHaveBeenCalledTimes(1);
	});
});

describe("os bloqueios do motor chegam ao ciclo", () => {
	it("telefone interno: nada é gravado nem enviado", async () => {
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [linha({ waId: "556292496793" })]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(0);
		expect(r.nada.telefone_interno).toBe(1);
		expect(d.gravarEstado).not.toHaveBeenCalled();
		expect(d.dispararTurno).not.toHaveBeenCalled();
	});

	it("teto de 30 dias montado pelo ciclo bloqueia o toque", async () => {
		const recentes = [
			new Date(AGORA.getTime() - 3 * DIA),
			new Date(AGORA.getTime() - 2 * DIA),
			new Date(AGORA.getTime() - 1 * DIA),
		];
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [linha()]),
			toquesDoContato: vi.fn(async () => recentes),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(0);
		expect(r.nada.teto_30_dias).toBe(1);
		expect(d.gravarEstado).not.toHaveBeenCalled();
	});

	it("quem respondeu não recebe: grava o terminal para sair do índice", async () => {
		const ultimoToque = new Date(AGORA.getTime() - 3 * DIA);
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [
				linha({
					step: 1,
					nextTouchAt: new Date(ultimoToque.getTime() + 3 * DIA),
					lastInboundAt: new Date(ultimoToque.getTime() + 30 * 60_000),
				}),
			]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(0);
		expect(r.nada.ja_respondeu).toBe(1);
		const gravado = d.gravarEstado.mock.calls[0][0] as { estado: { status: string } };
		expect(gravado.estado.status).toBe("RESPONDEU");
		expect(d.dispararTurno).not.toHaveBeenCalled();
	});

	it("opt-out por telefone bloqueia mesmo com estado reaberto", async () => {
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [
				linha({
					optoutDaPessoaEm: new Date(AGORA.getTime() - DIA),
				}),
			]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(0);
		expect(r.nada.optout_da_pessoa).toBe(1);
		const gravado = d.gravarEstado.mock.calls[0][0] as { estado: { status: string } };
		expect(gravado.estado.status).toBe("OPTOUT");
	});
});

describe("o job repetível tem jobId FIXO (uma cópia por vez)", () => {
	it("agenda com `repeat.every` e `jobId` fixo, como o gate-reengage-poll", async () => {
		process.env.REDIS_URL = "redis://localhost:6379";
		try {
			await startRemarketingWorker();
		} finally {
			process.env.REDIS_URL = undefined;
		}

		expect(bullmq.adds.length).toBe(1);
		expect(bullmq.adds[0].opts.jobId).toBe("remarketing-cycle-cron");
		expect(bullmq.adds[0].opts.repeat).toEqual({ every: 30_000 });
		expect(bullmq.workers.length).toBe(1);
	});
});
