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
			leads: {
				findFirst: async () => ({
					id: "44444444-4444-4444-8444-444444444444",
					conversation: {
						id: "11111111-1111-4111-8111-111111111111",
						messages: [
							{ role: "user", content: "quero um carro de 80 mil" },
							{ role: "assistant", content: "posso te mostrar umas cotas" },
						],
					},
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

describe("L25/P314 — os insights do lead gravam custo em `uso_de_ia`", () => {
	beforeEach(() => {
		inserts.length = 0;
		generateTextMock.mockReset();
		generateTextMock.mockResolvedValue({
			text: corpoDoModelo,
			usage: { inputTokens: 4100, outputTokens: 210 },
		});
	});

	it("a chamada de insights do lead deixa linha de custo com a conversa dele", async () => {
		const res = await POST(new Request("http://localhost/api", { method: "POST" }), {
			params: Promise.resolve({ id: "44444444-4444-4444-8444-444444444444" }),
		});

		expect(res.status).toBe(200);
		const linhaDeCusto = inserts.find((i) => i.table === usoDeIa);
		expect(linhaDeCusto).toBeDefined();
		expect(linhaDeCusto?.values).toMatchObject({
			conversationId: "11111111-1111-4111-8111-111111111111",
			modelo: "claude-haiku-4-5",
			tokensInput: 4100,
			tokensOutput: 210,
		});
	});
});
