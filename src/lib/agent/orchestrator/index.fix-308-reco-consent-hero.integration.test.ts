// FIX-308 (rodada 10, onda 4 — causa-raiz real da Madalena) — o hero
// (recommendation_card) aparecia no dossiê real 6 turnos atrasado: o gate
// `reco-consent` era perguntado no turno 10, o usuário respondia "Pode
// mostrar" no turno 12 (aceite conceitual, mas não reconhecido pelo
// YES_TEXT_MARKERS), e só no turno 18 ("quero") o hero finalmente liberava —
// enquanto isso, `nextGate()` já tinha avançado a cascata (dispatched, não
// answered) e o fecho (contract_form/whatsapp_optin) chegou a disparar ANTES
// do hero. Root cause dupla: (a) nextGate() acoplado a `recoConsentDispatched`
// em vez de `recoConsentAnswered`; (b) YES_TEXT_MARKERS não reconhecia "pode
// mostrar". Ver docs/correcoes/done/fix-308-hero-acoplado-consentimento-real.md.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

let mockIntent = "neutral";

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return {
		...actual,
		analyzeTurn: vi.fn().mockImplementation(async () => ({
			reasoning: "test",
			detectedCategory: null,
			detectedSubTopic: null,
			isExplicitSwitch: false,
			expertiseLevel: "neutro",
			experiencePrev: null,
			creditMin: null,
			creditMax: null,
			prazoMeses: null,
			hasLance: null,
			userIntent: mockIntent,
			extraSignals: [],
		})),
	};
});

vi.mock("@/lib/agent/agents", () => {
	function makeAgent(text: string) {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield { type: "text-delta", id: "s0", text };
				})(),
				finishReason: Promise.resolve("stop" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}
	return {
		resolveAgent: vi.fn().mockResolvedValue(makeAgent("Show! Segue com você.")),
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
const { nextGate } = await import("@/lib/agent/qualify-state");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

const PENDING_RECOMMENDATION_CARD = {
	administradora: "CANOPUS",
	category: "auto",
	creditValue: 90_000,
	termMonths: 72,
	monthlyPayment: 812,
	groupId: "grupo-real-abc",
};

// Estado logo após o turno 10 do dossiê real: reco-consent JÁ foi perguntado
// (recoConsentDispatched=true), o hero já foi computado e está pendente, mas
// ainda NÃO houve resposta reconhecida (recoConsentAnswered ausente).
function recoConsentPendingMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		qualifyConsented: true,
		currentPersona: "auto",
		currentCategory: "auto",
		experiencePrev: "returning",
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		recoConsentDispatched: true,
		simulatorOfferDispatched: false,
		decisionDispatched: false,
		pendingRecommendationCard: PENDING_RECOMMENDATION_CARD,
		qualifyAnswers: {
			creditMin: 76_500,
			creditMax: 90_000,
			hasLance: "no",
		},
		...over,
	};
}

async function drain(conversationId: string, userText: string) {
	const events: Array<{ type: string; artifactType?: string; gate?: string }> = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Madalena",
		skipLeadCollection: true,
	});
	for await (const ev of gen) {
		events.push(
			ev.type === "artifact"
				? { type: ev.type, artifactType: ev.artifactType }
				: ev.type === "gate"
					? { type: ev.type, gate: ev.gate }
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

describeIfDb("FIX-308 — hero acoplado ao consentimento REAL de reco-consent", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it('reprodução do cassette: "Pode mostrar" libera o hero NO TURNO SEGUINTE (não 6 turnos depois)', async () => {
		mockIntent = "neutral";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Madalena", channel: "web", metadata: recoConsentPendingMeta() })
			.returning();
		convId = c.id;

		const events = await drain(convId, "Pode mostrar");

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "recommendation_card")).toBe(
			true,
		);

		const [row] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, convId));
		const meta = row.metadata as ConversationMetadata;
		expect(meta.recoConsentAnswered).toBe(true);
	});

	it('intent="ready_to_proceed" também libera o hero mesmo sem bater no regex de YES_TEXT_MARKERS', async () => {
		mockIntent = "ready_to_proceed";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Madalena", channel: "web", metadata: recoConsentPendingMeta() })
			.returning();
		convId = c.id;

		// Texto sem nenhum marcador do regex — só o intent do analyzer sinaliza avanço.
		const events = await drain(convId, "partiu, seguimos");

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "recommendation_card")).toBe(
			true,
		);

		const [row] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, convId));
		const meta = row.metadata as ConversationMetadata;
		expect(meta.recoConsentAnswered).toBe(true);
	});

	it("cascata NÃO avança pra timeframe/lance/decisão enquanto reco-consent não foi respondido com clareza", () => {
		const pending = recoConsentPendingMeta();
		expect(nextGate(pending, { hasContactName: true })).toBe("reco-consent");

		const answered = recoConsentPendingMeta({ recoConsentAnswered: true });
		expect(nextGate(answered, { hasContactName: true })).not.toBe("reco-consent");
	});

	it("contract_form/whatsapp_optin nunca disparam antes do hero ter sido liberado", async () => {
		mockIntent = "expressing_doubt";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Madalena", channel: "web", metadata: recoConsentPendingMeta() })
			.returning();
		convId = c.id;

		// Usuário hesita/pede mais detalhes em vez de consentir — reproduz o
		// intervalo real (turnos 10-17) em que o dossiê ficou sem resposta clara.
		const events = await drain(convId, "como assim, me explica melhor essa recomendação?");

		expect(events.some((e) => e.type === "artifact" && e.artifactType === "contract_form")).toBe(
			false,
		);
		expect(events.some((e) => e.type === "artifact" && e.artifactType === "whatsapp_optin")).toBe(
			false,
		);
		expect(events.some((e) => e.type === "gate" && (e.gate === "decision" || e.gate === "timeframe"))).toBe(
			false,
		);

		const [row] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, convId));
		const meta = row.metadata as ConversationMetadata;
		expect(meta.decisionDispatched ?? false).toBe(false);
		expect(meta.recoConsentAnswered ?? false).toBe(false);
	});

	it('regressão: usuário responde "não" — segue funcionando, sem travar nem quebrar (não regride negativas/hesitação)', async () => {
		mockIntent = "neutral";
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Madalena", channel: "web", metadata: recoConsentPendingMeta() })
			.returning();
		convId = c.id;

		const events = await drain(convId, "não, obrigada");

		// Não interpreta "não" como consentimento — hero continua pendente.
		expect(events.some((e) => e.type === "artifact" && e.artifactType === "recommendation_card")).toBe(
			false,
		);

		const [row] = await db
			.select({ metadata: conversations.metadata })
			.from(conversations)
			.where(eq(conversations.id, convId));
		const meta = row.metadata as ConversationMetadata;
		expect(meta.recoConsentAnswered ?? false).toBe(false);

		// A conversa continua — a resposta do usuário foi persistida (turno não
		// travou nem lançou exceção).
		const rows = await db
			.select({ content: messagesTable.content, role: messagesTable.role })
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, convId));
		expect(rows.some((m) => m.role === "user" && m.content === "não, obrigada")).toBe(true);
	});
});
