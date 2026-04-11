import {
	streamText,
	convertToModelMessages,
	stepCountIs,
	type UIMessage,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { conversations, messages as messagesTable } from "@/db/schema";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { createDomainTools } from "@/lib/agent/tools";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export const maxDuration = 60; // Allow up to 60s for agent responses

export async function POST(req: Request) {
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

	// ---- Parse request ----
	const body = await req.json();
	const { messages, conversationId: existingId } = body as {
		messages: UIMessage[];
		conversationId?: string;
	};

	if (!messages || !Array.isArray(messages) || messages.length === 0) {
		return new Response("Messages array is required", { status: 400 });
	}

	// ---- Session isolation: create or load conversation ----
	let conversationId = existingId;

	if (!conversationId) {
		const [conv] = await db.insert(conversations).values({}).returning();
		conversationId = conv.id;
	} else {
		// Verify conversation exists (prevents fabricated IDs)
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		if (!conv) {
			return new Response("Conversation not found", { status: 404 });
		}
	}

	// ---- Save user message to DB ----
	const lastMessage = messages[messages.length - 1];
	if (lastMessage && lastMessage.role === "user") {
		const contentText =
			lastMessage.parts
				?.filter(
					(p): p is { type: "text"; text: string } => p.type === "text",
				)
				.map((p) => p.text)
				.join("") ?? "";

		await db.insert(messagesTable).values({
			conversationId,
			role: "user",
			content: contentText,
		});
	}

	// ---- Create tools ----
	const tools = createDomainTools();

	// ---- Convert UI messages to model messages ----
	const modelMessages = await convertToModelMessages(messages);

	// ---- Stream response ----
	const result = streamText({
		model: anthropic("claude-sonnet-4-20250514"),
		system: SYSTEM_PROMPT,
		messages: modelMessages,
		tools,
		stopWhen: stepCountIs(5),
		onFinish: async ({ text }) => {
			// Save assistant response to DB
			if (text) {
				await db.insert(messagesTable).values({
					conversationId: conversationId!,
					role: "assistant",
					content: text,
				});
			}
		},
	});

	return result.toUIMessageStreamResponse({
		headers: {
			"X-Conversation-Id": conversationId,
		},
	});
}
