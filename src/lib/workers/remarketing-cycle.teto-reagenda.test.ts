// P4 no CICLO — a linha ATIVO presa no teto de 30 dias é REAGENDADA, não vencida.
//
// O motor puro já prova a decisão (`remarketing/motor.teto-reagenda.test.ts`).
// Aqui o que se prova é o efeito no banco: o ciclo GRAVA o reagendamento com
// `next_touch_at` futuro, mantendo `status = 'ATIVO'`. Antes do conserto o motor
// devolvia `proximoEstado: null` nesse bloqueio e o ciclo não gravava nada — a
// data ficava no passado e o painel mostrava toque vencido sem explicar por quê.

import { beforeEach, describe, expect, it, vi } from "vitest";

const bullmq = vi.hoisted(() => ({ adds: [] as unknown[] }));

vi.mock("bullmq", () => ({
	Queue: class {
		async add(...args: unknown[]) {
			bullmq.adds.push(args);
		}
	},
	Worker: class {},
}));
vi.mock("ioredis", () => ({ default: class {} }));

import type { EstadoRegua } from "@/lib/remarketing/regua";
import { type LinhaDaRegua, runRemarketingCycle } from "./remarketing-cycle";

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-10-05T15:00:00Z"); // 12h em Brasília

const MAIS_ANTIGO = new Date(AGORA.getTime() - 25 * DIA);

function linhaNoTeto(): LinhaDaRegua {
	return {
		conversationId: "11111111-1111-1111-1111-111111111111",
		contactId: "22222222-2222-2222-2222-222222222222",
		objetivo: "carro",
		step: 3,
		status: "ATIVO",
		nextTouchAt: new Date(AGORA.getTime() - 3 * DIA),
		ultimoToqueEm: new Date(AGORA.getTime() - 2 * DIA),
		touches30d: 3,
		motivoSaida: null,
		channel: "whatsapp",
		waId: "5562999998888",
		metadata: {},
		// O silêncio é ANTERIOR ao último toque: a sequência segue ATIVA.
		lastInboundAt: new Date(AGORA.getTime() - 5 * DIA),
		ultimaMensagemDoClienteEm: null,
		phone: null,
		nome: "Ana",
		optoutDaPessoaEm: null,
		viuOferta: false,
		teveProposta: false,
	};
}

beforeEach(() => {
	bullmq.adds.length = 0;
	process.env.REMARKETING_ATIVO = "1";
});

describe("P4 — o ciclo reagenda a linha no teto", () => {
	it("grava next_touch_at futuro (toque mais antigo + 30 dias), sem disparar nada", async () => {
		const gravados: Array<{ estado: EstadoRegua }> = [];
		const dispararTurno = vi.fn(async () => {});
		const enviarTemplate = vi.fn(async () => {});

		const resultado = await runRemarketingCycle({
			agora: AGORA,
			entrarNaRegua: vi.fn(async () => 0),
			listarVencidas: vi.fn(async () => [linhaNoTeto()]),
			toquesDoContato: vi.fn(async () => [
				MAIS_ANTIGO,
				new Date(AGORA.getTime() - 10 * DIA),
				new Date(AGORA.getTime() - 2 * DIA),
			]),
			simulacaoDoContato: vi.fn(async () => null),
			telefoneDaEquipe: vi.fn(async () => false),
			gravarEstado: vi.fn(async ({ estado }: { estado: EstadoRegua }) => {
				gravados.push({ estado });
			}),
			segurarToquesDaEquipe: vi.fn(async () => 0),
			dispararTurno,
			enviarArte: vi.fn(async () => {}),
			enviarTemplate,
			compensarToque: vi.fn(async () => {}),
			despacharConversoes: vi.fn(async () => ({ enviados: 0 })),
		});

		expect(resultado.disparados).toBe(0);
		expect(dispararTurno).not.toHaveBeenCalled();
		expect(enviarTemplate).not.toHaveBeenCalled();
		expect(resultado.nada.teto_30_dias).toBe(1);

		expect(gravados).toHaveLength(1);
		const estado = gravados[0]?.estado as EstadoRegua;
		expect(estado.status).toBe("ATIVO");
		expect(estado.nextTouchAt?.toISOString()).toBe(
			new Date(MAIS_ANTIGO.getTime() + 30 * DIA).toISOString(),
		);
		expect((estado.nextTouchAt as Date).getTime()).toBeGreaterThan(AGORA.getTime());
	});
});
