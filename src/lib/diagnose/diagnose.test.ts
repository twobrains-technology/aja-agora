import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P314/L25 — O DIAGNÓSTICO TAMBÉM GASTA E TAMBÉM TEM QUE ENTRAR NA CONTA.
 *
 * `diagnoseConversation` é a chamada mais cara do fluxo de admin (Sonnet com o
 * transcript inteiro + a avaliação). Como o juiz, ela devolvia os tokens para a rota e
 * não gravava nada em `uso_de_ia` — o operador via `meta.tokensInput` na resposta e o
 * custo não aparecia em lugar nenhum depois que o Langfuse saiu.
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
	DIAGNOSIS_MODEL,
	diagnoseConversation,
} from "./diagnose";

const diagnostico = {
	rootCause: "O agente devolveu a decisão ao cliente em vez de conduzir ao fechamento.",
	suggestedExamples: [
		{
			userMessage: "Gostei da primeira.",
			assistantResponse: "Ótimo — vou avançar com essa cota.",
			rationale: "O agente deve assumir a condução.",
		},
	],
	suggestedForbiddenTopics: [],
	suggestedHandoffTriggers: [],
};

function mockGenerateObject(): void {
	__setGenerateObjectImplForTests((async () => ({
		object: diagnostico,
		usage: { inputTokens: 9_000, outputTokens: 300 },
	})) as never);
}

describe("P314/L25 — o diagnóstico registra o uso da IA", () => {
	beforeEach(() => {
		inserts.length = 0;
		mockGenerateObject();
	});

	afterEach(() => {
		__resetGenerateObjectImplForTests();
	});

	it("grava uma linha em `uso_de_ia` com o modelo do doutor e a conversa", async () => {
		const out = await diagnoseConversation({
			transcript: "Usuário: quero um imóvel de 300 mil",
			evaluation: {
				overallScore: 0.62,
				dimensions: null,
				flags: null,
				topIssues: ["não fechou"],
				topStrengths: null,
			},
			persona: {
				id: "(sem persona)",
				displayName: "(sem persona — conversa sem persona ativa)",
				voiceTone: "(não definido)",
				examples: [],
				forbiddenTopics: [],
				handoffTriggers: [],
			},
			context: { expertise: null, category: null, channel: "web", intent: null },
			conversationId: "22222222-2222-4222-8222-222222222222",
		});

		expect(out.tokensInput).toBe(9_000);

		expect(inserts).toHaveLength(1);
		expect(inserts[0].table).toBe(usoDeIa);
		expect(inserts[0].values).toMatchObject({
			conversationId: "22222222-2222-4222-8222-222222222222",
			modelo: DIAGNOSIS_MODEL,
			tokensInput: 9_000,
			tokensOutput: 300,
		});
	});

	it("sem conversa conhecida a linha ainda é gravada, com `conversationId` NULL", async () => {
		await diagnoseConversation({
			transcript: "Usuário: oi",
			evaluation: {
				overallScore: null,
				dimensions: null,
				flags: null,
				topIssues: null,
				topStrengths: null,
			},
			persona: {
				id: "(sem persona)",
				displayName: "(sem persona — conversa sem persona ativa)",
				voiceTone: "(não definido)",
				examples: [],
				forbiddenTopics: [],
				handoffTriggers: [],
			},
			context: { expertise: null, category: null, channel: "web", intent: null },
		});

		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({ modelo: DIAGNOSIS_MODEL, conversationId: null });
	});

	// P314 — o SDK reporta `inputTokens` como TOTAL do prompt, com o cache read/write já
	// somados. O livro-caixa guarda a entrada LÍQUIDA e as parcelas em colunas próprias:
	// sem isso a chamada com cache parecia inteiramente precificada como entrada.
	it("usage com cache separa entrada líquida e parcelas de cache", async () => {
		__setGenerateObjectImplForTests((async () => ({
			object: diagnostico,
			usage: {
				inputTokens: 9_000,
				outputTokens: 300,
				inputTokenDetails: {
					noCacheTokens: 6_000,
					cacheReadTokens: 2_500,
					cacheWriteTokens: 500,
				},
			},
		})) as never);

		const out = await diagnoseConversation({
			transcript: "Usuário: quero um imóvel de 300 mil",
			evaluation: {
				overallScore: 0.62,
				dimensions: null,
				flags: null,
				topIssues: ["não fechou"],
				topStrengths: null,
			},
			persona: {
				id: "(sem persona)",
				displayName: "(sem persona — conversa sem persona ativa)",
				voiceTone: "(não definido)",
				examples: [],
				forbiddenTopics: [],
				handoffTriggers: [],
			},
			context: { expertise: null, category: null, channel: "web", intent: null },
			conversationId: "22222222-2222-4222-8222-222222222222",
		});

		expect(inserts).toHaveLength(1);
		expect(inserts[0].values).toMatchObject({
			modelo: DIAGNOSIS_MODEL,
			tokensInput: 6_000,
			tokensOutput: 300,
			tokensCacheRead: 2_500,
			tokensCacheWrite: 500,
		});
		// O retorno acompanha o livro-caixa: entrada líquida, não o total do SDK.
		expect(out.tokensInput).toBe(6_000);
		// Soneto do diagnóstico sem preço conferido: custo DESCONHECIDO, nunca inventado.
		expect(inserts[0].values.custoUsdCents).toBeNull();
	});
});
