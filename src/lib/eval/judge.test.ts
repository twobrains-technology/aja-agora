import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P314/L25 — A CHAMADA DO JUIZ TEM QUE ENTRAR NO LIVRO-CAIXA.
 *
 * O juiz é uma chamada de LLM em produção (Sonnet, temperature 0) e devolvia
 * `tokensInput`/`tokensOutput` para quem chamou sem registrar nada em `uso_de_ia`.
 * Enquanto o Langfuse existia, a instrumentação global capturava a chamada; com ele
 * fora, o gasto do juiz simplesmente não aparecia na conta do CPC. O que este arquivo
 * cobra é a linha em `uso_de_ia` com o MODELO e a CONVERSA de cada julgamento.
 */

const { inserts } = vi.hoisted(() => ({
	inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
}));

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
import {
	__resetGenerateObjectImplForTests,
	__setGenerateObjectImplForTests,
	JUDGE_MODEL,
	judgeConversation,
} from "./judge";
import type { DeterministicSignals } from "./signals";

const sinais: DeterministicSignals = {
	replyRate: 1,
	qualifyCoverage: 0.5,
	qualifyMissing: [],
	numbersInTextFlagged: [],
	dropOffGate: null,
	conversionStage: "qualificado",
	hasLead: true,
	personaSegments: [],
	propostas: 0,
	contratoFechado: false,
	repeticoesDoAgente: 0,
	alertas: [],
};

const julgamento = {
	dimensions: {
		engajamento: { score: 0.8, reasoning: "usuário respondeu tudo" },
		discovery: { score: 0.6, reasoning: "faltou prazo" },
		continuidade: { score: 0.7, reasoning: "avançou" },
		naturalidade: { score: 0.9, reasoning: "tom bom" },
		assertividade: { score: 0.5, reasoning: "não pediu a escolha" },
	},
	flags: {
		hallucination: false,
		missedHandoff: false,
		incompleteDiscovery: true,
		lowEngagement: false,
	},
	topIssues: ["não conduziu ao fechamento"],
	topStrengths: ["tom próximo"],
};

function mockGenerateObject(): void {
	__setGenerateObjectImplForTests((async () => ({
		object: julgamento,
		usage: { inputTokens: 12_000, outputTokens: 400 },
	})) as never);
}

describe("P314/L25 — o julgamento registra o uso da IA", () => {
	beforeEach(() => {
		inserts.length = 0;
		mockGenerateObject();
	});

	afterEach(() => {
		__resetGenerateObjectImplForTests();
	});

	it("grava uma linha em `uso_de_ia` com o modelo do juiz e a conversa", async () => {
		const out = await judgeConversation({
			transcript: "Usuário: quero um imóvel de 300 mil",
			personas: [],
			signals: sinais,
			conversationId: "11111111-1111-4111-8111-111111111111",
		});

		// O retorno continua o mesmo — registrar é observabilidade, não muda o julgamento.
		expect(out.result.topIssues).toEqual(["não conduziu ao fechamento"]);
		expect(out.tokensInput).toBe(12_000);

		expect(inserts).toHaveLength(1);
		expect(inserts[0].table).toBe(usoDeIa);
		expect(inserts[0].values).toMatchObject({
			conversationId: "11111111-1111-4111-8111-111111111111",
			modelo: JUDGE_MODEL,
			tokensInput: 12_000,
			tokensOutput: 400,
		});
	});

	it("sem conversa conhecida a linha ainda é gravada, com `conversationId` NULL", async () => {
		await judgeConversation({
			transcript: "Usuário: oi",
			personas: [],
			signals: sinais,
		});

		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({ modelo: JUDGE_MODEL, conversationId: null });
	});

	// P314 — o SDK reporta `inputTokens` como TOTAL do prompt, com o cache read/write já
	// somados. O livro-caixa guarda a entrada LÍQUIDA e as parcelas em colunas próprias:
	// sem isso a chamada com cache parecia inteiramente precificada como entrada.
	it("usage com cache separa entrada líquida e parcelas de cache", async () => {
		__setGenerateObjectImplForTests((async () => ({
			object: julgamento,
			usage: {
				inputTokens: 12_000,
				outputTokens: 400,
				inputTokenDetails: {
					noCacheTokens: 9_000,
					cacheReadTokens: 2_800,
					cacheWriteTokens: 200,
				},
			},
		})) as never);

		const out = await judgeConversation({
			transcript: "Usuário: quero um imóvel de 300 mil",
			personas: [],
			signals: sinais,
			conversationId: "11111111-1111-4111-8111-111111111111",
		});

		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({
			modelo: JUDGE_MODEL,
			tokensInput: 9_000,
			tokensOutput: 400,
			tokensCacheRead: 2_800,
			tokensCacheWrite: 200,
		});
		// O retorno acompanha o livro-caixa: entrada líquida, não o total do SDK.
		expect(out.tokensInput).toBe(9_000);
		// Soneto do juiz sem preço conferido: custo DESCONHECIDO, nunca inventado.
		expect(inserts[0].values.custoUsdCents).toBeNull();
	});
});
