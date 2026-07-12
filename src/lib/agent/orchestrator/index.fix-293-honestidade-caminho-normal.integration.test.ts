// Integration (DB real) — FIX-293 (P2 UX, veredito r9pos3 §3, probe-i2-
// justificativa turnos 8-9): a resposta determinística de exatidão/critério
// do FIX-282 (isExactnessOrCriteriaQuestion + buildToolErrorRecoveryExactnessFallback)
// SÓ disparava dentro do bloco de recuperação de tool-error/cap — numa
// conversa NORMAL (sem nenhum guard interceptando o turno, o caso de LONGE
// mais comum) o modelo ficava livre pra narrar qualquer coisa, incluindo
// estado de grupo inventado ("cheio"/"pausado") e especulação sobre
// administradora. Este teste prova que a MESMA pergunta, agora SEM
// tool-error, recebe a MESMA resposta determinística — o short-circuit
// acontece ANTES de invocar a LLM (nunca depois, pois o texto já teria
// streamado pro usuário). Skip sem DB.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Se o short-circuit FALHAR e o turno realmente chegar a invocar a LLM, este
// mock devolve texto fabricado (o bug real do veredito) — prova negativa: se
// o texto do teste bater com isso, o short-circuit não aconteceu.
const FABRICATED_TEXT =
	"Às vezes esses grupos já estão cheios ou pausados, foi o valor mais próximo disponível — provavelmente era de outra administradora.";

function makeAgent() {
	return {
		stream: async () => ({
			fullStream: (async function* () {
				yield { type: "text-delta", id: "s0", text: FABRICATED_TEXT };
			})(),
			finishReason: Promise.resolve("stop" as const),
			providerMetadata: Promise.resolve({}),
		}),
	};
}

const resolveAgentMock = vi.fn().mockResolvedValue(makeAgent());
vi.mock("@/lib/agent/agents", () => ({
	resolveAgent: (...args: unknown[]) => resolveAgentMock(...args),
	invalidateAgentCache: vi.fn(),
}));

vi.mock("@/lib/memory/orchestrator-bridge", () => ({
	resolveIdentityForTurn: () => null,
	loadMemoryContextForTurn: vi.fn().mockResolvedValue(null),
	memorySystemMessageFromContext: () => null,
	storeMemoriesForTurn: vi.fn().mockResolvedValue(undefined),
}));

const { db } = await import("@/db");
const { conversations, messages: messagesTable } = await import("@/db/schema");
const { runTurn } = await import("@/lib/agent/orchestrator");
type ConversationMetadata = import("@/lib/agent/personas").ConversationMetadata;

// ITAÚ 124.599 — usuário pediu 120.000 (mesmo fixture do FIX-282, agora sem
// nenhum tool-error no turno).
const REVEAL_READY_META: ConversationMetadata = {
	currentPersona: "auto",
	currentCategory: "auto",
	expertiseLevel: "neutro",
	experiencePrev: "first",
	qualifyConsented: true,
	identityCollected: true,
	revealCompleted: true,
	recommendedAdministradora: "ITAÚ",
	recommendedOffer: {
		administradora: "ITAÚ",
		creditValue: 124_599,
		termMonths: 200,
		monthlyPayment: 2182.01,
		groupId: "grp-itau",
	},
	qualifyAnswers: { creditMin: 100_000, creditMax: 120_000, prazoMeses: 60, hasLance: "yes" },
};

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [c] = await db
		.insert(conversations)
		.values({ contactName: "Rafael", metadata: meta })
		.returning();
	return c.id;
}

async function cleanup(convId: string): Promise<void> {
	await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));
	await db.delete(conversations).where(eq(conversations.id, convId));
}

async function drainUserTurn(conversationId: string, userText: string): Promise<string> {
	let text = "";
	const gen = runTurn({
		channel: "web",
		conversationId,
		userText,
		isUserTurn: true,
		contactName: "Rafael",
	});
	for await (const ev of gen) {
		if (ev.type === "text-delta") text += ev.text;
	}
	return text;
}

describeIfDb(
	"FIX-293 — pergunta de exatidão/critério em turno NORMAL (sem tool-error) recebe resposta determinística, nunca texto livre fabricado",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it('"por que essa e não outra?" SEM tool-error → short-circuit ANTES da LLM, resposta cita os números reais, LLM nunca é invocada', async () => {
			convId = await seedConversation(REVEAL_READY_META);

			const text = await drainUserTurn(convId, "Por que essa e não outra? Qual o critério?");

			expect(resolveAgentMock).not.toHaveBeenCalled();
			expect(text).not.toBe(FABRICATED_TEXT);
			expect(text).not.toMatch(/cheio|pausado/i);
			expect(text).not.toMatch(/outra administradora/i);
			expect(text).toMatch(/124\.599/);
		});

		it('"é de 120 mil como pedi?" (exatidão) SEM tool-error → mesma resposta determinística, compara rawCreditValue × creditValue', async () => {
			convId = await seedConversation(REVEAL_READY_META);

			const text = await drainUserTurn(convId, "Essa carta é de 120 mil como pedi, sem ajuste?");

			expect(resolveAgentMock).not.toHaveBeenCalled();
			expect(text).toMatch(/120\.000/);
			expect(text).toMatch(/124\.599/);
		});

		it('"quero ver mais opções" (fora do padrão exatidão/critério) NÃO short-circuita — turno segue normal, LLM É invocada', async () => {
			convId = await seedConversation(REVEAL_READY_META);

			const text = await drainUserTurn(convId, "quero ver mais opções");

			expect(resolveAgentMock).toHaveBeenCalled();
			expect(text).toBe(FABRICATED_TEXT);
		});

		it("pergunta de critério ANTES do reveal (revealCompleted=false) NÃO short-circuita — nada pra justificar ainda", async () => {
			convId = await seedConversation({ ...REVEAL_READY_META, revealCompleted: false });

			const text = await drainUserTurn(convId, "Por que essa e não outra?");

			expect(resolveAgentMock).toHaveBeenCalled();
			expect(text).toBe(FABRICATED_TEXT);
		});
	},
);
