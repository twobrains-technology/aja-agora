import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { inserts, streamTextMock } = vi.hoisted(() => ({
	inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
	streamTextMock: vi.fn(),
}));

vi.mock("ai", () => ({ streamText: streamTextMock }));
vi.mock("@/db", () => ({
	db: {
		insert: (table: unknown) => ({
			values: async (values: Record<string, unknown>) => {
				inserts.push({ table, values });
			},
		}),
	},
}));

import { usoDeIa } from "@/db/schema";
import { generateMesaCopilotOpening, generateMesaCopilotReply } from "./index";

const modeloDeTeste = { modelId: "modelo-de-teste" } as unknown as LanguageModel;

describe("L25/P314 — o copiloto da mesa grava o que gastou em `uso_de_ia`", () => {
	beforeEach(() => {
		inserts.length = 0;
		streamTextMock.mockReset();
		streamTextMock.mockReturnValue({
			textStream: (async function* () {
				yield "1. Abra o sistema da administradora.";
				yield " 2. Cadastre o cliente.";
			})(),
			usage: Promise.resolve({ inputTokens: 3000, outputTokens: 420 }),
		});
	});

	it("a orientação do copiloto deixa linha de custo com a conversa do caso", async () => {
		const texto = await generateMesaCopilotReply({
			caso: { administradoraNome: null, docs: [] },
			history: [{ role: "attendant", content: "como cadastro?" }],
			model: modeloDeTeste,
			conversationId: "conv-mesa",
		});

		expect(texto).toBe("1. Abra o sistema da administradora. 2. Cadastre o cliente.");
		expect(inserts).toHaveLength(1);
		expect(inserts[0].table).toBe(usoDeIa);
		expect(inserts[0].values).toMatchObject({
			conversationId: "conv-mesa",
			modelo: "modelo-de-teste",
			tokensInput: 3000,
			tokensOutput: 420,
		});
	});

	it("consulta avulsa (sem conversa) grava com `conversationId` NULL", async () => {
		await generateMesaCopilotReply({
			caso: { administradoraNome: null, docs: [], modo: "avulso" },
			history: [{ role: "attendant", content: "e o comprovante?" }],
			model: modeloDeTeste,
		});

		expect(inserts).toHaveLength(1);
		expect(inserts[0].values.conversationId).toBeNull();
	});

	it("a orientação INICIAL (claim) repassa a conversa do caso pro livro-caixa", async () => {
		const texto = await generateMesaCopilotOpening({
			caso: { administradoraNome: "Consórcio X", docs: [] },
			model: modeloDeTeste,
			conversationId: "conv-claim",
		});

		expect(texto).toBe("1. Abra o sistema da administradora. 2. Cadastre o cliente.");
		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({ conversationId: "conv-claim" });
	});

	// P314 — o bloco STABLE pede `cacheControl` de 1 h; o provedor devolve o prompt lido
	// do cache separado do resto. Repassar o total do SDK como `tokensInput` gravava o
	// prompt cacheado pelo preço de entrada cheio — o custo saía MAIOR do que o real.
	it("usage com cache vira entrada líquida + parcelas de cache, no custo certo", async () => {
		streamTextMock.mockReturnValue({
			textStream: (async function* () {
				yield "1. Abra o sistema da administradora.";
			})(),
			usage: Promise.resolve({
				inputTokens: 5_200_000,
				outputTokens: 240_000,
				inputTokenDetails: {
					noCacheTokens: 3_200_000,
					cacheReadTokens: 1_800_000,
					cacheWriteTokens: 200_000,
				},
			}),
		});

		await generateMesaCopilotReply({
			caso: { administradoraNome: null, docs: [] },
			history: [{ role: "attendant", content: "como cadastro?" }],
			model: { modelId: "claude-haiku-4-5" } as unknown as LanguageModel,
			conversationId: "conv-cache",
		});

		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({
			conversationId: "conv-cache",
			modelo: "claude-haiku-4-5",
			tokensInput: 3_200_000,
			tokensOutput: 240_000,
			tokensCacheRead: 1_800_000,
			tokensCacheWrite: 200_000,
		});
		// 320 (entrada) + 120 (saída) + 18 (cache lido) + 25 (cache escrito) = 483. Pelo
		// total do SDK como entrada, seriam 640 — a diferença é a prova de que o cache
		// entrou na conta pela parcela certa.
		expect(inserts[0].values.custoUsdCents).toBe(483);
	});
});
