import { type NextRequest } from "next/server";
import { streamText, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
	conversations,
	messages as messagesTable,
	artifacts as artifactsTable,
} from "@/db/schema";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { consorcioTools, PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sendTextMessage } from "@/lib/whatsapp/api";
import { publishMessage } from "@/lib/chat/message-bus";

export const maxDuration = 60;

const anthropic = createAnthropic();

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

	const lastMessage = messages[messages.length - 1];

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

		// ---- Handoff relay: if conversation is handed off, forward to vendor via WhatsApp ----
		if (conv.status === "handed_off" && lastMessage?.role === "user") {
			const userText = lastMessage.content;

			// Save user message to DB
			await db.insert(messagesTable).values({
				conversationId,
				role: "user",
				content: userText,
			});

			// Relay to vendor via WhatsApp
			const userName = conv.contactName ?? "Cliente";
			if (conv.handedOffTo) {
				await sendTextMessage(conv.handedOffTo, `*${userName}:*\n${userText}`);
			}

			// Publish to SSE bus so the user's own message confirms delivery
			publishMessage(conversationId, {
				id: crypto.randomUUID(),
				role: "user",
				content: userText,
				createdAt: new Date().toISOString(),
			});

			// Return a simple SSE stream with confirmation
			const encoder = new TextEncoder();
			const ackStream = new ReadableStream({
				start(controller) {
					const agentName = conv.agentName ?? "Consultor";
					const ack = JSON.stringify({
						type: "text-delta",
						textDelta: `_Mensagem enviada para ${agentName}. Aguarde a resposta aqui._`,
					});
					controller.enqueue(encoder.encode(`data: ${ack}\n\n`));
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					controller.close();
				},
			});

			return new Response(ackStream, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
					"X-Conversation-Id": conversationId,
					"X-Handed-Off": "true",
				},
			});
		}
	}

	// ---- Save user message to DB ----
	if (lastMessage && lastMessage.role === "user") {
		await db.insert(messagesTable).values({
			conversationId,
			role: "user",
			content: lastMessage.content,
		});
	}

	// ---- Build core messages (filter out empty assistant placeholders) ----
	const coreMessages = messages
		.filter((m) => m.content.length > 0)
		.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
		}));

	// ---- Stream response via AI SDK streamText ----
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

				const result = streamText({
					model: anthropic(
						process.env.AI_MODEL ?? "claude-sonnet-4-20250514",
					),
					system: SYSTEM_PROMPT,
					messages: coreMessages,
					tools: consorcioTools,
					stopWhen: stepCountIs(10),
				});

				for await (const part of result.fullStream) {
					switch (part.type) {
						case "text-delta": {
							fullResponse += part.text;
							const data = JSON.stringify({
								type: "text-delta",
								textDelta: part.text,
							});
							controller.enqueue(
								encoder.encode(`data: ${data}\n\n`),
							);
							break;
						}

						case "tool-call": {
							// Presentation tools emit artifact events for the frontend
							const shortName = part.toolName.replace(
								"present_",
								"",
							);
							if (PRESENTATION_TOOLS.has(part.toolName)) {
								const artifact = {
									id: part.toolCallId,
									type: shortName,
									payload: part.input as Record<
										string,
										unknown
									>,
								};
								emittedArtifacts.push(artifact);
								const artifactData = JSON.stringify({
									type: "artifact",
									artifact,
								});
								controller.enqueue(
									encoder.encode(
										`data: ${artifactData}\n\n`,
									),
								);
							}
							break;
						}

						case "error": {
							const errorData = JSON.stringify({
								type: "error",
								error:
									part.error instanceof Error
										? part.error.message
										: "Erro interno",
							});
							controller.enqueue(
								encoder.encode(`data: ${errorData}\n\n`),
							);
							break;
						}
					}
				}

				// ---- Persist assistant response ----
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

				// ---- Persist emitted artifacts ----
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
						console.error(
							"Failed to persist artifacts:",
							artifactErr,
						);
					}
				}

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
