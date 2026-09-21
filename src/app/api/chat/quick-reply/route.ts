// Consumo PERSISTIDO do atalho de resposta rápida do WEB.
//
// O `quick_reply` só sumia por estado local do componente (`submitted`), então
// recarregar a página devolvia o botão e o cliente clicava o mesmo atalho duas
// vezes — o segundo clique era reprocessado como resposta nova. A persistência
// mora na MESMA primitiva de idempotência do canal
// (`src/lib/whatsapp/once.ts` → `whatsapp_once_keys`), sem tabela nova.
//
// Duas operações, uma por verbo:
//   POST { conversationId, replyId } → { claimed } — reivindica o atalho. `false`
//     significa que ele JÁ foi usado: o componente não manda o turno de novo.
//   GET  ?conversationId=&replyIds=a,b → { consumed } — o que já foi usado, para
//     o render não devolver o botão depois do reload.
//
// Fail-open por herança de `claimOnce`/`consumedQuickReplies`: erro de banco
// nunca bloqueia o cliente (o pior caso é o comportamento de antes).

import type { NextRequest } from "next/server";
import { claimQuickReplyConsumption, consumedQuickReplies } from "@/lib/whatsapp/once";

export async function POST(req: NextRequest) {
	const body = (await req.json().catch(() => null)) as {
		conversationId?: unknown;
		replyId?: unknown;
	} | null;
	const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
	const replyId = typeof body?.replyId === "string" ? body.replyId : null;
	if (!conversationId || !replyId) {
		return new Response("conversationId e replyId são obrigatórios", { status: 400 });
	}
	const claimed = await claimQuickReplyConsumption(conversationId, replyId);
	return Response.json({ claimed });
}

export async function GET(req: NextRequest) {
	const params = new URL(req.url).searchParams;
	const conversationId = params.get("conversationId");
	const replyIds = (params.get("replyIds") ?? "").split(",").filter((id) => id.length > 0);
	if (!conversationId || replyIds.length === 0) {
		return Response.json({ consumed: [] });
	}
	return Response.json({
		consumed: await consumedQuickReplies(conversationId, replyIds),
	});
}
