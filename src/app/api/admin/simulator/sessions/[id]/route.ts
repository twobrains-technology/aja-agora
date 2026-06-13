/**
 * GET — retorna estado completo da conversa simulada (conv + msgs + handoff) pra retomar.
 * DELETE — apaga a conversa simulada (cascade nas messages/artifacts/leads).
 *
 * Dev-only: returns 404 in production.
 */
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, messages, user as userTable } from "@/db/schema";
import { requireRole } from "@/lib/admin/require-role";
import { isSimulatorEnabled } from "@/lib/utils/env";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;

	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, id), eq(conversations.isSimulated, true)),
	});
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	const msgs = await db
		.select({
			id: messages.id,
			role: messages.role,
			content: messages.content,
			channel: messages.channel,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.where(eq(messages.conversationId, conv.id))
		.orderBy(asc(messages.createdAt));

	const createdById =
		(conv.metadata as { createdBySimUserId?: string } | null)?.createdBySimUserId ?? null;
	const createdBy = createdById
		? await db.query.user.findFirst({
				where: eq(userTable.id, createdById),
				columns: { id: true, name: true },
			})
		: null;

	const handedOffUser = conv.handedOffUserId
		? await db.query.user.findFirst({
				where: eq(userTable.id, conv.handedOffUserId),
				columns: { id: true, name: true },
			})
		: null;

	return NextResponse.json({
		conversation: {
			id: conv.id,
			channel: conv.channel,
			waId: conv.waId,
			status: conv.status,
			contactName: conv.contactName,
			handedOffUserId: conv.handedOffUserId,
			isSimulated: conv.isSimulated,
			metadata: conv.metadata,
			createdAt: conv.createdAt,
			updatedAt: conv.updatedAt,
			createdBy: createdBy ?? null,
		},
		handoffState: {
			isHandedOff: conv.status === "handed_off",
			handedOffUser: handedOffUser ?? null,
		},
		messages: msgs,
	});
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	if (!isSimulatorEnabled()) {
		return new NextResponse("Not Found", { status: 404 });
	}
	const { error } = await requireRole("admin");
	if (error) return error;

	const { id } = await params;
	// Guard contra deletar conversa real por engano (esse endpoint só toca simuladas).
	const conv = await db.query.conversations.findFirst({
		where: and(eq(conversations.id, id), eq(conversations.isSimulated, true)),
		columns: { id: true },
	});
	if (!conv) return new NextResponse("Not Found", { status: 404 });

	await db.delete(conversations).where(eq(conversations.id, conv.id));
	return new NextResponse(null, { status: 204 });
}
