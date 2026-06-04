import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { BeviConfigError, MinCreditError } from "@/lib/adapters/bevi/bevi-errors";
import { categoryToBeviSegment } from "@/lib/adapters/bevi/offer-mapper";
import {
	buildCreditReactionDirective,
	buildExperienceDoubtsDirective,
	buildExperienceFirstDirective,
	buildExperienceReturningDirective,
	buildGroupSelectedDirective,
	buildLanceReactionDirective,
	buildQualifyStartMoreDirective,
	buildQualifyStartYesDirective,
	buildTimeframeReactionDirective,
} from "@/lib/agent/orchestrator/directives";
import { detectBackIntent, popNavState, pushNavState } from "@/lib/agent/orchestrator/navigation";
import { type ConversationMetadata, type Persona, ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT, objetivoForPrazo } from "@/lib/agent/qualify-config";
import { confirmOffer, startContract, uploadContractDocument } from "@/lib/bevi/fulfillment";
import type { ChatAction } from "@/lib/chat/actions";
import { publishMessage } from "@/lib/chat/message-bus";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { isValidCpf, storeIdentity } from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, generateCookieValue } from "@/lib/memory/identity";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { isUuid } from "@/lib/utils/id";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import {
	persistSimulatorCookieKey,
	withSimulatorClockIfNeeded,
} from "@/lib/utils/simulator-clock-wrap";
import {
	pipeDirectiveTurn,
	pipeGatePrompt,
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
				.filter(
					(p): p is { type: "text"; text: string } =>
						p?.type === "text" && typeof p.text === "string",
				)
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

function brl(n: number): string {
	return n.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	});
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
		{
			id: conversationId,
			isSimulated: conv?.isSimulated ?? false,
			channel: conv?.channel ?? null,
			metadata: conv?.metadata,
		},
		userKey,
	);

	if (body.action) {
		// Persiste a mensagem do user (texto do botão clicado) UMA vez aqui no
		// topo, antes do switch. Antes do refactor cada branch chamava
		// `saveMessage` separado e o branch `category` esquecia — replica do
		// gap #2 do BUG-LEAD-HISTORY-INCOMPLETE. Centralização elimina o
		// risco de novos branches futuros esquecerem. Para actions sem
		// representação textual visível (whatsapp_optin com phone, decline
		// silencioso), o frontend ainda envia o label do botão via
		// `chat.sendMessage({ text: label })`, então `lastUserText` captura.
		const actionLabel = lastUserText(body.messages);
		if (actionLabel) {
			await saveMessage(conversationId, "user", actionLabel, "web");
		}

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
						const { groupId, administradora, creditValue, termMonths } = body.action;
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
								delta: "Hmm, não consegui registrar esse número. Pode conferir e mandar de novo?",
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

					// ── Passo 5 "Contratar" (fechamento Bevi) ──
					if (body.action?.kind === "contract-submit") {
						const q = meta.qualifyAnswers ?? {};
						const segmento = categoryToBeviSegment(meta.currentCategory ?? null);
						const valor = q.creditMax ?? q.creditMin ?? 50000;
						const objetivo = q.objetivo ?? "contemplacao_rapida";
						const lanceEmbutido = q.lanceEmbutido ? String(q.lanceEmbutidoPercent ?? 30) : "nenhum";
						const textId = crypto.randomUUID();
						writer.write({ type: "text-start", id: textId });
						try {
							const { proposalId, offer, noOffer } = await startContract(conversationId, {
								cpf: body.action.cpf,
								celular: body.action.celular,
								lgpd: body.action.lgpd,
								segmento,
								valor,
								objetivo,
								lanceEmbutido,
							});
							if (noOffer || !offer) {
								writer.write({
									type: "text-delta",
									id: textId,
									delta:
										"Não encontrei uma carta pra esse valor agora — o mínimo varia por tipo de bem. Quer ajustar o valor?",
								});
								writer.write({ type: "text-end", id: textId });
								return;
							}
							writer.write({
								type: "text-delta",
								id: textId,
								delta: `Confirmei com a ${offer.administradora}. Essa é a sua carta real — confere e confirma pra eu seguir:`,
							});
							writer.write({ type: "text-end", id: textId });
							writer.write({
								type: "data-artifact",
								id: crypto.randomUUID(),
								data: {
									type: "real_offer",
									payload: {
										proposalId,
										administradora: offer.administradora,
										grupo: offer.grupo,
										category: offer.category,
										creditValue: offer.creditValue,
										monthlyPayment: offer.monthlyPayment,
									},
								},
							});
						} catch (err) {
							const delta =
								err instanceof MinCreditError
									? `O valor mínimo pra esse tipo é ${brl(err.minCredit)}. Quer aumentar pra eu simular?`
									: err instanceof BeviConfigError
										? "Estamos concluindo a habilitação com a administradora — nosso time te chama pra finalizar. 🙏"
										: "Tive um problema ao falar com a administradora agora. Pode tentar de novo em instantes?";
							writer.write({ type: "text-delta", id: textId, delta });
							writer.write({ type: "text-end", id: textId });
						}
						return;
					}

					if (body.action?.kind === "offer-confirm") {
						const textId = crypto.randomUUID();
						writer.write({ type: "text-start", id: textId });
						try {
							const res = await confirmOffer(conversationId);
							writer.write({
								type: "text-delta",
								id: textId,
								delta: `Perfeito! Você está contratando um consórcio da ${res.administradora ?? "administradora"}, escolhida pela Aja Agora pro seu perfil. A gente segue com você até a contemplação — e depois dela.`,
							});
							writer.write({ type: "text-end", id: textId });
							writer.write({
								type: "data-artifact",
								id: crypto.randomUUID(),
								data: {
									type: "signature_handoff",
									payload: {
										administradora: res.administradora ?? "",
										consortiumProposalLink: res.consortiumProposalLink,
									},
								},
							});
							writer.write({
								type: "data-artifact",
								id: crypto.randomUUID(),
								data: {
									type: "document_upload",
									payload: {
										proposalId: res.proposalId,
										documentsLinkPersonal: res.documentsLinkPersonal,
										optional: true,
									},
								},
							});
						} catch {
							writer.write({
								type: "text-delta",
								id: textId,
								delta: "Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?",
							});
							writer.write({ type: "text-end", id: textId });
						}
						return;
					}

					if (body.action?.kind === "document-upload") {
						const action = body.action;
						const textId = crypto.randomUUID();
						writer.write({ type: "text-start", id: textId });
						try {
							const file = Buffer.from(action.fileBase64, "base64");
							const { ok, fallbackLink } = await uploadContractDocument(conversationId, {
								slot: action.slot,
								file,
								filename: action.filename,
								mimeType: action.mimeType,
							});
							writer.write({
								type: "text-delta",
								id: textId,
								delta: ok
									? "Recebi seu documento ✅. É isso — sua ficha está completa! Agora é com a administradora; te aviso de cada passo."
									: `Não consegui anexar por aqui. Finaliza rapidinho neste link: ${fallbackLink}`,
							});
						} catch {
							writer.write({
								type: "text-delta",
								id: textId,
								delta: "Tive um problema com o upload. Pode tentar enviar de novo?",
							});
						}
						writer.write({ type: "text-end", id: textId });
						return;
					}

					if (body.action?.kind === "document-skip") {
						const textId = crypto.randomUUID();
						writer.write({ type: "text-start", id: textId });
						writer.write({
							type: "text-delta",
							id: textId,
							delta:
								"Sem problema — os documentos são opcionais e você pode enviar depois. Sua proposta já está registrada! 🎉",
						});
						writer.write({ type: "text-end", id: textId });
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
							objetivo: objetivoForPrazo(action.value.prazoMeses),
						};
						await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
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
						if (!meta.currentCategory) return;
						// Jornada do doc: quem TEM reserva ("yes") passa pelo gate de lance
						// embutido (educa + opt-in) antes da busca. O directive dispara o
						// gate `lance-embutido` em seguida. "maybe"/"no" vão direto pra busca.
						if (action.value === "yes") {
							await pipeDirectiveTurn({
								conversationId,
								directive: buildLanceReactionDirective(action.label),
								contactName,
								writer,
								userKey,
							});
							return;
						}
						await pipeSearchSummaryTurn({ conversationId, contactName, writer, userKey });
						return;
					}

					// Gate "identify" (D1): valida server-side, persiste CIFRADO e libera a
					// busca real. A Bevi não simula sem CPF+celular+LGPD — sem isso, o
					// pipeSearchSummaryTurn re-emite este gate (tripwire).
					if (action.gate === "identify") {
						const { cpf, celular, lgpd } = action.value;
						const celularDigits = (celular ?? "").replace(/\D/g, "");
						if (!lgpd || !isValidCpf(cpf) || celularDigits.length < 10) {
							const textId = crypto.randomUUID();
							writer.write({ type: "text-start", id: textId });
							writer.write({
								type: "text-delta",
								id: textId,
								delta: !isValidCpf(cpf)
									? "Esse CPF não confere — dá uma olhadinha nos números?"
									: "Preciso do celular completo (com DDD) e do aceite pra seguir, tá?",
							});
							writer.write({ type: "text-end", id: textId });
							await pipeGatePrompt({ conversationId, gate: "identify", writer });
							return;
						}
						await storeIdentity(conversationId, { cpf, celular: celularDigits });
						// Celular vira contato do lead (mesma régua do whatsapp_optin).
						const { saveContactWhatsapp } = await import("@/lib/leads/contact-capture");
						await saveContactWhatsapp(conversationId, celularDigits).catch(() => {});
						await pipeSearchSummaryTurn({ conversationId, contactName, writer, userKey });
						return;
					}

					// docx passo 2: "Qual valor aproximado?" — o valor do lance vem do
					// USUÁRIO (gate lance-value), nunca derivado silencioso (auditoria
					// 2026-06-04). Persiste e dispara o próximo gate (lance-embutido).
					if (action.gate === "lance-value") {
						const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
							...(meta.qualifyAnswers ?? {}),
							lanceValue: action.value.lanceValue,
						};
						await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
						await pipeGatePrompt({ conversationId, gate: "lance-embutido", writer });
						return;
					}

					if (action.gate === "lance-embutido") {
						const considera = action.value === "yes";
						const q = meta.qualifyAnswers ?? {};
						const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
							...q,
							lanceEmbutido: considera,
							lanceEmbutidoPercent: considera ? LANCE_EMBUTIDO_DEFAULT_PERCENT : undefined,
							// lanceValue veio do gate lance-value (resposta do usuário).
							lanceValue: q.lanceValue,
						};
						await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
						if (!meta.currentCategory) return;
						await pipeSearchSummaryTurn({ conversationId, contactName, writer, userKey });
						return;
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
		const ackText = popped ? "Voltando ao passo anterior." : "Você já está no início.";
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
