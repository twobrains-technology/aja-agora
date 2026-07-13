// FIX-253(b) + FIX-254 (rodada 4, veredito Fable FINAL §2/§N-C) — mesma raiz:
// o caminho de TEXTO LIVRE do gate lance ("não tenho o valor... mas junto 4
// mil/mês") despachava a pergunta de lance-embutido SEM o card embedded_bid
// (só o clique emitia, route.ts). Consertar isso exigiu entender que o
// disparo AUTOMÁTICO de `nextGateToFire` (index.ts) já reemite o MESMO gate
// que o clique (route.ts) emite explicitamente — dai o double-dispatch do
// N-C. `suppressGateEvent` resolve os dois: o caminho de TEXTO usa o disparo
// automático (agora COM o card); o caminho de CLIQUE suprime o automático e
// mantém só a emissão explícita (sem duplicar).

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						id: "s0",
						text: "Existe o lance embutido: você usa parte da própria carta como lance.",
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
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

// Estado logo após o usuário responder "não" ao gate `lance` — nextGate()
// (qualify-state.ts) resolve pra "lance-embutido" (educação + opt-in).
const LANCE_EMBUTIDO_PENDING_META: ConversationMetadata = {
	desireAsked: true,
	qualifyConsented: true,
	currentPersona: "auto",
	currentCategory: "auto",
	experiencePrev: "returning",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	// FIX-297: reco-consent precisa estar resolvido pra nextGate cruzar
	// timeframe/lance até chegar em "lance-embutido".
	recoConsentDispatched: true,
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
		// lanceEmbutido AUSENTE de propósito — é a condição que faz nextGate()
		// devolver "lance-embutido".
	},
};

async function drain(
	conversationId: string,
	userText: string,
	opts: { isUserTurn: boolean; suppressGateEvent?: boolean },
) {
	const events: Array<{ type: string; artifactType?: string; gate?: string }> = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: opts.isUserTurn,
		contactName: "Kairo",
		skipAnalyzer: true,
		skipLeadCollection: true,
		suppressGateEvent: opts.suppressGateEvent,
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

describeIfDb("FIX-253(b)/FIX-254 — embedded_bid no caminho de TEXTO + anti double-dispatch", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("caminho de TEXTO (isUserTurn=true): emite embedded_bid server-side ANTES do gate lance-embutido, UMA vez", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: LANCE_EMBUTIDO_PENDING_META })
			.returning();
		convId = c.id;

		const events = await drain(convId, "não tenho o valor do lance hoje, mas consigo juntar 4 mil por mês", {
			isUserTurn: true,
		});

		const artifactTypes = events.filter((e) => e.type === "artifact").map((e) => e.artifactType);
		expect(artifactTypes).toEqual(["embedded_bid"]);
		const gateEvents = events.filter((e) => e.type === "gate" && e.gate === "lance-embutido");
		expect(gateEvents).toHaveLength(1);

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
		expect(persisted.filter((a) => a.type === "embedded_bid")).toHaveLength(1);
	});

	it("caminho de CLIQUE (isUserTurn=false, suppressGateEvent=true): NÃO emite gate nem card automático — o handler (route.ts) é o ÚNICO emissor", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: LANCE_EMBUTIDO_PENDING_META })
			.returning();
		convId = c.id;

		const events = await drain(convId, "Antes de perguntar se o usuário quer considerar lance embutido...", {
			isUserTurn: false,
			suppressGateEvent: true,
		});

		expect(events.filter((e) => e.type === "artifact")).toHaveLength(0);
		expect(events.filter((e) => e.type === "gate")).toHaveLength(0);
	});
});
