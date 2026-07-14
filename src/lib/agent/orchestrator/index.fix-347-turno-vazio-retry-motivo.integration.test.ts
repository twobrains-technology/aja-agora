// Integration (DB real) — FIX-347 (loop-de-goal desamarra, rodada 4, P1.1):
// "Acho que me perdi por aqui" regrediu (0/8 na rodada 3 → 2/8 na rodada 4,
// `moto-web` t9 e `servicos-web` t10) em turnos onde o usuário respondeu
// algo CLARO a uma pergunta que o próprio agente tinha acabado de fazer.
//
// Root cause PROVADA em código (não reconstruível byte-a-byte daquele turno
// específico — a coleta daquela rodada só persistiu o transcript final, sem
// log/turn-trace do texto BRUTO do modelo antes do sanitizer; essa ausência
// de instrumentação é, ela mesma, parte do achado). O mecanismo real e
// reproduzível: `EphemeralTextFilter` (sanitizer.ts) pode dropar 100% dos
// segmentos de um turno — qualquer combinação dos guards adicionados nesta
// campanha (preâmbulo de processo, oferta prematura, administradora
// alucinada, etc.) — sem deixar rastro nenhum. Esse turno fica
// indistinguível de "o modelo não disse nada" pro guard de turno-vazio
// (`empty-turn-guard.ts`), que dispara o fallback fixo "Acho que me perdi
// por aqui" mesmo quando o modelo respondeu de verdade.
//
// Este teste reproduz o mecanismo (não o texto exato daquele dossiê): o
// modelo, no PRIMEIRO turno, só narra o próprio processo ("Vou buscar os
// detalhes certos pra você.") — 100% preâmbulo, sem tool-call, sem artifact,
// sem gate pendente (meta na fase terminal pós-decisão, igual ao ponto do
// funil onde `moto-web` t9 aconteceu). Prova: (1) SEM a correção, esse turno
// fecharia mudo; (2) COM a correção (retry com o motivo do corte, `runner.ts`
// expõe `sanitizerDropReasons` via `EphemeralTextFilter.droppedSegmentReasons()`,
// `index.ts` dá uma segunda chance via `buildEmptyTurnRetryDirective`), o
// modelo é chamado de novo e desta vez responde de verdade — o usuário NUNCA
// vê "Acho que me perdi por aqui" quando o modelo tinha algo real a dizer.
// Skip sem DB.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Marcador literal do directive de retry (directives.ts,
// buildEmptyTurnRetryDirective) — usado pelo mock pra distinguir a PRIMEIRA
// tentativa (sem motivo no contexto) da SEGUNDA (com o motivo do corte).
const RETRY_MARKER = "não pôde ser enviada porque";

// Frase que é 100% preâmbulo de processo (PROCESS_ACTION_PATTERNS,
// sanitizer.ts) — o modelo narra o que vai FAZER em vez de responder. Mesma
// família dos guards que a campanha adicionou; reproduz "o sanitizer comeu
// tudo" sem depender de nenhum outro estado de meta.
const FIRST_ATTEMPT_TEXT = "Vou buscar os detalhes certos pra você.";
const RETRY_ATTEMPT_TEXT =
	"Show! A parcela fica em R$ 3.240,25 por mês durante 15 meses. Faz sentido pra você?";

vi.mock("@/lib/agent/agents", () => {
	function makeAgent(isRetry: boolean) {
		return {
			stream: async () => ({
				fullStream: (async function* () {
					if (!isRetry) {
						yield { type: "text-delta", id: "s0", text: FIRST_ATTEMPT_TEXT };
						return;
					}
					yield { type: "text-delta", id: "s0", text: RETRY_ATTEMPT_TEXT };
				})(),
				finishReason: Promise.resolve("stop" as const),
				providerMetadata: Promise.resolve({}),
			}),
		};
	}
	return {
		resolveAgent: vi.fn(
			async (_persona: unknown, _meta: unknown, opts: { extraSystemBlocks?: string[] } = {}) => {
				const isRetry = (opts.extraSystemBlocks ?? []).some((b) => b.includes(RETRY_MARKER));
				return makeAgent(isRetry);
			},
		),
		invalidateAgentCache: vi.fn(),
	};
});

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { db } = await import("@/db");
const {
	conversations,
	messages: messagesTable,
	artifacts: artifactsTable,
} = await import("@/db/schema");
const { resolveAgent } = await import("@/lib/agent/agents");
const { runTurn } = await import("@/lib/agent/orchestrator");
const { EMPTY_TURN_FALLBACK } = await import("@/lib/chat/empty-turn-guard");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;
type TurnEvent = import("./types").TurnEvent;

// Meta na fase TERMINAL pós-decisão (name/desire/credit/identify/search/
// experience/reco-consent/timeframe/lance/lance-value/lance-embutido/
// simulator-offer/decision todos resolvidos) — mesmo ponto do funil onde
// `moto-web` t9 aconteceu: o usuário responde em texto livre a uma pergunta
// que o PRÓPRIO agente fez, sem nenhum gate estrutural pendente. Confirmado
// via sonda direta: `nextGate(meta, {hasContactName:true})` === "search"
// (terminal) e `decideShowGate({gate:"search", ...})` === false — ou seja,
// `nextGateToFire` fica `null` e o retry-com-motivo pode disparar.
const TERMINAL_META: ConversationMetadata = {
	currentPersona: "moto",
	currentCategory: "moto",
	expertiseLevel: "neutro",
	desireAsked: true,
	experiencePrev: "first",
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	recoConsentAnswered: true,
	simulatorOfferDispatched: true,
	decisionDispatched: true,
	// FIX-309: sem isto, o topic_picker (menu de dúvidas pós-experience=first)
	// dispara AUTOMATICAMENTE no 1o turno de usuário — no dossiê real
	// (moto-web t5) esse card já tinha aparecido bem antes do turno 9
	// reproduzido aqui. Não afeta o retry em si (roda ANTES deste card), mas
	// mantém a fixture fiel ao estado real do funil naquele ponto.
	topicPickerDispatched: true,
	qualifyAnswers: {
		creditMin: 30_000,
		creditMax: 35_738,
		prazoMeses: 60,
		hasLance: "yes",
		lanceValue: 3_659.57,
		lanceEmbutido: false,
	},
};

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Mario", metadata: meta })
		.returning();
	return c.id;
}

async function cleanup(convId: string): Promise<void> {
	const msgs = await db
		.select({ id: messagesTable.id })
		.from(messagesTable)
		.where(eq(messagesTable.conversationId, convId));
	const ids = msgs.map((m) => m.id);
	if (ids.length > 0) {
		await db.delete(artifactsTable).where(eq(artifactsTable.messageId, ids[0]));
	}
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

async function drainUserTurn(
	conversationId: string,
	userText: string,
): Promise<{ text: string; events: TurnEvent[] }> {
	let text = "";
	const events: TurnEvent[] = [];
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Mario",
	});
	for await (const ev of gen) {
		events.push(ev);
		if (ev.type === "text-delta") text += ev.text;
	}
	return { text, events };
}

describeIfDb(
	"FIX-347 — turno esvaziado pelo sanitizer ganha retry com o motivo (nunca 'Acho que me perdi')",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it("1a tentativa 100% preâmbulo (sanitizer dropa tudo) → orchestrator chama o modelo de NOVO com o motivo, e a resposta real chega ao usuário", async () => {
			convId = await seedConversation(TERMINAL_META);

			const { text } = await drainUserTurn(convId, "sim, mostra pra mim");

			// O preâmbulo da 1a tentativa NUNCA vaza pro usuário (sanitizer barrou).
			expect(text).not.toContain(FIRST_ATTEMPT_TEXT);
			expect(text.toLowerCase()).not.toContain("vou buscar");
			// O fallback fixo de turno-vazio NÃO dispara — o retry resolveu o turno.
			expect(text).not.toBe(EMPTY_TURN_FALLBACK);
			// A resposta REAL da segunda tentativa chega ao usuário.
			expect(text).toContain("R$ 3.240,25");
			// Prova de que o retry aconteceu de verdade: 2 chamadas a resolveAgent
			// (1a tentativa + retry-com-motivo), não 1.
			expect(resolveAgent).toHaveBeenCalledTimes(2);
		});
	},
);
