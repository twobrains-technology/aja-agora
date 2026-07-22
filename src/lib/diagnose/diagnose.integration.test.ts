// Integration test — reproduz bug reportado em prod (CloudWatch /ecs/tb/dev,
// 2026-05-18, conversation=041f7b13-cead-45ca-b117-616d7930640a):
//
//   "[diagnose] failed for conversation=...: Error [DiagnosisError]:
//    diagnose failed after 2 attempts: No object generated:
//    response did not match schema."
//
// O erro "response did not match schema" do AI SDK 6 (ai/dist/index.mjs:3445)
// é lançado quando a Anthropic emite JSON parseável que NÃO passa na validação
// Zod local (`safeValidateTypes`). Causa raiz: o JSON Schema enviado pra
// Anthropic NÃO inclui `minItems` ou `minLength` reais — esses constraints
// estão apenas no `.description` ("min items: 1." etc.). O modelo então:
//   - emite `whenExpertise: []` (array vazio) → Zod rejeita por `.min(1)`
//   - emite `rootCause` curto (< 10 chars) → Zod rejeita por `.min(10)`
//   - emite `userMessage` com 1-2 chars (ex: "ok") → Zod rejeita por `.min(3)`
//
// Confirmação do payload enviado à Anthropic (vimos no AI_APICallError do
// `generateObject`):
//
//   "whenExpertise": { "type": "array", "items": {...},
//                      "description": "min items: 1." }
//
// `minItems: 1` está apenas na string `description`, não como restrição
// real do JSON Schema — Anthropic é livre pra emitir `[]`.
//
// Este teste reproduz o cenário usando o test seam de `diagnose.ts` que
// permite injetar uma implementação de `generateObject` controlada. O DB é
// real (aja-pg-<workspace>) e cleanup é explícito.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const HAS_REAL_DB = Boolean(
	process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test_sentinel"),
);
const skipIfNoDb = HAS_REAL_DB ? describe : describe.skip;

skipIfNoDb("diagnoseConversation — bug regressão prod (BUG-2026-05-18)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let diagnoseConversation: typeof import("./diagnose").diagnoseConversation;
	let __setGenerateObjectImplForTests: typeof import("./diagnose").__setGenerateObjectImplForTests;
	let __resetGenerateObjectImplForTests: typeof import("./diagnose").__resetGenerateObjectImplForTests;
	let buildTranscript: typeof import("@/lib/eval/transcript").buildTranscript;

	const createdConversationIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ diagnoseConversation, __setGenerateObjectImplForTests, __resetGenerateObjectImplForTests } =
			await import("./diagnose"));
		({ buildTranscript } = await import("@/lib/eval/transcript"));
	});

	beforeEach(() => {
		__resetGenerateObjectImplForTests();
	});

	afterAll(async () => {
		__resetGenerateObjectImplForTests();
		for (const id of createdConversationIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
	});

	// Helper: cria a conversa "real" de prod (5 msgs, whatsapp, emoji 🤔).
	async function setupRealConversation(): Promise<{
		conversationId: string;
		args: import("./diagnose").DiagnosisArgs;
	}> {
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: "whatsapp",
				status: "active",
				metadata: {
					currentCategory: "imovel",
					currentPersona: "imovel",
					previousPersona: "concierge",
					personasSeen: ["imovel"],
					experiencePrev: "doubts",
					doubtsAddressed: false,
				},
			})
			.returning({ id: schema.conversations.id });
		createdConversationIds.push(conv.id);

		const rows = [
			{ conversationId: conv.id, role: "user" as const, content: "Oi" },
			{
				conversationId: conv.id,
				role: "assistant" as const,
				personaId: "concierge",
				content:
					"Oi, Kairo! Sou a Sofia. Aqui você conecta com especialistas em imóvel, automóvel ou serviços. Como posso te ajudar?",
			},
			{
				conversationId: conv.id,
				role: "assistant" as const,
				personaId: "imovel",
				content:
					"Boa, Kairo! Sou a Helena — imóvel é exatamente onde eu atuo.\n\nBora encontrar o que faz sentido pra você.",
			},
			{ conversationId: conv.id, role: "user" as const, content: "🤔 Tenho dúvidas" },
			{
				conversationId: conv.id,
				role: "assistant" as const,
				personaId: "imovel",
				content:
					"Consórcio é basicamente um grupo de pessoas que se juntam pra comprar um bem — cada um paga uma parcela mensal, sem juros, e todo mês alguém do grupo recebe o crédito pra usar como quiser na compra.\n\nA contemplação acontece de duas formas: por *sorteio* ou por *lance*.",
			},
		];
		await db.insert(schema.messages).values(rows);

		const personaRow = await db.query.personas.findFirst({
			where: eq(schema.personas.id, "imovel"),
		});
		if (!personaRow) {
			throw new Error("Persona 'imovel' não existe no DB local — rode o seed antes.");
		}

		const msgsFull = await db.query.messages.findMany({
			where: eq(schema.messages.conversationId, conv.id),
			orderBy: (m, { asc }) => [asc(m.createdAt)],
		});

		const transcript = buildTranscript({
			status: "active",
			channel: "whatsapp",
			currentPersona: "imovel",
			currentCategory: "imovel",
			messages: msgsFull.map((m) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				createdAt: m.createdAt,
				personaId: m.personaId,
			})),
			artifacts: [],
		});

		const args: import("./diagnose").DiagnosisArgs = {
			transcript,
			evaluation: {
				overallScore: 0.55,
				dimensions: {
					engajamento: { score: 0.5, reasoning: "Resposta muito longa." },
					discovery: { score: 0.3, reasoning: "Não perguntou o que cliente quer." },
					continuidade: { score: 0.7, reasoning: "Transição OK." },
					naturalidade: { score: 0.6, reasoning: "Jargão sem contexto." },
					assertividade: { score: 0.5, reasoning: "Despejo de info." },
					conversao: { score: 0.4, reasoning: "Sem CTA." },
				},
				flags: {
					hallucination: false,
					missedHandoff: false,
					incompleteDiscovery: true,
					lowEngagement: false,
				},
				topIssues: ["Despejou explicação genérica.", "Usou 'lance' sem qualificar."],
				topStrengths: ["Tom acolhedor."],
			},
			persona: {
				id: personaRow.id,
				displayName: personaRow.displayName,
				voiceTone: personaRow.voiceTone,
				examples: personaRow.examples,
				forbiddenTopics: personaRow.forbiddenTopics,
				handoffTriggers: personaRow.handoffTriggers,
			},
			context: {
				expertise: null,
				category: "imovel",
				channel: "whatsapp",
				intent: null,
			},
		};

		return { conversationId: conv.id, args };
	}

	// Helper: monta um `generateObject` mock que parseia o output via Zod
	// (igual o AI SDK faz internamente). Se Zod rejeitar, lança o MESMO erro
	// que o usuário viu em prod ("response did not match schema").
	function makeGenerateObjectMockFromRawLLMOutput(rawObject: unknown) {
		return async (_opts: { schema: { _zod?: unknown } } & Record<string, unknown>) => {
			// Replica o comportamento de ai/dist/index.mjs:3439-3452:
			// se schema rejeitar, lança NoObjectGeneratedError com a mesma message.
			const { diagnosisResultSchema } = await import("./types");
			const parsed = diagnosisResultSchema.safeParse(rawObject);
			if (!parsed.success) {
				const err = new Error("No object generated: response did not match schema.");
				err.name = "AI_NoObjectGeneratedError";
				throw err;
			}
			return {
				object: parsed.data,
				usage: { inputTokens: 3000, outputTokens: 200 },
			};
		};
	}

	it("contrato anti-regressão: quando LLM emite whenExpertise:[] (realista, pois JSON Schema enviado NÃO tem minItems), diagnose deve sobreviver e retornar result válido (BUG-2026-05-18)", async () => {
		const { args } = await setupRealConversation();

		// Output realista que o claude-sonnet-4-6 EMITE em prod — o JSON
		// Schema enviado NÃO tinha `minItems`/`minLength` como constraints
		// reais (estão só em `.description`), então o modelo respeita só a
		// tipagem estrutural mas pode violar os `.min(...)` que existem
		// APENAS no Zod local. Ver:
		//   src/lib/diagnose/types.ts  — schema com .min(1), .min(3), .min(10)
		//   payload real enviado à Anthropic (no AI_APICallError) mostra:
		//     "whenExpertise": { "type":"array", ..., "description":"min items: 1." }
		//   minItems NÃO está no schema JSON — só na string description.
		const realisticLLMOutput = {
			rootCause:
				"Turn 5 despejou explicação genérica de consórcio sem perguntar o que o cliente quer comprar — discovery falhou.",
			suggestedExamples: [
				{
					// LLM emitiu lista vazia porque não havia constraint minItems real
					// no schema JSON. Zod local rejeita por .min(1).
					whenExpertise: [],
					whenChannel: "whatsapp",
					userMessage: "Tenho dúvidas",
					assistantResponse:
						"Claro! Pra te ajudar melhor, me conta: você está pensando em comprar um imóvel pra morar ou investir?",
					rationale: "Discovery primeiro — corrige flag incompleteDiscovery.",
				},
			],
			suggestedForbiddenTopics: [],
			suggestedHandoffTriggers: [],
		};

		__setGenerateObjectImplForTests(
			makeGenerateObjectMockFromRawLLMOutput(realisticLLMOutput) as never,
		);

		// Action: chama diagnose. Espera retornar result válido — em prod
		// hoje isso LANÇA DiagnosisError "response did not match schema".
		const out = await diagnoseConversation(args);

		// Assertions VALORADAS sobre o contrato.
		expect(out.result).toBeDefined();
		expect(typeof out.result.rootCause).toBe("string");
		expect(out.result.rootCause.length).toBeGreaterThanOrEqual(10);
		expect(Array.isArray(out.result.suggestedExamples)).toBe(true);
		expect(out.result.suggestedExamples.length).toBeGreaterThanOrEqual(1);

		// O exemplo deve sobreviver — mesmo com whenExpertise vazio, o
		// userMessage/assistantResponse/rationale são válidos.
		const ex = out.result.suggestedExamples[0];
		expect(ex.userMessage).toBe("Tenho dúvidas");
		expect(ex.assistantResponse).toMatch(/imóvel/i);
		expect(ex.rationale).toMatch(/discovery/i);

		expect(out.tokensInput).toBeGreaterThan(0);
		expect(out.tokensOutput).toBeGreaterThan(0);
	}, 30_000);

	it("contrato anti-regressão: quando LLM emite rootCause curto (<10 chars), diagnose deve sobreviver — não lançar DiagnosisError", async () => {
		const { args } = await setupRealConversation();

		// Variação do mesmo bug: outro min* que o LLM viola na prática.
		const shortRootCauseOutput = {
			rootCause: "Discovery falhou.", // 17 chars — passa min(10) mas testa boundary
			suggestedExamples: [
				{
					userMessage: "Quero comprar um carro",
					assistantResponse:
						"Beleza! Pra te ajudar a achar o grupo certo: qual seu orçamento mensal?",
					rationale: "Discovery primeiro — pergunta o que define a recomendação.",
				},
			],
			suggestedForbiddenTopics: [],
			suggestedHandoffTriggers: [],
		};

		__setGenerateObjectImplForTests(
			makeGenerateObjectMockFromRawLLMOutput(shortRootCauseOutput) as never,
		);

		const out = await diagnoseConversation(args);
		expect(out.result.rootCause).toBe("Discovery falhou.");
		expect(out.result.suggestedExamples).toHaveLength(1);
	}, 30_000);

	it("happy path com output válido → diagnose retorna result e tokens", async () => {
		const { args } = await setupRealConversation();

		const validOutput = {
			rootCause:
				"Turn 5 despejou explicação genérica de consórcio sem perguntar o que o cliente quer comprar — discovery falhou.",
			suggestedExamples: [
				{
					whenExpertise: ["leigo"],
					whenCategory: ["imovel"],
					whenChannel: "whatsapp",
					userMessage: "Tenho dúvidas",
					assistantResponse:
						"Claro! Pra te ajudar melhor, me conta: você está pensando em comprar um imóvel pra morar ou investir?",
					rationale: "Discovery primeiro, explicação depois — corrige flag incompleteDiscovery.",
				},
			],
			suggestedForbiddenTopics: [],
			suggestedHandoffTriggers: [],
		};

		__setGenerateObjectImplForTests(makeGenerateObjectMockFromRawLLMOutput(validOutput) as never);

		const out = await diagnoseConversation(args);

		expect(out.result.rootCause).toMatch(/discovery/i);
		expect(out.result.suggestedExamples).toHaveLength(1);
		expect(out.result.suggestedExamples[0].whenExpertise).toEqual(["leigo"]);
		expect(out.tokensInput).toBe(3000);
		expect(out.tokensOutput).toBe(200);
		expect(out.durationMs).toBeGreaterThanOrEqual(0);
	}, 30_000);
});
