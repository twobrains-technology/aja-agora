// Integration (DB real) — FIX-293 (P2 UX, veredito r9pos3 §3, probe-i2-
// justificativa turnos 8-9), REESCRITO pós-cirurgia "desamarra o agente"
// (commit dc553913, 2026-07-14): a resposta determinística de exatidão/
// critério do FIX-282/293 original respondia com TEXTO PRÉ-FABRICADO sem
// invocar o modelo — exatamente o antipadrão "servidor responde no lugar do
// modelo" que a cirurgia matou (ver CLAUDE.md, "Não engesse o agente"). A
// correção atual (index.ts, `exactnessFacts` → `systemContext`) NÃO faz
// short-circuit: o modelo é SEMPRE invocado, e o servidor injeta os NÚMEROS
// REAIS (rawCreditValue × creditValue) no contexto pra ele redigir a resposta
// — o invariante "nunca inventar número" vira DADO no prompt, não frase
// pronta. Este teste prova que os fatos corretos chegam ao contexto do modelo
// quando a pergunta é de exatidão/critério, e ficam AUSENTES quando não é
// (o modelo, aqui simulado, só responde honesto quando tem o dado). Skip sem
// DB.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Texto que um modelo LIVRE (sem os fatos reais no contexto) poderia fabricar
// — o bug real do veredito antigo. Serve de prova negativa: se a resposta
// final bater com isso quando a pergunta ERA de exatidão/critério, os fatos
// não chegaram ao contexto.
const FABRICATED_TEXT =
	"Às vezes esses grupos já estão cheios ou pausados, foi o valor mais próximo disponível — provavelmente era de outra administradora.";

const HONEST_TEXT_WITH_REAL_NUMBERS =
	"Você pediu R$ 120.000 e a carta real ficou em R$ 124.599 — houve ajuste, e o critério combinou prazo, parcela e chance de contemplação, não só o valor isolado.";

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

// Mock "obediente ao contexto": só responde com os números reais quando o
// orchestrator de fato injetou `exactnessFacts` no systemContext (prova que o
// DADO chegou); sem isso, fica livre — inclusive pra fabricar, como um modelo
// real sem informação faria. Nunca há short-circuit — resolveAgent É chamado
// sempre.
const resolveAgentMock = vi.fn(
	(_persona: unknown, _meta: unknown, opts?: { extraSystemBlocks?: string[] }) => {
		const blocks = (opts?.extraSystemBlocks ?? []).join(" ");
		const hasExactnessFacts = /124\.599/.test(blocks);
		return Promise.resolve(
			makeAgent(hasExactnessFacts ? HONEST_TEXT_WITH_REAL_NUMBERS : FABRICATED_TEXT),
		);
	},
);
vi.mock("@/lib/agent/agents", () => ({
	resolveAgent: (...args: unknown[]) =>
		// biome-ignore lint/suspicious/noExplicitAny: mock repassa args crus pro vi.fn tipado acima
		resolveAgentMock(...(args as [unknown, unknown, any])),
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
	"FIX-293 — pergunta de exatidão/critério em turno NORMAL (sem tool-error) injeta os fatos reais no contexto do modelo, nunca responde por ele",
	() => {
		let convId: string;
		beforeEach(() => vi.clearAllMocks());
		afterEach(async () => {
			if (convId) await cleanup(convId);
		});

		it('"por que essa e não outra?" SEM tool-error → modelo É invocado, mas com os números reais (rawCreditValue × creditValue) no contexto', async () => {
			convId = await seedConversation(REVEAL_READY_META);

			const text = await drainUserTurn(convId, "Por que essa e não outra? Qual o critério?");

			expect(resolveAgentMock).toHaveBeenCalled();
			const opts = resolveAgentMock.mock.calls[0]?.[2] as { extraSystemBlocks?: string[] };
			expect((opts?.extraSystemBlocks ?? []).join(" ")).toMatch(/124\.599/);
			expect(text).not.toBe(FABRICATED_TEXT);
			expect(text).not.toMatch(/cheio|pausado/i);
			expect(text).not.toMatch(/outra administradora/i);
			expect(text).toMatch(/124\.599/);
		});

		it('"é de 120 mil como pedi?" (exatidão) SEM tool-error → contexto injetado compara rawCreditValue × creditValue, modelo redige', async () => {
			convId = await seedConversation(REVEAL_READY_META);

			const text = await drainUserTurn(convId, "Essa carta é de 120 mil como pedi, sem ajuste?");

			expect(resolveAgentMock).toHaveBeenCalled();
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
