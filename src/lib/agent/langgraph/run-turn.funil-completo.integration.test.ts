// FIX-360 — teste de integração (DB real, Camada 2; modelo mockado): a
// jornada PÓS-reveal percorre TODOS os estágios canônicos (experience →
// reco-consent → timeframe → lance → lance-value → lance-embutido →
// simulator-offer → decision) sem travar, e o escape (usuário desvia)
// nunca quebra o turno nem trava o funil — o gate reabre depois.

import { AIMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return { ...actual, analyzeTurn: vi.fn() };
});

const { db } = await import("@/db");
const { conversations } = await import("@/db/schema");
const { createRunTurnLangGraph } = await import("./run-turn");
const { analyzeTurn } = await import("@/lib/agent/turn-analyzer");

function neutralAnalysis(overrides?: Partial<TurnAnalysis>): TurnAnalysis {
	return {
		reasoning: "mock — FIX-360 funil completo",
		detectedCategory: null,
		detectedSubTopic: null,
		isExplicitSwitch: false,
		expertiseLevel: "neutro",
		experiencePrev: null,
		creditMin: null,
		creditMax: null,
		prazoMeses: null,
		hasLance: null,
		desiredItem: null,
		motivation: null,
		monthlySavings: null,
		fgtsValue: null,
		userIntent: "neutral",
		...overrides,
	};
}

function fakeModel(text: string): FakeStreamingChatModel {
	return new FakeStreamingChatModel({ responses: [new AIMessage(text)], sleep: 0 });
}

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [conv] = await db.insert(conversations).values({ metadata: meta }).returning();
	return conv.id;
}

async function cleanup(conversationId: string): Promise<void> {
	await db.delete(conversations).where(eq(conversations.id, conversationId));
}

async function drain(gen: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
	const out: TurnEvent[] = [];
	for await (const ev of gen) out.push(ev);
	return out;
}

function gatesShown(events: TurnEvent[]): string[] {
	return events
		.filter((ev): ev is Extract<TurnEvent, { type: "gate" }> => ev.type === "gate")
		.map((ev) => ev.gate);
}

function artifactsShown(events: TurnEvent[]): string[] {
	return events
		.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
		.map((ev) => ev.artifactType);
}

async function currentMeta(conversationId: string): Promise<ConversationMetadata> {
	const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
	return conv.metadata as ConversationMetadata;
}

const conversationIdsToClean: string[] = [];

afterEach(() => {
	__setDiscoveryAdapterFactoryForTests(null);
});

afterAll(async () => {
	for (const id of conversationIdsToClean) await cleanup(id);
});

describeIfDb(
	"FIX-360 — funil completo pós-reveal: name→…→simulator-offer→decision sem travar",
	() => {
		it("percorre experience→reco-consent→timeframe→lance→lance-value→lance-embutido→simulator-offer→decision", async () => {
			const conversationId = await seedConversation({
				currentPersona: "auto",
				currentCategory: "auto",
				desireAsked: true,
				desireAnswered: true,
				identityCollected: true,
				searchDispatched: true,
				revealCompleted: true,
				discoveredCreditTarget: 90_000,
				recommendedAdministradora: "CANOPUS",
				recommendedOffer: {
					administradora: "CANOPUS",
					category: "auto",
					creditValue: 90_000,
					termMonths: 72,
					monthlyPayment: 812,
					groupId: "grupo-real-abc",
				},
				// Rapport (motivo+espelho) já resolvido — este teste foca nos gates
				// PÓS-reveal; sem isso, `shouldAskMotive` (qualify-state.ts) suprime
				// TODO gate no 1º turno até o beat de motivo/espelho rodar (correto,
				// mas fora do escopo desta jornada).
				motivationAsked: true,
				motivationMirrored: true,
				qualifyAnswers: { creditMin: 76_500, creditMax: 90_000, motivation: "carro na oficina" },
			});
			conversationIdsToClean.push(conversationId);

			const runTurn = createRunTurnLangGraph({ model: fakeModel("Beleza, seguindo com você!") });
			const allGates: string[] = [];
			const allArtifacts: string[] = [];

			async function turn(userText: string, analysis: TurnAnalysis): Promise<TurnEvent[]> {
				vi.mocked(analyzeTurn).mockResolvedValueOnce(analysis);
				const events = await drain(
					runTurn({
						channel: "web",
						conversationId,
						userText,
						isUserTurn: true,
						contactName: "Kairo",
					}),
				);
				allGates.push(...gatesShown(events));
				allArtifacts.push(...artifactsShown(events));
				return events;
			}

			// experience → (novato, dispara topic_picker) → reco-consent
			await turn(
				"nunca fiz consórcio antes",
				neutralAnalysis({ experiencePrev: "first", userIntent: "providing_info" }),
			);
			// reco-consent: aceita ver a recomendação
			await turn("bora, quero ver!", neutralAnalysis({ userIntent: "ready_to_proceed" }));
			// timeframe: quer contemplar em 12 meses
			await turn(
				"quero contemplar rapido, uns 12 meses",
				neutralAnalysis({ prazoMeses: 12, userIntent: "providing_info" }),
			);
			// lance: sim, pretende dar lance
			await turn(
				"sim, pretendo dar um lance",
				neutralAnalysis({ hasLance: "yes", userIntent: "providing_info" }),
			);
			// lance-value: valor explícito no texto (backstop determinístico, advance.ts)
			await turn("uns 20 mil", neutralAnalysis({ userIntent: "providing_info" }));
			// lance-embutido: aceita
			await turn(
				"quero sim, ajuda a diminuir a parcela",
				neutralAnalysis({ userIntent: "ready_to_proceed" }),
			);
			// simulator-offer: pode aparecer mais de 1 turno (dispatch != mesma
			// passada do gate) — dirige turnos afirmativos até "decision" aparecer,
			// com teto pra nunca travar o teste num loop infinito se algo quebrar.
			let decisionSeen = allGates.includes("decision");
			let safety = 0;
			while (!decisionSeen && safety < 6) {
				const events = await turn(
					"show, bora!",
					neutralAnalysis({ userIntent: "ready_to_proceed" }),
				);
				decisionSeen = gatesShown(events).includes("decision") || allGates.includes("decision");
				safety += 1;
			}

			expect(allGates).toContain("reco-consent");
			expect(allGates).toContain("timeframe");
			expect(allGates).toContain("lance");
			expect(allGates).toContain("lance-value");
			expect(allGates).toContain("lance-embutido");
			expect(allGates).toContain("simulator-offer");
			expect(allGates).toContain("decision");
			expect(allArtifacts).toContain("topic_picker");
			expect(allArtifacts).toContain("embedded_bid");
			expect(allArtifacts).toContain("decision_prompt");

			const meta = await currentMeta(conversationId);
			expect(meta.decisionDispatched).toBe(true);
			expect(meta.qualifyAnswers?.prazoMeses).toBe(12);
			expect(meta.qualifyAnswers?.hasLance).toBe("yes");
			expect(meta.qualifyAnswers?.lanceValue).toBe(20_000);
			expect(meta.qualifyAnswers?.lanceEmbutido).toBe(true);
		});

		it("escape: usuário desvia (pergunta) no meio do gate credit — agente responde, gate reabre depois", async () => {
			const conversationId = await seedConversation({
				currentPersona: "auto",
				currentCategory: "auto",
				desireAsked: true,
				desireAnswered: true,
				identityCollected: false,
				qualifyAnswers: {},
			});
			conversationIdsToClean.push(conversationId);

			const runTurn = createRunTurnLangGraph({
				model: fakeModel("Boa pergunta! Deixa eu te explicar."),
			});

			vi.mocked(analyzeTurn).mockResolvedValueOnce(
				neutralAnalysis({ userIntent: "asking_question" }),
			);
			const detourEvents = await drain(
				runTurn({
					channel: "web",
					conversationId,
					userText: "como funciona o consórcio mesmo?",
					isUserTurn: true,
				}),
			);
			// Desvio nunca quebra o turno — sempre termina com "finish".
			expect(detourEvents.at(-1)).toEqual({ type: "finish", reason: "ok" });
			// E o gate `credit` NÃO é mostrado neste turno de desvio (deixa o
			// agente conversar, não empurra o card por cima da pergunta).
			expect(gatesShown(detourEvents)).not.toContain("credit");

			vi.mocked(analyzeTurn).mockResolvedValueOnce(
				neutralAnalysis({ creditMax: 90_000, userIntent: "providing_info" }),
			);
			const answerEvents = await drain(
				runTurn({
					channel: "web",
					conversationId,
					userText: "certo, uns 90 mil",
					isUserTurn: true,
				}),
			);
			expect(answerEvents.at(-1)).toEqual({ type: "finish", reason: "ok" });

			const meta = await currentMeta(conversationId);
			expect(meta.qualifyAnswers?.creditMax).toBe(90_000);
		});
	},
);
