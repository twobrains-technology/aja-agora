// FIX-309 (rodada 10 onda 4, investigação de causa-raiz — dossiês Madalena/
// Mario, 0 emissões de topic_picker apesar do fluxo passar pelo ponto certo):
// `present_topic_picker` era 100% LLM-discricionário (ai-sdk.ts:766) — mesma
// classe de bug do FIX-246/253/280 (invariante crítico no prompt, não em
// código). Migra pra emissão SERVER-SIDE determinística (server-cards.ts +
// orchestrator/index.ts), no ponto pós-`experience` quando o usuário é NOVATO
// (`experiencePrev === "first"`) — confirmado pelo roteiro canônico
// (docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html, cenário
// Madalena, turno "É a primeira vez" -> topic_picker). NÃO é o mesmo gatilho
// de `experiencePrev === "doubts"` ("Tenho dúvidas"), que já tem mecanismo
// dedicado (`doubts-wait`/`pendingFollowUp` — resposta livre, sem menu).
// Integração (DB real): agente MOCADO nunca chama nenhuma tool — espelha
// exatamente o directive real (buildExperienceFirstDirective diz "NÃO chame
// tools").

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					// Espelha buildExperienceFirstDirective: explicação em texto puro,
					// SEM tool-call nenhuma — o directive real proíbe "NÃO chame tools".
					yield {
						type: "text-delta",
						id: "s0",
						text: "Consórcio é um grupo de pessoas que paga parcelas mensais sem juros, e todo mês alguém é contemplado por sorteio ou lance pra receber a carta de crédito. Nosso papel na Aja Agora é encontrar o grupo com maior chance de atender seu objetivo no prazo que você deseja.",
					};
				})(),
				finishReason: Promise.resolve("stop" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}
	return {
		resolveAgent: vi.fn().mockResolvedValue(makeAgent()),
		invalidateAgentCache: vi.fn(),
	};
});

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agent/personas-repo", () => ({
	getPersona: vi.fn().mockResolvedValue({
		id: "auto",
		role: "specialist",
		category: "auto",
		isActive: true,
		examples: [],
	}),
}));

const { db } = await import("@/db");
const {
	conversations,
	messages: messagesTable,
	artifacts: artifactsTable,
} = await import("@/db/schema");
const { runTurn } = await import("@/lib/agent/orchestrator");
const { buildExperienceFirstDirective } = await import("@/lib/agent/orchestrator/directives");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

// Ponto do funil imediatamente pós-reveal, onde o usuário acabou de clicar
// "É a primeira vez" no gate `experience` — mesmo estado que route.ts persiste
// (action.gate === "experience") ANTES de disparar o directive.
function posExperienceFirstMeta(): ConversationMetadata {
	return {
		currentPersona: "auto",
		currentCategory: "auto",
		desireAsked: true,
		identityCollected: true,
		qualifyAnswers: { creditMin: 76_500, creditMax: 90_000 },
		revealCompleted: true,
		searchDispatched: true,
		experiencePrev: "first",
	};
}

async function drainDirective(conversationId: string, directive: string) {
	const events: Array<{ type: string; artifactType?: string; payload?: unknown }> = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText: directive,
		isUserTurn: false,
		contactName: "Kairo",
		skipAnalyzer: true,
		skipLeadCollection: true,
	});
	for await (const ev of gen) {
		events.push(
			ev.type === "artifact"
				? { type: ev.type, artifactType: ev.artifactType, payload: ev.payload }
				: { type: ev.type },
		);
	}
	return events;
}

async function cleanup(convId: string): Promise<void> {
	const msgs = await db
		.select({ id: messagesTable.id })
		.from(messagesTable)
		.where(eq(messagesTable.conversationId, convId));
	const ids = msgs.map((m) => m.id);
	if (ids.length > 0) {
		await db.delete(artifactsTable).where(inArray(artifactsTable.messageId, ids));
	}
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

describeIfDb("FIX-309 — topic_picker server-side (pós-experience, novato)", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("emite topic_picker SEMPRE após a explicação pro novato, mesmo sem o LLM chamar present_topic_picker", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: posExperienceFirstMeta() })
			.returning();
		convId = c.id;

		const events = await drainDirective(convId, buildExperienceFirstDirective("É a primeira vez"));

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).toContain("topic_picker");

		const topicPickerArtifact = events.find((e) => e.artifactType === "topic_picker");
		expect(topicPickerArtifact?.payload).toMatchObject({
			topics: expect.arrayContaining(["o que é lance?", "como funciona o sorteio?"]),
		});

		const [convRow] = await db.select().from(conversations).where(eq(conversations.id, convId));
		const persistedMeta = convRow.metadata as ConversationMetadata;
		expect(persistedMeta.topicPickerDispatched).toBe(true);

		const rows = await db
			.select({ id: messagesTable.id })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		const persisted = await db
			.select()
			.from(artifactsTable)
			.where(
				inArray(
					artifactsTable.messageId,
					rows.map((r) => r.id),
				),
			);
		expect(persisted.some((a) => a.type === "topic_picker")).toBe(true);
	});

	it("idempotente: não re-emite topic_picker num 2º turno depois que já disparou", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: {
					...posExperienceFirstMeta(),
					topicPickerDispatched: true,
				},
			})
			.returning();
		convId = c.id;

		const events = await drainDirective(convId, "o que é lance?");

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).not.toContain("topic_picker");
	});

	it("não regride a fase: experiencePrev='doubts' (tem dúvida específica, mecanismo dedicado doubts-wait) NÃO emite topic_picker", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: {
					...posExperienceFirstMeta(),
					experiencePrev: "doubts",
					doubtsAddressed: false,
				},
			})
			.returning();
		convId = c.id;

		const events = await drainDirective(convId, "Tenho uma dúvida específica sobre lance.");

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).not.toContain("topic_picker");
	});

	it("não regride a fase: experiencePrev='returning' NÃO emite topic_picker", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: {
					...posExperienceFirstMeta(),
					experiencePrev: "returning",
				},
			})
			.returning();
		convId = c.id;

		const events = await drainDirective(convId, "Show, vamos direto ao ponto.");

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).not.toContain("topic_picker");
	});

	it("não regride a fase: reco-consent já disparado (funil avançou) NÃO reabre topic_picker", async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				channel: "web",
				metadata: {
					...posExperienceFirstMeta(),
					recoConsentDispatched: true,
				},
			})
			.returning();
		convId = c.id;

		const events = await drainDirective(convId, "Pode mostrar a recomendação");

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).not.toContain("topic_picker");
	});
});
