// Integration (DB real) — FIX-206 (Kairo, WhatsApp 2026-07-02): o clique "🤔
// Tenho dúvidas" dispara a explicação de consórcio como turno de SERVIDOR
// (isUserTurn=false). ANTES do fix, doubtsAddressed só era marcado em turno de
// usuário → nextGate ficava preso em doubts-wait → o turno fechava MUDO (só
// finish) e o usuário tinha de digitar "continua/vai". O fix marca doubtsAddressed
// no turno server-authored (shouldMarkDoubtsAddressed) → o funil oferece o gate
// `consent` NO MESMO turno. Skip sem DB.

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Agent stub: reproduz a explicação de dúvidas (texto SEM pergunta, sem tools) —
// exatamente o que buildExperienceDoubtsDirective manda produzir.
vi.mock("@/lib/agent/agents", () => {
	function makeAgent() {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					yield {
						type: "text-delta",
						id: "s0",
						text:
							"Consórcio é um grupo de pessoas que juntas formam uma poupança coletiva, " +
							"sem juros. Todo mês alguém é contemplado, por sorteio ou por lance, e recebe " +
							"a carta de crédito pra comprar o bem. Nosso papel na Aja Agora é encontrar o " +
							"grupo com maior chance de te atender no prazo que você deseja.",
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

// A tabela `personas` vem do dump do dev (AWS); no DB transitório de teste está
// vazia. Mockamos o repo (examples vazios) — o foco é a decisão do funil, não o
// prompt/examples da persona.
vi.mock("@/lib/agent/personas-repo", () => ({
	getPersona: vi.fn().mockResolvedValue({
		id: "helena-imovel",
		role: "specialist",
		category: "imovel",
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
const { metaOf } = await import("@/lib/conversation/meta");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

// Estado logo após o clique "🤔 Tenho dúvidas" (o do print): experiência
// escolhida, dúvidas ainda não endereçadas. FIX-233 (D2): `experience` desceu
// pra PÓS-reveal — o clique só é alcançável depois de consent/identify/
// credit/search/reveal já resolvidos (o funil chega em "experience" só
// depois disso).
const DOUBTS_CLICK_META: ConversationMetadata = {
	desireAsked: true,
	currentPersona: "helena-imovel",
	currentCategory: "imovel",
	qualifyConsented: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	// FIX-297/FIX-308: reco-consent precisa estar RESPONDIDO pra nextGate
	// cruzar até o timeframe (senão fica preso em "reco-consent").
	recoConsentDispatched: true,
	recoConsentAnswered: true,
	qualifyAnswers: { creditMax: 300_000 },
	experiencePrev: "doubts",
	doubtsAddressed: false,
};

async function drainDoubtsDirective(conversationId: string): Promise<{
	gates: string[];
	finishReasons: string[];
	text: string;
}> {
	const gates: string[] = [];
	const finishReasons: string[] = [];
	let text = "";
	// Turno de DIRETIVA server-authored (o que o clique "Tenho dúvidas" dispara).
	const gen = runTurn({
		channel: "whatsapp",
		conversationId,
		userText: "[diretiva de dúvidas]",
		isUserTurn: false,
		contactName: "Kairo",
		skipAnalyzer: true,
		skipLeadCollection: true,
	});
	for await (const ev of gen) {
		if (ev.type === "gate") gates.push(ev.gate);
		if (ev.type === "finish") finishReasons.push(ev.reason);
		if (ev.type === "text-delta") text += ev.text;
	}
	return { gates, finishReasons, text };
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

describeIfDb("FIX-206 — clique 'Tenho dúvidas' NÃO trava: oferece o consent no mesmo turno", () => {
	let convId: string;
	beforeEach(() => vi.clearAllMocks());
	afterEach(async () => {
		if (convId) await cleanup(convId);
	});

	it("o turno server-authored da explicação EMITE o gate consent (não fecha mudo)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "whatsapp", metadata: DOUBTS_CLICK_META })
			.returning();
		convId = c.id;

		const { gates, text } = await drainDoubtsDirective(convId);

		// A explicação saiu...
		expect(text.toLowerCase()).toContain("consórcio");
		// ...E o próximo passo (timeframe, FIX-233: pós-experience) foi oferecido no MESMO turno.
		expect(gates).toContain("timeframe");
	});

	it("marca doubtsAddressed no meta (o endereçamento server-authored foi registrado)", async () => {
		const [c] = await db
			.insert(conversations)
			.values({ contactName: "Kairo", channel: "whatsapp", metadata: DOUBTS_CLICK_META })
			.returning();
		convId = c.id;

		await drainDoubtsDirective(convId);

		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, convId),
		});
		expect(metaOf(conv).doubtsAddressed).toBe(true);
	});
});
