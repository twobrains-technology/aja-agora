// Mensagens do agente que apareceram DEPOIS do último turno — o caminho pelo
// qual uma retomada chega ao cliente no canal web.
//
// O contexto: quando o worker retoma uma conversa parada, o turno roda num
// processo separado do app e o `persist` grava a fala no banco. No WhatsApp a
// Meta entrega e acabou; no web não há para onde empurrar — o SSE do turno
// morreu junto com o POST, e o `message-bus` do `/api/chat/stream` vive na
// memória do processo do app, que o worker não alcança. Sem este endpoint a
// retomada existia no banco e o cliente só a via se recarregasse a página, o
// que é justamente a "solução manual" que não conta como solução.
//
// Por que não reusar `/api/chat/resume`: aquele hidrata a conversa inteira
// (mensagens, artifacts, estado) — payload pesado demais para um poll de 30s.
// Aqui é só o delta: quem chegou depois de `after`.
//
// A ponte Redis + SSE sempre aberto continua sendo a forma definitiva e é
// otimização de LATÊNCIA, não de correção: promover quando a retomada provar
// conversão, não antes.
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";

export async function GET(req: Request) {
	const url = new URL(req.url);
	const conversationId = url.searchParams.get("conversationId");
	const after = url.searchParams.get("after");
	if (!conversationId) {
		return Response.json({ error: "conversationId obrigatório" }, { status: 400 });
	}
	const desde = after ? new Date(after) : null;
	if (desde && Number.isNaN(desde.getTime())) {
		return Response.json({ error: "after inválido" }, { status: 400 });
	}

	const linhas = await db
		.select({
			id: messages.id,
			role: messages.role,
			content: messages.content,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.where(
			desde
				? and(eq(messages.conversationId, conversationId), gt(messages.createdAt, desde))
				: eq(messages.conversationId, conversationId),
		)
		.orderBy(asc(messages.createdAt))
		.limit(20);

	// Só fala do agente: a do próprio cliente já está na tela dele, e os
	// marcadores `[card: tipo]` são do log do admin, não da conversa.
	const novas = linhas.filter((m) => m.role === "assistant" && !m.content.startsWith("[card:"));

	return Response.json(
		{ messages: novas },
		{ headers: { "Cache-Control": "no-store, max-age=0" } },
	);
}
