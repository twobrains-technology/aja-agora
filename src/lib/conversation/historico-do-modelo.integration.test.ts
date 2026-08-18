/**
 * O agente aprendeu a gramática interna lendo o próprio histórico (prod, 2026-08-16).
 *
 * Na conversa `ff8f2080` (web) o cliente leu, na tela, esta mensagem do agente:
 *
 *     Perfeito, Kairo!
 *     [card: escolher_cota com id 6a7b59c125935b16a731639c]
 *
 * `escolher_cota` é TOOL, não card: o modelo NARROU a chamada em vez de
 * executá-la. E ele não inventou essa sintaxe — nós a ensinamos.
 *
 * Cada artifact emitido grava no banco uma mensagem marcadora de assistente
 * (`persist.ts:141`, `web/adapter.ts:309`), do tipo `[card: comparison_table]`.
 * Ela existe para o LOG DO ADMIN, não é fala. Três lugares sabem disso e
 * filtram: `loadLastAssistantText` (messages.ts), `resume.ts` (o que o front
 * remonta) e `/api/chat/novas`. O quarto — `loadConversationHistory`, que é
 * justamente o que `run-turn.ts:103` entrega ao MODELO — não filtrava.
 *
 * O resultado é few-shot acidental: numa conversa com meia dúzia de cards, o
 * modelo recebe meia dúzia de exemplos de "fala minha anterior" no formato
 * `[card: X]` e conclui, com razão, que é assim que se aciona coisa do sistema.
 * Na hora de acionar `escolher_cota` ele escreveu em vez de chamar — e a
 * escolha do cliente nunca foi ancorada.
 *
 * Isto NÃO é filtro de fala do modelo (o anti-padrão revertido em `649320dc`):
 * o alvo aqui é o que ENTRA no contexto, não o que sai dele. Não se está
 * calando o agente; está-se parando de ensinar a ele uma sintaxe que não é dele.
 *
 * Skip se DATABASE_URL ausente (mesmo padrão dos demais .integration).
 */

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("histórico entregue ao modelo — marcador de card não é fala", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let loadConversationHistory: typeof import("./messages").loadConversationHistory;

	let convId = "";

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ loadConversationHistory } = await import("./messages"));

		const [conv] = await db
			.insert(schema.conversations)
			.values({ waId: "5562990000001", channel: "web", status: "active" })
			.returning();
		convId = conv.id;

		// A sequência exata de `ff8f2080`, reduzida ao que importa: fala, marcador,
		// fala. Em produção eram seis marcadores antes do vazamento.
		const linhas: Array<["user" | "assistant", string]> = [
			["user", "Quero um carro. Consigo pagar R$ 1.800/mês."],
			["assistant", "Que legal! Carro novo muda tudo mesmo."],
			["assistant", "[card: quick_reply]"],
			["user", "Já tenho modelo em mente"],
			["assistant", "Ótimo! Qual é o modelo e quanto custa?"],
			["assistant", "[card: comparison_table]"],
			["assistant", "[card: recommendation_card]"],
			["user", "Voltei"],
		];
		for (const [role, content] of linhas) {
			await db.insert(schema.messages).values({ conversationId: convId, role, content });
		}
	});

	afterAll(async () => {
		if (convId) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, [convId]));
		}
	});

	it("nenhuma linha do histórico é um marcador de card", async () => {
		const historico = await loadConversationHistory(convId);
		const marcadores = historico.filter((m) => /^\[card:/i.test(m.content.trim()));
		expect(marcadores).toEqual([]);
	});

	it("a fala de verdade continua inteira, na ordem", async () => {
		const historico = await loadConversationHistory(convId);
		expect(historico.map((m) => m.content)).toEqual([
			"Quero um carro. Consigo pagar R$ 1.800/mês.",
			"Que legal! Carro novo muda tudo mesmo.",
			"Já tenho modelo em mente",
			"Ótimo! Qual é o modelo e quanto custa?",
			"Voltei",
		]);
	});

	it("dois marcadores seguidos não deixam turno de assistente vazio no lugar", async () => {
		const historico = await loadConversationHistory(convId);
		expect(historico.some((m) => m.content.trim() === "")).toBe(false);
	});
});
