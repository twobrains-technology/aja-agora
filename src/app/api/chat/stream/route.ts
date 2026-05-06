/**
 * SSE endpoint for real-time vendor messages during handoff.
 * Web user connects here after conversation is handed off.
 *
 * GET /api/chat/stream?conversationId=xxx
 *
 * Emits:
 *   data: { type: "message", message: { role, content, agentName } }
 *   data: { type: "handoff", status: "claimed", agentName: "..." }
 *   data: { type: "ping" }
 */

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { type BusMessage, subscribeMessages } from "@/lib/chat/message-bus";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const conversationId = req.nextUrl.searchParams.get("conversationId");

	if (!conversationId) {
		return new Response("conversationId required", { status: 400 });
	}

	// Verify conversation exists and is handed off
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		with: {
			handedOffUser: {
				columns: { name: true },
			},
		},
	});

	if (!conv) {
		return new Response("Conversation not found", { status: 404 });
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		start(controller) {
			// Send initial connection event
			const initData = JSON.stringify({
				type: "connected",
				status: conv.status,
				agentName: conv.handedOffUser?.name ?? null,
			});
			controller.enqueue(encoder.encode(`data: ${initData}\n\n`));

			// Subscribe to new messages
			const unsubscribe = subscribeMessages(conversationId, (message: BusMessage) => {
				try {
					const data = JSON.stringify({ type: "message", message });
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch {
					// Stream closed
					unsubscribe();
				}
			});

			// Keep-alive ping every 30s
			const pingInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ping" })}\n\n`));
				} catch {
					clearInterval(pingInterval);
					unsubscribe();
				}
			}, 30_000);

			// Cleanup on abort
			req.signal.addEventListener("abort", () => {
				clearInterval(pingInterval);
				unsubscribe();
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
