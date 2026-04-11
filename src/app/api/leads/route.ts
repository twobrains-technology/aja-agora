import { type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { leadSchema } from "@/lib/validations/lead";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export async function POST(req: NextRequest) {
	// ---- Rate limiting ----
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown";

	const rateLimitResult = checkRateLimit(ip);
	if (!rateLimitResult.allowed) {
		return new Response("Too many requests. Please wait a moment.", {
			status: 429,
			headers: {
				"Retry-After": String(
					Math.ceil((rateLimitResult.retryAfterMs ?? 60000) / 1000),
				),
			},
		});
	}

	// ---- Parse + validate ----
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json(
			{ ok: false, error: "Invalid JSON body" },
			{ status: 400 },
		);
	}

	const { conversationId, ...formFields } = body as Record<string, unknown>;

	// Validate conversationId
	if (!conversationId || typeof conversationId !== "string") {
		return Response.json(
			{ ok: false, error: "conversationId is required" },
			{ status: 400 },
		);
	}

	// Validate form fields with shared Zod schema
	const parsed = leadSchema.safeParse(formFields);
	if (!parsed.success) {
		return Response.json(
			{ ok: false, error: "Validation failed", details: parsed.error.issues },
			{ status: 400 },
		);
	}

	// ---- Verify conversation exists ----
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId as string),
	});

	if (!conv) {
		return Response.json(
			{ ok: false, error: "Conversation not found" },
			{ status: 404 },
		);
	}

	// ---- Insert lead (PII stored only here, never in messages/artifacts) ----
	try {
		const [lead] = await db
			.insert(leads)
			.values({
				conversationId: conversationId as string,
				name: parsed.data.name,
				phone: parsed.data.phone,
				email: parsed.data.email,
			})
			.returning();

		return Response.json({ ok: true, leadId: lead.id });
	} catch (err) {
		console.error("Failed to insert lead:", err);
		return Response.json(
			{ ok: false, error: "Failed to save lead data" },
			{ status: 500 },
		);
	}
}
