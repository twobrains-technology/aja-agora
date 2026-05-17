/**
 * SSE: eventos do agente em direção ao cliente simulado.
 * Subscribe no bus por waId, replica pro EventSource.
 * Dev-only.
 */
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { type SimulatorClientEvent, subscribeToClient } from "@/lib/whatsapp/simulator-bus";

export const dynamic = "force-dynamic";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ conversationId: string }> },
) {
	if (process.env.NODE_ENV === "production") {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
	if (error) return error;

	const { conversationId } = await params;

	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, conversationId), eq(conversations.isSimulated, true)),
		columns: { id: true, waId: true, channel: true },
	});
	if (!conv || conv.channel !== "whatsapp" || !conv.waId) {
		return new NextResponse("Conversa simulada de whatsapp não encontrada", { status: 404 });
	}
	const waId = conv.waId;

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			const initData = JSON.stringify({ type: "connected", waId });
			controller.enqueue(encoder.encode(`data: ${initData}\n\n`));

			const unsubscribe = subscribeToClient(waId, (event: SimulatorClientEvent) => {
				try {
					const data = JSON.stringify({ type: "event", event });
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch (err) {
					console.error("[sim-whatsapp-stream] enqueue error", err);
				}
			});

			// Heartbeat a cada 25s pra evitar timeouts intermediários.
			const pingInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ping" })}\n\n`));
				} catch {
					clearInterval(pingInterval);
					unsubscribe();
				}
			}, 25_000);

			// Cleanup quando o cliente fecha a conexão — sem isso o listener vaza
			// no `simulator-bus` toda vez que a aba fecha ou troca de sessão.
			// Mesmo padrão usado em `attendant/stream/route.ts`.
			req.signal.addEventListener("abort", () => {
				clearInterval(pingInterval);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// already closed
				}
			});
		},
	});

	return new NextResponse(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
