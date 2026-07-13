// Integration (DB real) — FIX-305 (rodada 10, onda 3): o gate `timeframe`
// (achado real no bakeoff pós-onda-1 com Qwen: `.bakeoff/qwen-jornada-pos-r10-
// onda1.log`, 4 turnos seguidos `[gate-skip] gate=timeframe intent=neutral —
// staying conversational`, `simulator-offer` NUNCA alcançado) ficava preso
// pra sempre quando o analyzer nunca extrai `prazoMeses` do texto livre.
//
// Prova aqui a FIAÇÃO real (analyze.ts + orchestrator/index.ts), não só a
// lógica pura de qualify-state.ts (já coberta em
// qualify-state.fix-305-timeframe-stuck.test.ts): 3 turnos de usuário
// consecutivos com intent=neutral e prazoMeses=null (mock do analyzer, mesma
// classe de falha do modelo fraco) → no 3º turno, o funil assume o default
// (12 meses), avisa o usuário com um texto determinístico e dispara o
// PRÓXIMO gate (`lance`) no MESMO turno — nunca fica mudo, nunca trava.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return {
		...actual,
		// Mesma classe de falha do modelo fraco no bakeoff: intent neutro, NENHUM
		// dado extraído (tudo null) — o analyzer "não entende" a resposta vaga.
		analyzeTurn: vi.fn().mockResolvedValue({
			reasoning: "resposta vaga, sem dado extraível",
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
		}),
	};
});

vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						id: "s0",
						text: "Show, sem problemas! Me conta quando quiser.",
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
		id: "rafael-auto",
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

// Estado logo após reco-consent resolvido — nextGate() cai em "timeframe"
// (mesmo ponto do trace real do log do bakeoff).
const TIMEFRAME_PENDING_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "rafael-auto",
	currentCategory: "auto",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	experiencePrev: "first",
	// FIX-308: reco-consent precisa estar RESPONDIDO pra nextGate cruzar até o timeframe.
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	qualifyAnswers: { creditMax: 80_000 },
};

async function drain(
	conversationId: string,
	userText: string,
): Promise<Array<{ type: string; text?: string; gate?: string }>> {
	const events: Array<{ type: string; text?: string; gate?: string }> = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Kairo",
		skipLeadCollection: true,
	});
	for await (const ev of gen) {
		events.push(
			ev.type === "text-delta"
				? { type: ev.type, text: ev.text }
				: ev.type === "gate"
					? { type: ev.type, gate: ev.gate }
					: { type: ev.type },
		);
	}
	return events;
}

async function loadMeta(conversationId: string): Promise<ConversationMetadata> {
	const [row] = await db
		.select({ metadata: conversations.metadata })
		.from(conversations)
		.where(eq(conversations.id, conversationId));
	return row.metadata as ConversationMetadata;
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

describeIfDb("FIX-305 — gate `timeframe` preso sob extração fraca: nunca trava, assume default", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("3 turnos neutros seguidos (sem prazo extraído) → 3º turno assume o default, avisa o usuário e dispara o PRÓXIMO gate (lance) no mesmo turno — nunca fecha mudo", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: TIMEFRAME_PENDING_META })
			.returning();
		convId = c.id;

		// Turno 1 — vago, sem prazo. Ainda dentro da tolerância (só conta).
		await drain(convId, "show");
		let meta = await loadMeta(convId);
		expect(meta.qualifyAnswers?.prazoMeses).toBeUndefined();
		expect(meta.gateStuckTurns?.timeframe).toBe(1);

		// Turno 2 — de novo vago. Ainda NÃO assume o default.
		await drain(convId, "beleza");
		meta = await loadMeta(convId);
		expect(meta.qualifyAnswers?.prazoMeses).toBeUndefined();
		expect(meta.gateStuckTurns?.timeframe).toBe(2);

		// Turno 3 — teto atingido: assume 12 meses, avisa o usuário e SEGUE — o
		// próximo gate (lance) dispara no MESMO turno, sem esperar um 4º turno.
		const events = await drain(convId, "tá bom");
		meta = await loadMeta(convId);
		expect(meta.qualifyAnswers?.prazoMeses).toBe(12);
		expect(meta.gateDefaultsAssumed?.timeframe).toBe(true);
		expect(meta.gateStuckTurns?.timeframe).toBe(0);

		const noticeText = events
			.filter((e) => e.type === "text-delta")
			.map((e) => e.text)
			.join("");
		expect(noticeText).toContain("12 meses");

		const gateEvents = events.filter((e) => e.type === "gate").map((e) => e.gate);
		expect(gateEvents).toContain("lance");
		// A prova central do card FIX-305: o funil NÃO fica preso em timeframe.
		expect(gateEvents).not.toContain("timeframe");
	});

	it("caminho feliz: resposta CLARA de prazo na 1ª tentativa usa o valor real — não aciona o escape, não regride", async () => {
		const { analyzeTurn } = await import("@/lib/agent/turn-analyzer");
		vi.mocked(analyzeTurn).mockResolvedValueOnce({
			reasoning: "usuário deu o prazo",
			detectedCategory: null,
			detectedSubTopic: null,
			isExplicitSwitch: false,
			expertiseLevel: "neutro",
			experiencePrev: null,
			creditMin: null,
			creditMax: null,
			prazoMeses: 24,
			hasLance: null,
			desiredItem: null,
			motivation: null,
			monthlySavings: null,
			fgtsValue: null,
			userIntent: "providing_info",
		});

		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "web", metadata: TIMEFRAME_PENDING_META })
			.returning();
		convId = c.id;

		await drain(convId, "uns 2 anos");

		const meta = await loadMeta(convId);
		expect(meta.qualifyAnswers?.prazoMeses).toBe(24);
		expect(meta.gateStuckTurns?.timeframe ?? 0).toBe(0);
		expect(meta.gateDefaultsAssumed?.timeframe).toBeUndefined();
	});
});
