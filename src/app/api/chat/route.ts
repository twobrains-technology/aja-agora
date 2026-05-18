import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { and, eq, sql } from "drizzle-orm";
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
import {
	detectBackIntent,
	popNavState,
	pushNavState,
} from "@/lib/agent/orchestrator/navigation";
import { type ConversationMetadata, type Persona, ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import type { ChatAction } from "@/lib/chat/actions";
import { publishMessage } from "@/lib/chat/message-bus";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import {
	COOKIE_MAX_AGE_SECONDS,
	COOKIE_NAME,
	generateCookieValue,
} from "@/lib/memory/identity";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { isUuid } from "@/lib/utils/id";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import {
	persistSimulatorCookieKey,
	withSimulatorClockIfNeeded,
} from "@/lib/utils/simulator-clock-wrap";
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

// Exported pra teste (Bv2-08-novo: payload legacy sem parts crashava).
export function lastUserText(
	messages: (UIMessage | { role?: string; parts?: unknown; content?: unknown })[] | undefined,
): string | null {
	if (!messages) return null;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i] as {
			role?: string;
			parts?: Array<{ type?: string; text?: string }>;
			content?: unknown;
		};
		if (msg.role !== "user") continue;
		// Format moderno: parts[]
		if (Array.isArray(msg.parts)) {
			const text = msg.parts
				.filter((p): p is { type: "text"; text: string } => p?.type === "text" && typeof p.text === "string")
				.map((p) => p.text)
				.join("");
			if (text.length > 0) return text;
		}
		// Fallback legacy: content como string
		if (typeof msg.content === "string" && msg.content.length > 0) {
			return msg.content;
		}
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

	// Cookie estável `aja_uid` pra mapear web anônimo → agent Letta (após
	// engajamento >= 3 turnos). Lazy create — só geramos cookie quando o
	// usuário interage. Ver ADR 2026-05-16.
	let userKey = req.cookies.get(COOKIE_NAME)?.value ?? null;
	let setNewCookie = false;
	if (!userKey) {
		userKey = generateCookieValue();
		setNewCookie = true;
	}

	const body = (await req.json()) as ChatRequestBody;
	const providedId = body.conversationId ?? body.id ?? null;

	// Guardrail: conversationId precisa ser UUID válido — coluna é UUID
	// no Postgres e query com string inválida quebra com 22P02. Visto pelo
	// QA DEV (integração externa com conversationId="test-qa-001" deu 500).
	if (providedId && !isUuid(providedId)) {
		return new Response(
			JSON.stringify({
				error: "Invalid conversationId",
				message: "conversationId must be a valid UUID v1-v5",
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

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
			createdAt: simulatorNow().toISOString(),
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

	// Simulator: persiste o cookie key na 1ª passagem pra que GET /memory
	// reconstrua identity em qualquer admin. No-op em conv real.
	await persistSimulatorCookieKey(
		{ id: conversationId, isSimulated: conv?.isSimulated ?? false, channel: conv?.channel ?? null, metadata: conv?.metadata },
		userKey,
	);

	if (body.action) {
		const stream = createUIMessageStream<AjaUIMessage>({
			execute: async ({ writer }) => {
				await withSimulatorClockIfNeeded(conv ?? null, async () => {
				if (body.action?.kind === "category") {
					if (!(ROUTABLE_CATEGORIES as readonly string[]).includes(body.action.category)) return;
					const fromPersona: Persona = meta.currentPersona ?? "concierge";
					// Push snapshot do estado atual no nav stack pra suportar "voltar" (#06).
					const nextStack = pushNavState(meta.navigationStack ?? [], {
						persona: fromPersona,
						category: meta.currentCategory ?? null,
						expertiseLevel: meta.expertiseLevel,
						experiencePrev: meta.experiencePrev ?? null,
						qualifyAnswers: meta.qualifyAnswers,
					});
					await persistMeta(conversationId, { ...meta, navigationStack: nextStack });
					await pipeTransitionTurn({
						conversationId,
						fromPersona,
						toCategory: body.action.category,
						contactName,
						writer,
						userKey,
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
						userKey,
					});
					return;
				}

				if (body.action?.kind === "whatsapp_optin") {
					const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
					const result = await saveContactWhatsapp(conversationId, body.action.phone);
					const textId = crypto.randomUUID();
					writer.write({ type: "text-start", id: textId });
					if (result.ok) {
						const greetName = contactName ? `, ${contactName}` : "";
						writer.write({
							type: "text-delta",
							id: textId,
							delta: `Show${greetName}! Anotei seu WhatsApp. Se algo acontecer aqui, te chamo por lá. ✅`,
						});
						await persistMeta(conversationId, {
							...meta,
							whatsappOptinShown: true,
						});
					} else {
						writer.write({
							type: "text-delta",
							id: textId,
							delta:
								"Hmm, não consegui registrar esse número. Pode conferir e mandar de novo?",
						});
					}
					writer.write({ type: "text-end", id: textId });
					return;
				}

				if (body.action?.kind === "whatsapp_optin_decline") {
					await persistMeta(conversationId, {
						...meta,
						whatsappOptinShown: true,
						whatsappOptinDeclined: true,
					});
					const textId = crypto.randomUUID();
					writer.write({ type: "text-start", id: textId });
					writer.write({
						type: "text-delta",
						id: textId,
						delta: "Sem problema, seguimos por aqui mesmo.",
					});
					writer.write({ type: "text-end", id: textId });
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
						data: {
							type: "lead_form",
							payload: { conversationId, prefilledName: contactName ?? null },
						},
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
					await pipeDirectiveTurn({ conversationId, directive, contactName, writer, userKey });
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
							userKey,
						});
						return;
					}
					await persistMeta(conversationId, { ...meta, pendingFollowUp: true });
					await pipeDirectiveTurn({
						conversationId,
						directive: buildQualifyStartMoreDirective(),
						contactName,
						writer,
						userKey,
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
						userKey,
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
						userKey,
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
					await pipeSearchSummaryTurn({ conversationId, contactName, writer, userKey });
				}
				});
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

	// Intent textual "voltar" — early-return sem chamar o agent (#06 Bruna v1 review).
	if (detectBackIntent(userText)) {
		await saveMessage(conversationId, "user", userText, "web");
		const { stack: nextStack, popped } = popNavState(meta.navigationStack ?? []);
		const ackText = popped
			? "Voltando ao passo anterior."
			: "Você já está no início.";
		if (popped) {
			await persistMeta(conversationId, {
				...meta,
				navigationStack: nextStack,
				currentPersona: popped.persona,
				currentCategory: popped.category ?? undefined,
				expertiseLevel: popped.expertiseLevel,
				experiencePrev: popped.experiencePrev ?? undefined,
				qualifyAnswers: popped.qualifyAnswers,
			});
		}
		await saveMessage(conversationId, "assistant", ackText, "web", meta.currentPersona);
		const stream = createUIMessageStream<AjaUIMessage>({
			execute: ({ writer }) => {
				const id = crypto.randomUUID();
				writer.write({ type: "text-start", id });
				writer.write({ type: "text-delta", id, delta: ackText });
				writer.write({ type: "text-end", id });
			},
		});
		return createUIMessageStreamResponse({
			stream,
			headers: { "X-Conversation-Id": conversationId, "X-Navigation": popped ? "back" : "noop" },
		});
	}

	const stream = createUIMessageStream<AjaUIMessage>({
		execute: async ({ writer }) => {
			await withSimulatorClockIfNeeded(conv ?? null, async () => {
				await pipeUserTurn({ conversationId, userText, contactName, writer, userKey });
			});
		},
		onError: (error: unknown) =>
			error instanceof Error ? error.message : "Erro interno no servidor",
	});

	const responseHeaders: Record<string, string> = {
		"X-Conversation-Id": conversationId,
	};
	if (setNewCookie) {
		responseHeaders["Set-Cookie"] =
			`${COOKIE_NAME}=${userKey}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax; HttpOnly`;
	}
	return createUIMessageStreamResponse({
		stream,
		headers: responseHeaders,
	});
}
