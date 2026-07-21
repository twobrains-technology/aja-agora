// FIX-358 — walking skeleton, teste de integração (DB real, Camada 2;
// MODELO MOCKADO — sem gateway real, per card). Descoberta via fixture Bevi
// real (mesmo seam `__setDiscoveryAdapterFactoryForTests` usado no resto da
// suíte — não é "dado mockado em runtime", é fixture de TESTE).
//
// Cobre o aceite do card:
//  (a) discovery-nó só dispara com identidade+valor prontos (I1) — via
//      `readyForDiscovery` já teste unitário; aqui prova o EFEITO no grafo.
//  (b) discovery dispara quando pronto, emite o artifact de comparação
//      (comparison_table + recommendation_card) e persiste a projeção.
//  (c) um turno com o gate "decision" pronto emite decision_prompt.
//  (d) 0 NoSuchToolError no slice (coberto também em nodes/converse.test.ts,
//      unitário — aqui prova que o caminho end-to-end não deixa vazar erro).
import { eq } from "drizzle-orm";
import { AIMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { fixtureDiscoveryAdapter } from "../../../../tests/helpers/fixture-discovery-adapter";

const HAS_DB =
	Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return {
		...actual,
		// Neutro em tudo — os testes seedam o estado direto no meta da
		// conversa (mesmo padrão de index.fix-246-server-cards.integration.test.ts,
		// POS_REVEAL_META), não dependem de extração do analyzer.
		analyzeTurn: vi.fn().mockResolvedValue({
			reasoning: "mock neutro — walking skeleton FIX-358",
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
			userIntent: "providing_info",
		}),
	};
});

const { db } = await import("@/db");
const {
	conversations,
	messages: messagesTable,
	artifacts: artifactsTable,
} = await import("@/db/schema");
const { createRunTurnLangGraph } = await import("./run-turn");
const { analyzeTurn } = await import("@/lib/agent/turn-analyzer");

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

const conversationIdsToClean: string[] = [];

afterEach(() => {
	__setDiscoveryAdapterFactoryForTests(null);
});

afterAll(async () => {
	for (const id of conversationIdsToClean) await cleanup(id);
});

describeIfDb("FIX-358 — walking skeleton: runTurnLangGraph end-to-end (modelo mockado)", () => {
	it("I1 — SEM identidade/valor prontos, discovery NÃO dispara (0 artifact de comparação)", async () => {
		const conversationId = await seedConversation({
			currentPersona: "auto",
			currentCategory: "auto",
			desireAsked: true,
			identityCollected: false,
			qualifyAnswers: {},
		});
		conversationIdsToClean.push(conversationId);

		const runTurn = createRunTurnLangGraph({
			model: fakeModel("Legal! Me conta mais sobre o que você procura."),
		});
		const events = await drain(
			runTurn({
				channel: "web",
				conversationId,
				userText: "quero um carro",
				isUserTurn: true,
			}),
		);

		const artifactTypes = events
			.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
			.map((ev) => ev.artifactType);
		expect(artifactTypes).not.toContain("comparison_table");
		expect(artifactTypes).not.toContain("recommendation_card");

		const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
		const meta = conv.metadata as ConversationMetadata;
		expect(meta.searchDispatched).not.toBe(true);
	});

	it("identidade+valor prontos → discovery dispara, emite comparison_table na hora; recommendation_card fica PENDENTE (reco-consent, FIX-361)", async () => {
		const adapter = fixtureDiscoveryAdapter();
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const conversationId = await seedConversation({
			currentPersona: "auto",
			currentCategory: "auto",
			desireAsked: true,
			identityCollected: true,
			searchDispatched: false,
			qualifyAnswers: { creditMin: 20_000, creditMax: 60_000 },
		});
		conversationIdsToClean.push(conversationId);

		const runTurn = createRunTurnLangGraph({
			model: fakeModel("Perfeito! Deixa eu buscar as melhores opções pra você."),
		});
		const events = await drain(
			runTurn({
				channel: "web",
				conversationId,
				userText: "sim, pode buscar",
				isUserTurn: true,
			}),
		);

		const artifacts = events.filter(
			(ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact",
		);
		const artifactTypes = artifacts.map((ev) => ev.artifactType);
		expect(artifactTypes).toContain("comparison_table");
		// FIX-361 — "hero-awaits-reco-consent" (artifact-guard.ts): o hero SÓ
		// sai depois que o usuário consentir no gate reco-consent (que ainda
		// nem foi perguntado nesta conversa — recoConsentAnswered undefined).
		expect(artifactTypes).not.toContain("recommendation_card");

		// 0 NoSuchToolError / exceção vazando pro chamador — o drain acima já
		// teria lançado; reforça que o turno terminou com "finish".
		expect(events.at(-1)).toEqual({ type: "finish", reason: "ok" });

		// Persistência — shape que a UI/admin/mesa leem (projectToMeta).
		const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
		const meta = conv.metadata as ConversationMetadata;
		expect(meta.searchDispatched).toBe(true);
		expect(meta.revealCompleted).toBe(true);
		expect(meta.recommendedOffer).toBeDefined();
		expect(meta.recommendedOffer?.creditValue).toBeGreaterThan(0);
		// O payload JÁ coagido (I3) fica pendente — nunca recalculado quando o
		// consentimento chegar.
		expect(meta.pendingRecommendationCard).toBeDefined();

		// messages/artifacts no banco (mesmo shape que emitServerCard grava no
		// runtime Vercel — 1 message marcador + 1 artifact row por card).
		const persistedArtifacts = await db
			.select()
			.from(artifactsTable)
			.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
			.where(eq(messagesTable.conversationId, conversationId));
		const persistedTypes = persistedArtifacts.map((r) => r.artifacts.type);
		expect(persistedTypes).toContain("comparison_table");
		expect(persistedTypes).not.toContain("recommendation_card");
	});

	it("2ª busca no mesmo turno pronto NÃO redispara (idempotência — searchDispatched já true)", async () => {
		const adapter = fixtureDiscoveryAdapter();
		const spy = vi.spyOn(adapter, "searchGroups");
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const conversationId = await seedConversation({
			currentPersona: "auto",
			currentCategory: "auto",
			desireAsked: true,
			identityCollected: true,
			// já buscado — mesma faixa, revealCompleted true (pós-reveal).
			searchDispatched: true,
			revealCompleted: true,
			recommendedAdministradora: "ITAÚ",
			recommendedOffer: {
				administradora: "ITAÚ",
				category: "auto",
				creditValue: 60_000,
				termMonths: 72,
				monthlyPayment: 900,
				groupId: "grupo-existente",
			},
			qualifyAnswers: { creditMin: 20_000, creditMax: 60_000 },
		});
		conversationIdsToClean.push(conversationId);

		const runTurn = createRunTurnLangGraph({
			model: fakeModel("Show, já temos essa opção na tela!"),
		});
		await drain(
			runTurn({
				channel: "web",
				conversationId,
				userText: "top",
				isUserTurn: true,
			}),
		);

		expect(spy).not.toHaveBeenCalled();
	});

	it('gate "decision" pronto (pós-reveal, todos os gates intermediários resolvidos) emite o card decision_prompt', async () => {
		const conversationId = await seedConversation({
			currentPersona: "auto",
			currentCategory: "auto",
			desireAsked: true,
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			experiencePrev: "returning",
			recoConsentDispatched: true,
			recoConsentAnswered: true,
			simulatorOfferDispatched: true,
			decisionDispatched: false,
			recommendedAdministradora: "CANOPUS",
			recommendedOffer: {
				administradora: "CANOPUS",
				category: "auto",
				creditValue: 90_000,
				termMonths: 72,
				monthlyPayment: 812,
				groupId: "grupo-real-abc",
			},
			qualifyAnswers: {
				creditMin: 76_500,
				creditMax: 90_000,
				prazoMeses: 72,
				hasLance: "no",
				lanceEmbutido: false,
			},
		});
		conversationIdsToClean.push(conversationId);

		// "bora fechar" = sinal de avanço explícito — `decideShowGate` só
		// libera o gate "decision" com intent ready_to_proceed/neutral (nunca
		// providing_info, o default do mock do módulo). Um turno só.
		vi.mocked(analyzeTurn).mockResolvedValueOnce({
			reasoning: "usuário sinaliza avanço explícito",
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
			userIntent: "ready_to_proceed",
		});

		const runTurn = createRunTurnLangGraph({
			model: fakeModel("Show, bora fechar então!"),
		});
		const events = await drain(
			runTurn({
				channel: "web",
				conversationId,
				userText: "bora fechar",
				isUserTurn: true,
				// nextGate() só sai do gate "name" com hasContactName=true — o
				// nome já foi capturado bem antes deste ponto do funil (fora do
				// slice desta fundação), então o TESTE precisa informar o
				// contactName já conhecido (mesmo papel que `conv.contactName`
				// faria numa conversa real que já passou pelo gate name).
				contactName: "Kairo",
			}),
		);

		const gateEvents = events.filter(
			(ev): ev is Extract<TurnEvent, { type: "gate" }> => ev.type === "gate",
		);
		expect(gateEvents.some((ev) => ev.gate === "decision")).toBe(true);

		const decisionCard = events.find(
			(ev): ev is Extract<TurnEvent, { type: "artifact" }> =>
				ev.type === "artifact" && ev.artifactType === "decision_prompt",
		);
		expect(decisionCard).toBeDefined();

		const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
		const meta = conv.metadata as ConversationMetadata;
		expect(meta.decisionDispatched).toBe(true);
	});
});
