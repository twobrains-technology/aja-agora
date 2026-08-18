import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages as messagesTable } from "@/db/schema";
import { simulatorNow } from "@/lib/utils/simulator-clock";

export type Channel = "web" | "whatsapp";

/**
 * A linha é um MARCADOR de card, não fala?
 *
 * Todo artifact emitido grava uma mensagem de assistente com o corpo
 * `[card: tipo]` (`langgraph/nodes/persist.ts`, `web/adapter.ts`). Ela existe
 * para o log do admin — o cliente nunca a vê, e o modelo não deveria vê-la
 * também.
 *
 * Isto virou função porque a mesma regra já estava escrita em quatro lugares
 * (aqui, `chat/resume.ts`, `api/chat/novas`) e um deles — justamente o
 * histórico entregue ao modelo — estava sem ela. Regra crítica em cópias soltas
 * é o padrão que produz os defeitos desta base: uma cópia é corrigida, as
 * outras não, e ninguém percebe.
 *
 * Só vale para o assistente, de propósito: se um cliente escrever `[card: x]`,
 * isso é fala dele e tem que chegar ao modelo.
 */
export function ehMarcadorDeCard(role: string, content: string): boolean {
	return role === "assistant" && /^\[card:[^\]]*\]$/i.test(content.trim());
}

/**
 * O histórico como o MODELO o recebe (`langgraph/run-turn.ts`).
 *
 * Os marcadores de card saem daqui. Em produção (2026-08-16, conversa
 * `ff8f2080`) o modelo leu meia dúzia de `[card: comparison_table]` como se
 * fossem falas anteriores dele e, na hora de acionar a tool `escolher_cota`,
 * escreveu para o cliente `[card: escolher_cota com id 6a7b59c1…]` em vez de
 * chamá-la. Aprendeu a sintaxe conosco, e a escolha do cliente nunca foi
 * ancorada.
 */
export async function loadConversationHistory(
	conversationId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
	const msgs = await db.query.messages.findMany({
		where: eq(messagesTable.conversationId, conversationId),
		orderBy: (m, { asc }) => [asc(m.createdAt)],
	});

	return msgs
		.filter(
			(m) => m.role !== "system" && m.content.length > 0 && !ehMarcadorDeCard(m.role, m.content),
		)
		.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
		}));
}

/** A última fala do assistente nesta conversa — a pergunta que o usuário está
 * respondendo agora. Leitura barata (1 linha, index por conversa + ordem
 * decrescente) usada para ANCORAR o classificador de turno: sem ela, uma
 * resposta curta ("não", "uns 70 mil") é ambígua e acaba gravada no campo
 * errado. Ignora as mensagens marcadoras de card (`[card: tipo]`), que não são
 * fala. */
export async function loadLastAssistantText(conversationId: string): Promise<string | null> {
	const rows = await db.query.messages.findMany({
		where: eq(messagesTable.conversationId, conversationId),
		orderBy: (m, { desc }) => [desc(m.createdAt)],
		limit: 6,
	});
	for (const m of rows) {
		if (m.role !== "assistant") continue;
		const content = m.content?.trim() ?? "";
		if (!content || ehMarcadorDeCard(m.role, content)) continue;
		return content;
	}
	return null;
}

export async function saveMessage(
	conversationId: string,
	role: "user" | "assistant",
	content: string,
	channel: Channel,
	personaId?: string | null,
): Promise<string> {
	const [msg] = await db
		.insert(messagesTable)
		.values({
			conversationId,
			role,
			content,
			channel,
			personaId: personaId ?? null,
			createdAt: simulatorNow(),
		})
		.returning({ id: messagesTable.id });

	return msg.id;
}
