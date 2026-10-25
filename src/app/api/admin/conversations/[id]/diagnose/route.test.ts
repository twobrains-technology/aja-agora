import { beforeEach, describe, expect, it, vi } from "vitest";

const { diagnoseMock, getPersonaMock, conv, evaluation } = vi.hoisted(() => ({
	diagnoseMock: vi.fn(),
	getPersonaMock: vi.fn(),
	conv: {
		valor: {
			id: "11111111-1111-4111-8111-111111111111",
			status: "active" as const,
			channel: "web" as const,
			metadata: null as Record<string, unknown> | null,
			messages: [
				{
					id: "22222222-2222-4222-8222-222222222222",
					role: "user" as const,
					content: "quero um carro de 80 mil",
					createdAt: new Date("2026-10-20T12:00:00Z"),
					personaId: null,
					artifacts: [],
				},
			],
		},
	},
	evaluation: {
		valor: {
			id: "33333333-3333-4333-8333-333333333333",
			personaId: null as string | null,
			overallScore: "0.40",
			dimensions: null,
			flags: null,
			topIssues: ["não explicou o que é consórcio"],
			topStrengths: null,
		},
	},
}));

vi.mock("@/lib/admin/require-role", () => ({ requireRole: async () => ({ error: null }) }));
vi.mock("@/lib/agent/personas-repo", () => ({ getPersonaForAdmin: getPersonaMock }));
vi.mock("@/lib/diagnose/diagnose", () => ({
	DiagnosisError: class extends Error {},
	diagnoseConversation: diagnoseMock,
}));
vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: async () => conv.valor },
			conversationEvaluations: { findFirst: async () => evaluation.valor },
		},
	},
}));

import { POST } from "./route";

const pedido = () =>
	POST(new Request("http://localhost/api"), {
		params: Promise.resolve({ id: conv.valor.id }),
	});

describe("L38/P042 — o diagnóstico funciona sem persona ativa", () => {
	beforeEach(() => {
		conv.valor.metadata = null;
		evaluation.valor.personaId = null;
		getPersonaMock.mockReset();
		diagnoseMock.mockReset();
		diagnoseMock.mockResolvedValue({
			result: { rootCause: "faltou explicar o produto", suggestedExamples: [] },
			tokensInput: 100,
			tokensOutput: 20,
			durationMs: 10,
		});
	});

	it("conversa sem persona responde 200 e diagnostica mesmo assim", async () => {
		const res = await pedido();

		expect(res.status).toBe(200);
		expect(diagnoseMock).toHaveBeenCalledOnce();
		const enviado = diagnoseMock.mock.calls[0][0];
		// Sem persona, o prompt recebe um retrato vazio — não um id falso que o
		// operador tentaria aplicar depois.
		expect(enviado.persona.examples).toEqual([]);
		expect(enviado.persona.forbiddenTopics).toEqual([]);
		expect(enviado.persona.handoffTriggers).toEqual([]);
		expect(getPersonaMock).not.toHaveBeenCalled();

		const corpo = await res.json();
		expect(corpo.meta.personaId).toBeNull();
	});

	it("persona citada mas já removida também diagnóstica (não vira 422)", async () => {
		evaluation.valor.personaId = "persona-apagada";
		getPersonaMock.mockRejectedValue(new Error('persona "persona-apagada" not found'));

		const res = await pedido();

		expect(res.status).toBe(200);
		expect(diagnoseMock).toHaveBeenCalledOnce();
	});

	it("com persona viva, o retrato vai completo pra análise", async () => {
		evaluation.valor.personaId = "persona-viva";
		getPersonaMock.mockResolvedValue({
			id: "persona-viva",
			displayName: "Consultor",
			voiceTone: "próximo",
			examples: [],
			forbiddenTopics: [],
			handoffTriggers: [],
		});

		const res = await pedido();

		expect(res.status).toBe(200);
		expect(diagnoseMock.mock.calls[0][0].persona).toMatchObject({
			id: "persona-viva",
			displayName: "Consultor",
		});
		const corpo = await res.json();
		expect(corpo.meta.personaId).toBe("persona-viva");
	});
});
