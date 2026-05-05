/**
 * SSE endpoint for the dev attendant simulator.
 * Streams messages that proxy.ts would send to the attendant's WhatsApp.
 *
 * GET /api/admin/simulator/<attendantId>/stream
 *
 * Dev-only: returns 404 in production.
 */
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { type SimulatorMessage, subscribeToAttendant } from "@/lib/whatsapp/simulator-bus";

export const dynamic = "force-dynamic";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ attendantId: string }> },
) {
	if (process.env.NODE_ENV === "production") {
		return new NextResponse("Not Found", { status: 404 });
	}

	const { error } = await requireRole("admin");
	if (error) return error;

	const { attendantId } = await params;

	const attendant = await db.query.user.findFirst({
		where: and(eq(userTable.id, attendantId), eq(userTable.role, "attendant")),
		columns: { id: true, name: true, phone: true },
	});

	if (!attendant || !attendant.phone) {
		return new NextResponse("Attendant not found", { status: 404 });
	}

	const phone = attendant.phone;
	const encoder = new TextEncoder();
	console.log(
		`[simulator-stream] opened for attendantId=${attendantId} name=${attendant.name} phone=${phone}`,
	);

	const stream = new ReadableStream({
		start(controller) {
			const initData = JSON.stringify({
				type: "connected",
				attendant: { id: attendant.id, name: attendant.name, phone },
			});
			controller.enqueue(encoder.encode(`data: ${initData}\n\n`));

			const unsubscribe = subscribeToAttendant(phone, (message: SimulatorMessage) => {
				try {
					console.log(
						`[simulator-stream] dispatching to client phone=${phone} text="${message.text.slice(0, 60)}"`,
					);
					const data = JSON.stringify({ type: "message", message });
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch (err) {
					console.error(`[simulator-stream] enqueue failed phone=${phone}:`, err);
					unsubscribe();
				}
			});

			const pingInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ping" })}\n\n`));
				} catch {
					clearInterval(pingInterval);
					unsubscribe();
				}
			}, 30_000);

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

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
