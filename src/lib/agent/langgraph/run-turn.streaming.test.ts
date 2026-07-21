// FIX-359 — streaming de token ao vivo (`graph.invoke` → `graph.stream`,
// `streamMode: ["custom", "values"]`). Prova o invariante que distingue
// "ao vivo" de "drenado do estado final": o chamador recebe vários
// `text-delta` ANTES do nó `persist` (último do grafo) gravar a mensagem no
// banco — não é só ordem no array, é ENTREGA PROGRESSIVA de verdade
// (`FakeStreamingChatModel` com `sleep>0` produz delay real entre chunks).
import { eq } from "drizzle-orm";
import { AIMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

const HAS_DB =
	Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

vi.mock("@/lib/agent/turn-analyzer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/agent/turn-analyzer")>(
		"@/lib/agent/turn-analyzer",
	);
	return {
		...actual,
		analyzeTurn: vi.fn().mockResolvedValue({
			reasoning: "mock neutro — FIX-359 streaming",
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
const { conversations, messages: messagesTable } = await import("@/db/schema");
const { createRunTurnLangGraph } = await import("./run-turn");

async function seedConversation(meta: ConversationMetadata): Promise<string> {
	const [conv] = await db.insert(conversations).values({ metadata: meta }).returning();
	return conv.id;
}

async function cleanup(conversationId: string): Promise<void> {
	await db.delete(conversations).where(eq(conversations.id, conversationId));
}

const conversationIdsToClean: string[] = [];

afterEach(() => {
	__setDiscoveryAdapterFactoryForTests(null);
});

afterAll(async () => {
	for (const id of conversationIdsToClean) await cleanup(id);
});

describeIfDb("FIX-359 — streaming ao vivo: graph.stream() em vez de graph.invoke()", () => {
	it("entrega ≥2 text-delta ao chamador ANTES do nó persist gravar a mensagem no banco", async () => {
		const conversationId = await seedConversation({
			currentPersona: "auto",
			currentCategory: "auto",
			desireAsked: true,
			identityCollected: false,
			qualifyAnswers: {},
		});
		conversationIdsToClean.push(conversationId);

		// Múltiplas FRASES (o sanitizer/EphemeralTextFilter — I4/I5/D7 — só libera
		// texto em fronteira de frase, `. ! ? : \n`; nenhuma delas é pergunta,
		// pra não ficar segurada até o `flush()` final, FIX-298) — precisamos de
		// ≥2 text-delta ANTES do fim do turno pra provar streaming real.
		const model = new FakeStreamingChatModel({
			responses: [
				new AIMessage(
					"Legal, voce esta buscando um carro. Isso e otimo pra comecar. Vamos avancar com calma agora.",
				),
			],
			sleep: 3,
		});
		const runTurn = createRunTurnLangGraph({ model });

		const gen = runTurn({
			channel: "web",
			conversationId,
			userText: "quero um carro",
			isUserTurn: true,
		});

		const textDeltasSeen: string[] = [];
		let sawTwoDeltas = false;
		for (let i = 0; i < 2000 && !sawTwoDeltas; i++) {
			const { value, done } = await gen.next();
			if (done) break;
			if (value.type === "text-delta") {
				textDeltasSeen.push(value.text);
				if (textDeltasSeen.length >= 2) sawTwoDeltas = true;
			}
		}
		expect(sawTwoDeltas).toBe(true);

		// Invariante-chave: neste ponto o nó `persist` (ÚLTIMO do grafo) ainda
		// não rodou — a mensagem do assistente ainda não existe no banco. Se o
		// runtime ainda usasse `graph.invoke()`, o turno INTEIRO já teria
		// terminado (persist incluso) antes do primeiro evento sair pro
		// chamador — esta asserção FALHARIA.
		const midMessages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, conversationId));
		expect(midMessages.some((m) => m.role === "assistant")).toBe(false);

		const rest: TurnEvent[] = [];
		for await (const ev of gen) rest.push(ev);
		expect(rest.at(-1)).toEqual({ type: "finish", reason: "ok" });

		// Só DEPOIS de drenar o resto (persist já rodou) a mensagem existe.
		const finalMessages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, conversationId));
		expect(finalMessages.some((m) => m.role === "assistant")).toBe(true);
	});

	it("eventos 'gate'/'meta-update' só saem depois que a persistência já rodou (ordem por topologia)", async () => {
		const conversationId = await seedConversation({
			currentPersona: "auto",
			currentCategory: "auto",
			desireAsked: true,
			identityCollected: false,
			qualifyAnswers: {},
		});
		conversationIdsToClean.push(conversationId);

		const model = new FakeStreamingChatModel({
			responses: [new AIMessage("Show, me conta mais sobre o que voce procura.")],
			sleep: 0,
		});
		const runTurn = createRunTurnLangGraph({ model });

		const events = await (async () => {
			const out: TurnEvent[] = [];
			for await (const ev of runTurn({
				channel: "web",
				conversationId,
				userText: "quero um carro",
				isUserTurn: true,
			})) {
				out.push(ev);
			}
			return out;
		})();

		const metaUpdateIndex = events.findIndex((ev) => ev.type === "meta-update");
		const finishIndex = events.findIndex((ev) => ev.type === "finish");
		expect(metaUpdateIndex).toBeGreaterThanOrEqual(0);
		expect(finishIndex).toBeGreaterThan(metaUpdateIndex);
	});
});
