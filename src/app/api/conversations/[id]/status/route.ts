import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, id),
		with: { handedOffUser: { columns: { name: true } } },
	});
	if (!conv) {
		return Response.json({ status: "active", agentName: null } as const, { status: 200 });
	}
	return Response.json({
		status: conv.status,
		agentName: conv.handedOffUser?.name ?? null,
	});
}
