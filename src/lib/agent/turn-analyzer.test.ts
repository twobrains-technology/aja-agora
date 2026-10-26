import { beforeEach, describe, expect, it, vi } from "vitest";

const { inserts, generateObjectMock } = vi.hoisted(() => ({
	inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	generateObjectMock: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: generateObjectMock }));
vi.mock("@/db", () => ({
	db: {
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
			},
		}),
	},
}));
vi.mock("./personas-repo", () => ({
	listExpertisesByCategory: async () => ({ imovel: [], auto: [], moto: [] }),
}));

import { usoDeIa } from "@/db/schema";
import { analyzeTurn } from "./turn-analyzer";

const respostaDoModelo = {
	reasoning: "cliente citou valor",
	detectedCategory: "auto",
	detectedSubTopic: null,
	isExplicitSwitch: false,
	expertiseLevel: "neutro",
	experiencePrev: null,
	creditMin: null,
	creditMax: 80000,
	prazoMeses: null,
	hasLance: null,
	monthlyBudget: null,
	monthlySavings: null,
	fgtsValue: null,
	desiredItem: null,
	motivation: null,
	userIntent: "providing_info",
};

describe("L25/P314 — o analyzer grava o que gastou em `uso_de_ia`", () => {
	beforeEach(() => {
		inserts.length = 0;
		generateObjectMock.mockReset();
		generateObjectMock.mockResolvedValue({
			object: respostaDoModelo,
			usage: { inputTokens: 4200, outputTokens: 180 },
		});
	});

	it("a chamada do analyzer deixa linha de custo com a conversa", async () => {
		await analyzeTurn("quero um carro de 80 mil", "auto", {}, undefined, "conv-analyzer");

		expect(inserts).toHaveLength(1);
		expect(inserts[0].table).toBe(usoDeIa);
		expect(inserts[0].values).toMatchObject({
			conversationId: "conv-analyzer",
			tokensInput: 4200,
			tokensOutput: 180,
		});
		expect(typeof inserts[0].values.modelo).toBe("string");
	});

	it("sem conversa conhecida a linha sai com `conversationId` NULL", async () => {
		await analyzeTurn("oi", "auto", {});
		expect(inserts[0].values.conversationId).toBeNull();
	});

	// P2/P314 — o `generateObject` do analyzer entrega `inputTokenDetails`; repassar só os
	// totais grava o prompt cacheado como entrada de preço cheio e o custo do turno sai
	// inconsistente com a linha do analyzer.
	it("usage com cache grava a entrada líquida e cobra as parcelas de cache", async () => {
		process.env.AI_ANALYZER_MODEL = "claude-haiku-4-5";
		generateObjectMock.mockResolvedValue({
			object: respostaDoModelo,
			usage: {
				inputTokens: 2_200_000,
				outputTokens: 20_000,
				inputTokenDetails: {
					noCacheTokens: 1_000_000,
					cacheReadTokens: 1_000_000,
					cacheWriteTokens: 200_000,
				},
			},
		});

		try {
			await analyzeTurn("quero um carro de 80 mil", "auto", {}, undefined, "conv-analyzer");
		} finally {
			delete process.env.AI_ANALYZER_MODEL;
		}

		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			tokensOutput: 20_000,
			tokensCacheRead: 1_000_000,
			tokensCacheWrite: 200_000,
			// 1,0 US$ de entrada + 0,10 de saída + 0,10 de cache lido + 0,25 de cache
			// escrito = 1,45 US$ = 145 centavos.
			custoUsdCents: 145,
		});
	});

	it("o analyzer cai no fallback neutro sem gravar custo quando o provedor falha", async () => {
		generateObjectMock.mockRejectedValueOnce(new Error("400 do gateway"));
		const erro = vi.spyOn(console, "error").mockImplementation(() => {});

		const resultado = await analyzeTurn("oi", "auto", {}, undefined, "conv-analyzer");

		expect(resultado.userIntent).toBe("neutral");
		expect(inserts).toHaveLength(0);
		erro.mockRestore();
	});
});
