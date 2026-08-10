/**
 * SSE da conversa para quem ATENDE — a mensagem do cliente aparece na hora.
 *
 * Antes disto o painel buscava o histórico uma vez, no mount, e nunca mais: o
 * cliente respondia, a mensagem entrava no banco, e a tela continuava parada. O
 * atendente só descobria recarregando (relatado por Kairo, 2026-08-10).
 *
 * O `message-bus` já era alimentado pelo caminho do WhatsApp; o que faltava era
 * um consumidor do lado do admin. Mesmo desenho dos streams do simulador
 * (heartbeat de 25s, unsubscribe no abort).
 *
 * ⚠️ O bus é in-memory e single-process. Hoje prod roda UMA task, então funciona.
 * Num cenário de duas ou mais, o evento publicado numa instância não chega ao SSE
 * aberto na outra — e o sintoma seria silêncio, sem erro. Por isso o cliente
 * mantém um polling de baixa frequência como rede: cobre tanto esse dia quanto
 * reconexão caída. Trocar o bus por Postgres LISTEN/NOTIFY resolve na fonte.
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isMesaExterna } from "@/lib/admin/role-scope";
import { type BusMessage, subscribeMessages } from "@/lib/chat/message-bus";
import { conversaPertenceAoAtendente, getMesaAttendantByUserId } from "@/lib/mesa/handoff";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { error, session, role } = await requireRole("admin", "attendant", "mesa_externa");
	if (error) return error;

	const { id: conversationId } = await params;

	// Mesmo recorte da rota de envio: a mesa externa acompanha o cliente DELA.
	// Sem isto, trocar o id na URL daria um grampo na conversa de qualquer colega.
	if (isMesaExterna(role)) {
		const atendente = await getMesaAttendantByUserId(session.user.id);
		if (!atendente || !atendente.isActive) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}
		if (!(await conversaPertenceAoAtendente(conversationId, atendente.id))) {
			return NextResponse.json(
				{ error: "Forbidden", reason: "conversa_de_outro_atendente" },
				{ status: 403 },
			);
		}
	}

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { id: true },
	});
	if (!conv) return NextResponse.json({ error: "NotFound" }, { status: 404 });

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			const envia = (payload: unknown) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
					return true;
				} catch {
					return false;
				}
			};

			envia({ type: "connected", conversationId });

			const unsubscribe = subscribeMessages(conversationId, (message: BusMessage) => {
				envia({ type: "message", message });
			});

			// Heartbeat: proxy no meio do caminho derruba conexão ociosa em silêncio.
			const ping = setInterval(() => {
				if (!envia({ type: "ping" })) {
					clearInterval(ping);
					unsubscribe();
				}
			}, 25_000);

			req.signal.addEventListener("abort", () => {
				clearInterval(ping);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// já fechado
				}
			});
		},
	});

	return new NextResponse(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			// Nginx/ALB bufferizam SSE por padrão e a mensagem chega em lote.
			"X-Accel-Buffering": "no",
		},
	});
}
