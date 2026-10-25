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

	it("o analyzer cai no fallback neutro sem gravar custo quando o provedor falha", async () => {
		generateObjectMock.mockRejectedValueOnce(new Error("400 do gateway"));
		const erro = vi.spyOn(console, "error").mockImplementation(() => {});

		const resultado = await analyzeTurn("oi", "auto", {}, undefined, "conv-analyzer");

		expect(resultado.userIntent).toBe("neutral");
		expect(inserts).toHaveLength(0);
		erro.mockRestore();
	});
});
