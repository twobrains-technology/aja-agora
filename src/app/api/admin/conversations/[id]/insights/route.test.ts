import { beforeEach, describe, expect, it, vi } from "vitest";

const { inserts, generateTextMock } = vi.hoisted(() => ({
	inserts: [] as Array<{ table: unknown; values: unknown }>,
	generateTextMock: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: generateTextMock }));
vi.mock("@/lib/admin/require-role", () => ({ requireRole: async () => ({ error: null }) }));
vi.mock("@/lib/llm/gateway-anthropic", () => ({
	createGatewayAnthropic: () => (id: string) => ({ modelId: id }),
}));
vi.mock("@/db", () => ({
	db: {
		query: {
			leadInsights: { findMany: async () => [] },
			conversations: {
				findFirst: async () => ({
					id: "11111111-1111-4111-8111-111111111111",
					messages: [
						{ role: "user", content: "quero um carro de 80 mil" },
						{ role: "assistant", content: "posso te mostrar umas cotas" },
					],
				}),
			},
		},
		insert: (table: unknown) => ({
			values: async (values: unknown) => {
				inserts.push({ table, values });
			},
		}),
		delete: () => ({ where: async () => undefined }),
	},
}));

import { usoDeIa } from "@/db/schema";
import { POST } from "./route";

const corpoDoModelo = JSON.stringify({
	intent: "quer um carro de 80 mil",
	budget: { monthly: 850, total: 80000, notes: "" },
	objections: [],
	next_action: "mostrar cotas de auto",
});

describe("L25/P314 — os insights da conversa gravam custo em `uso_de_ia`", () => {
	beforeEach(() => {
		inserts.length = 0;
		generateTextMock.mockReset();
		generateTextMock.mockResolvedValue({
			text: corpoDoModelo,
			usage: { inputTokens: 5200, outputTokens: 240 },
		});
	});

	it("a chamada de insights deixa linha de custo com a conversa", async () => {
		const res = await POST(new Request("http://localhost/api", { method: "POST" }), {
			params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
		});

		expect(res.status).toBe(200);
		const linhaDeCusto = inserts.find((i) => i.table === usoDeIa);
		expect(linhaDeCusto).toBeDefined();
		expect(linhaDeCusto?.values).toMatchObject({
			conversationId: "11111111-1111-4111-8111-111111111111",
			modelo: "claude-haiku-4-5",
			tokensInput: 5200,
			tokensOutput: 240,
		});
	});

	// P314 — o prompt de insights é o transcript inteiro, e o provedor devolve o que veio
	// do cache separado do resto da entrada. O total do SDK como `tokensInput` fazia a
	// chamada parecer inteiramente de entrada cheia (custo para mais).
	it("usage com cache separa entrada líquida e parcelas de cache", async () => {
		generateTextMock.mockResolvedValue({
			text: corpoDoModelo,
			usage: {
				inputTokens: 5_200_000,
				outputTokens: 240_000,
				inputTokenDetails: {
					noCacheTokens: 3_200_000,
					cacheReadTokens: 1_800_000,
					cacheWriteTokens: 200_000,
				},
			},
		});

		const res = await POST(new Request("http://localhost/api", { method: "POST" }), {
			params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
		});

		expect(res.status).toBe(200);
		const linhaDeCusto = inserts.find((i) => i.table === usoDeIa);
		expect(linhaDeCusto?.values).toMatchObject({
			conversationId: "11111111-1111-4111-8111-111111111111",
			modelo: "claude-haiku-4-5",
			tokensInput: 3_200_000,
			tokensOutput: 240_000,
			tokensCacheRead: 1_800_000,
			tokensCacheWrite: 200_000,
		});
		// 320 (entrada) + 120 (saída) + 18 (cache lido) + 25 (cache escrito) = 483;
		// cobrando o total do SDK como entrada daria 640.
		expect((linhaDeCusto?.values as { custoUsdCents: number }).custoUsdCents).toBe(483);
	});
});
