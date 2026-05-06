import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
	buildCreditReactionDirective,
	buildExperienceDoubtsDirective,
	buildExperienceFirstDirective,
	buildExperienceReturningDirective,
	buildGroupSelectedDirective,
	buildQualifyStartMoreDirective,
	buildQualifyStartYesDirective,
	buildTimeframeReactionDirective,
} from "@/lib/agent/orchestrator/directives";
import { type ConversationMetadata, type Persona, ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import type { ChatAction } from "@/lib/chat/actions";
import { publishMessage } from "@/lib/chat/message-bus";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import {
	pipeDirectiveTurn,
	pipeSearchSummaryTurn,
	pipeTransitionTurn,
	pipeUserTurn,
} from "@/lib/web/adapter";
import { relayWebUserToAgent } from "@/lib/whatsapp/proxy";

export const maxDuration = 60;

type ChatRequestBody = {
	id?: string;
	conversationId?: string;
	messages?: UIMessage[];
	action?: ChatAction;
};

function lastUserText(messages: UIMessage[] | undefined): string | null {
	if (!messages) return null;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "user") continue;
		const text = msg.parts
			.filter((p): p is { type: "text"; text: string } => p.type === "text")
			.map((p) => p.text)
			.join("");
		if (text.length > 0) return text;
	}
	return null;
}

export async function POST(req: NextRequest) {
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown";

	const rateLimitResult = checkRateLimit(ip);
	if (!rateLimitResult.allowed) {
		return new Response("Too many requests. Please wait a moment.", {
			status: 429,
			headers: {
				"Retry-After": String(Math.ceil((rateLimitResult.retryAfterMs ?? 60000) / 1000)),
			},
		});
	}

	const body = (await req.json()) as ChatRequestBody;
	const providedId = body.conversationId ?? body.id ?? null;

	let conversationId: string;
	let contactName: string | null = null;
	const conv = providedId
		? await db.query.conversations.findFirst({
				where: eq(conversations.id, providedId),
				with: {
					handedOffUser: { columns: { name: true, phone: true } },
				},
			})
		: undefined;

	if (providedId && !conv) {
		const [created] = await db.insert(conversations).values({ id: providedId }).returning();
		conversationId = created.id;
	} else if (conv) {
		conversationId = conv.id;
		contactName = conv.contactName ?? null;
	} else {
		const [created] = await db.insert(conversations).values({}).returning();
		conversationId = created.id;
	}

	if (conv?.status === "handed_off" && !body.action) {
		const userText = lastUserText(body.messages);
		if (!userText) {
			return new Response("No user message in payload", { status: 400 });
		}
		await saveMessage(conversationId, "user", userText, "web");
		const userName = conv.contactName ?? "Cliente";
		await relayWebUserToAgent(conversationId, userText, userName);
		publishMessage(conversationId, {
			id: crypto.randomUUID(),
			role: "user",
			content: userText,
			createdAt: new Date().toISOString(),
		});
		const agentName = conv.handedOffUser?.name ?? "Consultor";
		const stream = createUIMessageStream<AjaUIMessage>({
			execute: ({ writer }) => {
				const id = crypto.randomUUID();
				writer.write({ type: "text-start", id });
				writer.write({
					type: "text-delta",
					id,
					delta: `_Mensagem enviada para ${agentName}. Aguarde a resposta aqui._`,
				});
				writer.write({ type: "text-end", id });
			},
		});
		return createUIMessageStreamResponse({
			stream,
			headers: { "X-Conversation-Id": conversationId, "X-Handed-Off": "true" },
		});
	}

	const meta = conv ? metaOf(conv) : ({} as ConversationMetadata);

	if (body.action) {
		const stream = createUIMessageStream<AjaUIMessage>({
			execute: async ({ writer }) => {
				if (body.action?.kind === "category") {
					if (!(ROUTABLE_CATEGORIES as readonly string[]).includes(body.action.category)) return;
					const fromPersona: Persona = meta.currentPersona ?? "concierge";
					await pipeTransitionTurn({
						conversationId,
						fromPersona,
						toCategory: body.action.category,
						contactName,
						writer,
					});
					return;
				}

				if (body.action?.kind === "select-group") {
					const { groupId, administradora, creditValue, termMonths, label } = body.action;
					await saveMessage(conversationId, "user", label, "web");
					await pipeDirectiveTurn({
						conversationId,
						directive: buildGroupSelectedDirective(
							administradora,
							groupId,
							creditValue,
							termMonths,
						),
						contactName,
						writer,
					});
					return;
				}

				if (body.action?.kind === "interest") {
					const { label } = body.action;
					await saveMessage(conversationId, "user", label, "web");
					const textId = crypto.randomUUID();
					writer.write({ type: "text-start", id: textId });
					writer.write({
						type: "text-delta",
						id: textId,
						delta:
							"Show, vou reservar essa opção pra você. Só preciso de uns dados rápidos pra te conectar com nosso consultor:",
					});
					writer.write({ type: "text-end", id: textId });
					writer.write({
						type: "data-artifact",
						id: crypto.randomUUID(),
						data: { type: "lead_form", payload: { conversationId } },
					});
					return;
				}

				if (body.action?.kind !== "gate") return;
				const action = body.action;

				if (action.gate === "experience") {
					const choice = action.value;
					await persistMeta(conversationId, {
						...meta,
						experiencePrev: choice,
						doubtsAddressed: choice === "doubts" ? false : meta.doubtsAddressed,
					});
					await saveMessage(conversationId, "user", action.label, "web");
					const directive =
						choice === "first"
							? buildExperienceFirstDirective(action.label)
							: choice === "returning"
								? buildExperienceReturningDirective(action.label)
								: buildExperienceDoubtsDirective(action.label);
					await pipeDirectiveTurn({ conversationId, directive, contactName, writer });
					return;
				}

				if (action.gate === "consent") {
					await saveMessage(conversationId, "user", action.label, "web");
					if (!meta.currentCategory) return;
					if (action.value === "yes") {
						await persistMeta(conversationId, { ...meta, qualifyConsented: true });
						await pipeDirectiveTurn({
							conversationId,
							directive: buildQualifyStartYesDirective(),
							contactName,
							writer,
						});
						return;
					}
					await persistMeta(conversationId, { ...meta, pendingFollowUp: true });
					await pipeDirectiveTurn({
						conversationId,
						directive: buildQualifyStartMoreDirective(),
						contactName,
						writer,
					});
					return;
				}

				if (action.gate === "credit") {
					const credit = action.value.credit;
					const creditMin = Math.round((credit * 0.85) / 1000) * 1000;
					const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
						...(meta.qualifyAnswers ?? {}),
						creditMin,
						creditMax: credit,
						monthlyBudget: action.value.monthlyBudget,
					};
					await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
					await saveMessage(conversationId, "user", action.label, "web");
					await pipeDirectiveTurn({
						conversationId,
						directive: buildCreditReactionDirective(action.label),
						contactName,
						writer,
					});
					return;
				}

				if (action.gate === "timeframe") {
					const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
						...(meta.qualifyAnswers ?? {}),
						prazoMeses: action.value.prazoMeses,
					};
					await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
					await saveMessage(conversationId, "user", action.label, "web");
					if (!meta.currentCategory) return;
					await pipeDirectiveTurn({
						conversationId,
						directive: buildTimeframeReactionDirective(action.label),
						contactName,
						writer,
					});
					return;
				}

				if (action.gate === "lance") {
					const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
						...(meta.qualifyAnswers ?? {}),
						hasLance: action.value,
					};
					await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
					await saveMessage(conversationId, "user", action.label, "web");
					if (!meta.currentCategory) return;
					await pipeSearchSummaryTurn({ conversationId, contactName, writer });
				}
			},
			onError: (error: unknown) =>
				error instanceof Error ? error.message : "Erro interno no servidor",
		});
		return createUIMessageStreamResponse({
			stream,
			headers: { "X-Conversation-Id": conversationId },
		});
	}

	const userText = lastUserText(body.messages);
	if (!userText) {
		return new Response("No user message in payload", { status: 400 });
	}

	const stream = createUIMessageStream<AjaUIMessage>({
		execute: async ({ writer }) => {
			await pipeUserTurn({ conversationId, userText, contactName, writer });
		},
		onError: (error: unknown) =>
			error instanceof Error ? error.message : "Erro interno no servidor",
	});

	return createUIMessageStreamResponse({
		stream,
		headers: { "X-Conversation-Id": conversationId },
	});
}
