import { type NextRequest } from "next/server";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { conversations, messages as messagesTable, artifacts as artifactsTable } from "@/db/schema";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { consorcioServer } from "@/lib/agent/tools";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export const maxDuration = 60;

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

	// ---- Parse request ----
	const body = await req.json();
	const { messages, conversationId: existingId } = body as {
		messages: Array<{ role: string; content: string }>;
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
		await db.insert(messagesTable).values({
			conversationId,
			role: "user",
			content: lastMessage.content,
		});
	}

	// ---- Build prompt from conversation history ----
	const conversationHistory = messages
		.map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
		.join("\n\n");

	// ---- Stream response via Agent SDK ----
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			try {
				let fullResponse = "";
				const emittedArtifacts: Array<{
					id: string;
					type: string;
					payload: Record<string, unknown>;
				}> = [];

				for await (const message of query({
					prompt: conversationHistory,
					options: {
						systemPrompt: SYSTEM_PROMPT,
						mcpServers: { consorcio: consorcioServer },
						allowedTools: [
							"mcp__consorcio__search_groups",
							"mcp__consorcio__simulate_quota",
							"mcp__consorcio__get_rates",
							"mcp__consorcio__get_group_details",
							"mcp__consorcio__recommend_groups",
							"mcp__consorcio__present_group_card",
							"mcp__consorcio__present_comparison_table",
							"mcp__consorcio__present_simulation_result",
						],
						maxTurns: 5,
					},
				})) {
					// Stream text content and detect artifact tool calls
					if (message.type === "assistant") {
						for (const block of message.message.content) {
							if (block.type === "text") {
								fullResponse += block.text;
								const data = JSON.stringify({
									type: "text-delta",
									textDelta: block.text,
								});
								controller.enqueue(
									encoder.encode(`data: ${data}\n\n`),
								);
							} else if (
								block.type === "tool_use" &&
								block.name.startsWith("mcp__consorcio__present_")
							) {
								// Extract artifact type from tool name: "mcp__consorcio__present_group_card" -> "group_card"
								const artifactType = block.name.replace(
									"mcp__consorcio__present_",
									"",
								);
								const artifact = {
									id: block.id,
									type: artifactType,
									payload: block.input as Record<string, unknown>,
								};
								emittedArtifacts.push(artifact);
								const artifactData = JSON.stringify({
									type: "artifact",
									artifact,
								});
								controller.enqueue(
									encoder.encode(`data: ${artifactData}\n\n`),
								);
							}
						}
					} else if (
						message.type === "result" &&
						message.subtype === "success"
					) {
						// Final result
						if (message.result && !fullResponse) {
							fullResponse = message.result;
							const data = JSON.stringify({
								type: "text-delta",
								textDelta: message.result,
							});
							controller.enqueue(
								encoder.encode(`data: ${data}\n\n`),
							);
						}
					}
				}

				// Save assistant response to DB
				let assistantMessageId: string | undefined;
				if (fullResponse) {
					const [assistantMsg] = await db
						.insert(messagesTable)
						.values({
							conversationId: conversationId!,
							role: "assistant",
							content: fullResponse,
						})
						.returning({ id: messagesTable.id });
					assistantMessageId = assistantMsg?.id;
				}

				// Persist emitted artifacts to DB
				if (emittedArtifacts.length > 0 && assistantMessageId) {
					try {
						await db.insert(artifactsTable).values(
							emittedArtifacts.map((a) => ({
								messageId: assistantMessageId!,
								type: a.type as
									| "group_card"
									| "comparison_table"
									| "simulation_result"
									| "recommendation_card"
									| "lead_form",
								payload: a.payload,
							})),
						);
					} catch (artifactErr) {
						console.error("Failed to persist artifacts:", artifactErr);
						// Don't break the stream — user already saw the artifacts via SSE
					}
				}

				// Send done event
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			} catch (error) {
				const errorMsg =
					error instanceof Error ? error.message : "Unknown error";
				const data = JSON.stringify({
					type: "error",
					error: errorMsg,
				});
				controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"X-Conversation-Id": conversationId,
		},
	});
}
