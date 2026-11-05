import { beforeEach, describe, expect, it, vi } from "vitest";

const { estado } = vi.hoisted(() => ({
	estado: {
		config: null as { baseUrl: string; publicKey: string; secretKey: string } | null,
		resposta: { ok: true, status: 200, json: async () => ({ data: [] }) } as unknown as Response,
		linhasSemDuracao: [] as Array<{ id: string }>,
		updates: [] as Array<{ id: string; set: Record<string, unknown> }>,
		fetchError: null as unknown,
	},
}));

vi.mock("@/lib/agent/pi/langfuse", () => ({
	configDoLangfuse: () => estado.config,
}));

vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({
						limit: async () => estado.linhasSemDuracao,
					}),
				}),
			}),
		}),
		update: () => ({
			set: (set: Record<string, unknown>) => ({
				where: (cond: unknown) => {
					estado.updates.push({ id: String(cond), set });
					return Promise.resolve();
				},
			}),
		}),
	},
}));

import {
	duracaoDasObservations,
	type ObservationDoLangfuse,
	registrarDuracaoDoTurno,
	ttftDasObservations,
} from "./duracao-do-turno";

const CONFIG = {
	baseUrl: "https://langfuse.exemplo.com",
	publicKey: "pk",
	secretKey: "sk",
};

const generation = (start: string, completion: string | null): ObservationDoLangfuse => ({
	type: "GENERATION",
	startTime: start,
	endTime: null,
	completionStartTime: completion,
});

describe("B6 — TTFT e duração do turno", () => {
	beforeEach(() => {
		estado.config = CONFIG;
		estado.resposta = {
			ok: true,
			status: 200,
			json: async () => ({ data: [] }),
		} as unknown as Response;
		estado.linhasSemDuracao = [];
		estado.updates = [];
		estado.fetchError = null;
	});

	describe("ttftDasObservations", () => {
		it("o completionStartTime da generation menos o startTime", () => {
			expect(
				ttftDasObservations([generation("2026-11-05T10:00:00.000Z", "2026-11-05T10:00:01.500Z")]),
			).toBe(1500);
		});

		it("a última generation com o campo vence — o turno pode ter vários beats", () => {
			expect(
				ttftDasObservations([
					generation("2026-11-05T10:00:00.000Z", "2026-11-05T10:00:01.000Z"),
					generation("2026-11-05T10:00:05.000Z", "2026-11-05T10:00:05.250Z"),
				]),
			).toBe(250);
		});

		it("span de tool não é generation — o TTFT é da chamada de LLM", () => {
			expect(
				ttftDasObservations([
					{
						type: "TOOLCALL",
						startTime: "2026-11-05T10:00:00.000Z",
						endTime: "2026-11-05T10:00:02.000Z",
						completionStartTime: "2026-11-05T10:00:02.000Z",
					},
					generation("2026-11-05T10:00:03.000Z", null),
				]),
			).toBeNull();
		});

		it("sem completionStartTime em nenhuma generation: null — não medido não é instantâneo", () => {
			expect(ttftDasObservations([generation("2026-11-05T10:00:00.000Z", null)])).toBeNull();
		});
	});

	describe("duracaoDasObservations", () => {
		it("o span do primeiro ao último instante reportado", () => {
			expect(
				duracaoDasObservations([
					generation("2026-11-05T10:00:00.000Z", "2026-11-05T10:00:01.500Z"),
					{
						type: "TOOLCALL",
						startTime: "2026-11-05T10:00:00.500Z",
						endTime: "2026-11-05T10:00:02.000Z",
						completionStartTime: null,
					},
				]),
			).toBe(2000);
		});

		it("sem instante nenhum: null", () => {
			expect(duracaoDasObservations([])).toBeNull();
		});
	});

	describe("registrarDuracaoDoTurno", () => {
		it("sem envs de Langfuse: no-op — nem consulta nem gravação", async () => {
			estado.config = null;
			await registrarDuracaoDoTurno({
				traceId: "t-1",
				conversationId: "conv-1",
				durationMs: 1200,
			});
			expect(estado.updates).toHaveLength(0);
		});

		it("grava duracaoMs local e ttft lido da generation na linha do turno", async () => {
			estado.linhasSemDuracao = [{ id: "linha-7" }];
			estado.resposta = {
				ok: true,
				status: 200,
				json: async () => ({
					data: [generation("2026-11-05T10:00:00.000Z", "2026-11-05T10:00:00.800Z")],
				}),
			} as unknown as Response;

			await registrarDuracaoDoTurno(
				{
					traceId: "t-1",
					conversationId: "conv-1",
					durationMs: 3210,
				},
				{ fetch: async () => estado.resposta },
			);

			expect(estado.updates).toHaveLength(1);
			expect(estado.updates[0].set).toMatchObject({ duracaoMs: 3210, ttftMs: 800 });
		});

		it("durationMs local ausente cai no span das observations", async () => {
			estado.linhasSemDuracao = [{ id: "linha-8" }];
			estado.resposta = {
				ok: true,
				status: 200,
				json: async () => ({
					data: [
						generation("2026-11-05T10:00:00.000Z", null),
						{
							type: "GENERATION",
							startTime: "2026-11-05T10:00:01.000Z",
							endTime: "2026-11-05T10:00:03.000Z",
							completionStartTime: null,
						},
					],
				}),
			} as unknown as Response;

			await registrarDuracaoDoTurno(
				{
					traceId: "t-1",
					conversationId: "conv-1",
					durationMs: null,
				},
				{ fetch: async () => estado.resposta },
			);

			expect(estado.updates[0].set).toMatchObject({ duracaoMs: 3000, ttftMs: null });
		});

		it("API fora do ar: falha engolida, nada gravado", async () => {
			estado.resposta = { ok: false, status: 503 } as unknown as Response;
			await registrarDuracaoDoTurno(
				{
					traceId: "t-1",
					conversationId: "conv-1",
					durationMs: 1200,
				},
				{ fetch: async () => estado.resposta },
			);
			expect(estado.updates).toHaveLength(0);
		});

		it("erro de rede engolido — observabilidade nunca derruba nada", async () => {
			estado.resposta = {
				ok: true,
				status: 200,
				json: () => Promise.reject(new Error("conexão caiu")),
			} as unknown as Response;
			await expect(
				registrarDuracaoDoTurno(
					{
						traceId: "t-1",
						conversationId: "conv-1",
						durationMs: 1200,
					},
					{ fetch: async () => estado.resposta },
				),
			).resolves.toBeUndefined();
			expect(estado.updates).toHaveLength(0);
		});

		it("linha sem duracao não existe: nada gravado", async () => {
			estado.resposta = {
				ok: true,
				status: 200,
				json: async () => ({
					data: [generation("2026-11-05T10:00:00.000Z", "2026-11-05T10:00:00.800Z")],
				}),
			} as unknown as Response;
			await registrarDuracaoDoTurno(
				{
					traceId: "t-1",
					conversationId: "conv-1",
					durationMs: 1200,
				},
				{ fetch: async () => estado.resposta },
			);
			expect(estado.updates).toHaveLength(0);
		});
	});
});
