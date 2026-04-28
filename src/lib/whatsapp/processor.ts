/**
 * WhatsApp message processor.
 * Routes incoming WhatsApp messages through the AI pipeline or
 * the bidirectional proxy (when conversation is handed off to agent).
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getAdapter } from "@/lib/adapters";
import { resolveAgent } from "@/lib/agent/agents";
import { classifyTurn, type TurnClassification } from "@/lib/agent/classifier";
import type {
	ConversationMetadata,
	Persona,
	SpecialistPersona,
} from "@/lib/agent/personas";
import { PERSONA_CONFIG, ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import {
	ROUTE_TO_SPECIALIST_TOOL_NAME,
	type RouteToSpecialistInput,
} from "@/lib/agent/tools/concierge";
import { sendTextMessage } from "./api";
import {
	artifactToWhatsApp,
	formatTextForWhatsApp,
	resolveRange,
	splitMessage,
	transitionMessageText,
	welcomeButtonsToWhatsApp,
} from "./formatter";
import {
	getAttendantList,
	getHandoffState,
	handleAgentMessage,
	handoffToAgents,
	isAttendantPhone,
	relayUserToAgent,
} from "./proxy";
import { getOrCreateConversation, loadConversationHistory, saveMessage } from "./session";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// "Typing" delay curve: 200ms floor, 6ms per char, capped at 1.5s.
// Short chunk (~50 chars) pauses ~500ms; long chunk (~300 chars) pauses 2s (capped at 1.5s).
const typingDelay = (chars: number) => Math.min(1500, 200 + chars * 6);
// Fixed pause between messages where length doesn't apply (e.g. before an interactive card).
const ARTIFACT_PAUSE_MS = 500;
// Theatrical pause after the transition message before the specialist takes over.
// Tunable; 2s feels like "we're paging the specialist" without dragging.
const TRANSITION_DELAY_MS = 2000;

/**
 * Trigger a theatrical handoff from the concierge layer (or another specialist)
 * to a specialist persona. Sends the transition text, pauses, persists the
 * persona change, then injects a system message that wakes the specialist up
 * so they deliver their opening line in the next AI turn (with full
 * conversation history available to them).
 */
async function transitionToSpecialist(
	from: string,
	conversationId: string,
	fromPersona: Persona,
	toPersona: SpecialistPersona,
): Promise<void> {
	const config = PERSONA_CONFIG[toPersona];
	const fromConcierge = fromPersona === "concierge";

	// 1. Send transition message text
	const transitionText = transitionMessageText(
		{ name: config.name, emoji: config.emoji, categoryLabel: config.categoryLabel },
		fromConcierge,
	);
	await sendTextMessage(from, transitionText);

	// 2. Theatrical pause — feels like the specialist is being paged
	await sleep(TRANSITION_DELAY_MS);

	// 3. Persist persona change + mark this specialist as "seen"
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = (conv?.metadata ?? {}) as ConversationMetadata;
	const seenSet = new Set<SpecialistPersona>(meta.personasSeen ?? []);
	const isReturning = seenSet.has(toPersona);
	seenSet.add(toPersona);

	const updated: ConversationMetadata = {
		...meta,
		previousPersona: fromPersona,
		currentPersona: toPersona,
		personasSeen: Array.from(seenSet),
	};
	await persistMeta(conversationId, updated);

	// 4. Wake the specialist up. Nudge varies based on whether this is the
	// first time the persona is appearing or a return — and on whether the
	// previous turn was concierge or another specialist.
	let systemNudge: string;
	if (isReturning) {
		// Persona já apareceu antes — não se reapresenta, não solta hook,
		// retoma o assunto direto.
		systemNudge = `[sistema: voce esta RETOMANDO uma conversa que ja teve antes nesta sessao. NAO se apresente de novo (nao escreva "Oi, aqui e ${config.name}" nem "Aqui e ${config.name}" nem "${config.name} de novo"). NAO solte opening hook. Responda direto a ultima pergunta do usuario, com tom natural de quem esta voltando ao assunto. Pode comecar com "Vamos la,", "Beleza,", ou ja com o conteudo direto.]`;
	} else if (fromConcierge) {
		// Primeira aparição vinda da camada de concierge.
		systemNudge = `[sistema: PRIMEIRA aparicao sua na conversa. Abra com "Oi, aqui e ${config.name}." (uma frase curta de apresentacao SEM emoji ao lado do nome, SEM hook, SEM dado de mercado, SEM cargo) e ja siga pra pergunta de qualificacao curta sobre o que o usuario quer. NAO mencione "Aja" ou "recepcionista", nao existe ninguem com esse nome no time. Esta e a UNICA mensagem em que voce se apresenta.]`;
	} else {
		// Primeira aparição mas vindo de outro especialista — o usuário tinha contexto.
		systemNudge = `[sistema: PRIMEIRA aparicao sua, mas o usuario ja conversou com outro especialista do time antes (sobre outra categoria). NAO se apresente, JAMAIS comece com seu nome ou cargo. Comece DIRETO com a resposta a ultima pergunta do usuario, ou com uma reacao curta tipo "Beleza,", "Vamos la,", "Show,". Se o usuario perguntar quem e voce depois, ai sim diga seu nome. Nao mencione o nome do especialista anterior.]`;
	}

	await processTextMessage(from, systemNudge);
}

/**
 * Process an incoming WhatsApp text message.
 * Checks handoff state first — if handed off, relays instead of AI.
 */
export async function processTextMessage(
	from: string,
	text: string,
	contactName?: string,
): Promise<void> {
	try {
		// DEV: /reset command clears conversation state
		if (text.trim().toLowerCase() === "/reset") {
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.waId, from),
			});
			if (conv) {
				await db.delete(conversations).where(eq(conversations.id, conv.id));
			}
			await sendTextMessage(from, "🔄 Conversa resetada. Manda um oi pra começar de novo!");
			console.log(`[whatsapp-processor] Reset conversation for ${from}`);
			return;
		}

		// If sender is an attendant, route to proxy — never treat as buyer
		if (await isAttendantPhone(from)) {
			const handled = await handleAgentMessage(from, text);
			if (!handled) {
				await sendTextMessage(
					from,
					"⏳ Nenhuma conversa ativa no momento. Quando um cliente demonstrar interesse, você receberá o resumo aqui.",
				);
			}
			return;
		}

		// Check if this user's conversation is handed off
		const handoff = await getHandoffState(from);
		if (handoff?.isHandedOff) {
			await relayUserToAgent(from, text);
			return;
		}

		// Check if we're waiting for the user's name before handoff
		if (handoff?.conversationId) {
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.id, handoff.conversationId),
			});
			const meta = conv?.metadata as Record<string, unknown> | null;
			if (meta?.awaitingName) {
				const agents = await getAttendantList();
				if (agents.length > 0) {
					// Clear the awaiting flag
					await db
						.update(conversations)
						.set({
							metadata: { ...meta, awaitingName: false },
							contactName: text,
							updatedAt: new Date(),
						})
						.where(eq(conversations.id, handoff.conversationId));

					const history = await loadConversationHistory(handoff.conversationId);
					const summary = buildConversationSummary(history, []);
					await handoffToAgents(
						handoff.conversationId,
						from,
						text, // user's name
						summary,
					);
					return;
				}
			}
		}

		// Normal AI processing
		await processWithAI(from, text);
	} catch (err) {
		console.error(`[whatsapp-processor] Error processing message from ${from}:`, err);
		try {
			await sendTextMessage(
				from,
				"Desculpe, tive um problema processando sua mensagem. Pode tentar novamente?",
			);
		} catch {
			// Silent
		}
	}
}

/**
 * Process a message through the AI pipeline.
 */
async function processWithAI(from: string, text: string): Promise<void> {
	// 1. Get or create conversation
	const { id: conversationId } = await getOrCreateConversation(from);

	// 1.5. Resolve current persona from metadata (defaults to "concierge" for new convs)
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = (conv?.metadata ?? {}) as ConversationMetadata;
	const currentPersona: Persona = meta.currentPersona ?? "concierge";

	// 1.6. Classifier (Haiku) — runs only for specialist turns. The concierge
	// has its own routing tool (route_to_specialist), so we skip the classifier
	// there to avoid double work + double latency.
	let classification: TurnClassification | null = null;
	if (currentPersona !== "concierge") {
		classification = await classifyTurn(text, currentPersona);

		// Update meta signals if the classifier produced clear info.
		// Expertise only gets promoted to leigo/expert on HIGH confidence;
		// medium/low collapse to neutro to avoid premature didactic tone or
		// jargon based on weak signals.
		let metaChanged = false;
		const gatedExpertise =
			classification.confidence === "high" ? classification.expertiseLevel : "neutro";
		if (gatedExpertise !== "neutro" && gatedExpertise !== meta.expertiseLevel) {
			meta.expertiseLevel = gatedExpertise;
			metaChanged = true;
		}
		if (metaChanged) {
			await persistMeta(conversationId, meta);
		}

		// Specialist → specialist switch.
		// Triggers when classifier sees another category AND user signaled an
		// explicit switch ("na verdade", "mudei de ideia") OR the signal is
		// high-confidence on its own.
		if (
			classification.detectedCategory &&
			classification.detectedCategory !== currentPersona &&
			(classification.isExplicitSwitch || classification.confidence === "high")
		) {
			// Save the user message first so the new specialist sees it in history
			await saveMessage(conversationId, "user", text);
			await transitionToSpecialist(
				from,
				conversationId,
				currentPersona,
				classification.detectedCategory,
			);
			return;
		}
	}

	// 2. Save user message
	await saveMessage(conversationId, "user", text);

	// 3. Load conversation history
	const history = await loadConversationHistory(conversationId);

	// 4. Run AI pipeline
	let fullResponse = "";
	const artifacts: Array<{ type: string; payload: Record<string, unknown> }> = [];
	let routeIntent: { category: "imovel" | "auto" | "servicos" } | null = null;

	// Resolve the right agent for this turn (concierge | helena | rafael | camila).
	// Each agent encapsulates its own system prompt (with cacheControl), tools,
	// model and stop condition. See src/lib/agent/agents/.
	const isConcierge = currentPersona === "concierge";
	const agent = resolveAgent(currentPersona, meta);
	const result = await agent.stream({ messages: history });

	for await (const part of result.fullStream) {
		switch (part.type) {
			case "text-delta":
				fullResponse += part.text;
				break;
			case "tool-call": {
				// Concierge route intent — capture and short-circuit (we'll dispatch
				// transitionToSpecialist instead of letting the model continue).
				if (isConcierge && part.toolName === ROUTE_TO_SPECIALIST_TOOL_NAME) {
					const input = part.input as RouteToSpecialistInput;
					routeIntent = { category: input.category };
					break;
				}
				const shortName = part.toolName.replace("present_", "");
				if (PRESENTATION_TOOLS.has(part.toolName)) {
					artifacts.push({
						type: shortName,
						payload: part.input as Record<string, unknown>,
					});
				}
				break;
			}
		}
	}

	// Cache observability — logs Anthropic prompt cache stats per turn.
	// `cache_creation_input_tokens` = tokens written to cache (cache miss, +25% cost).
	// `cache_read_input_tokens` = tokens served from cache (cache hit, -90% cost).
	try {
		const meta = await result.providerMetadata;
		const anthropicMeta = meta?.anthropic as
			| { cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
			| undefined;
		if (anthropicMeta) {
			const written = anthropicMeta.cacheCreationInputTokens ?? 0;
			const read = anthropicMeta.cacheReadInputTokens ?? 0;
			if (written > 0 || read > 0) {
				console.log(`[cache] write=${written} read=${read} (persona=${currentPersona})`);
			}
		}
	} catch {
		// providerMetadata is best-effort — never fail the request because of logs
	}

	// Concierge → specialist routing detected: skip text/buttons output and
	// dispatch the theatrical transition. The specialist will deliver the next
	// user-visible message.
	if (isConcierge && routeIntent) {
		await transitionToSpecialist(from, conversationId, "concierge", routeIntent.category);
		return;
	}

	// 4.5. Guard: consolidate 2+ group_cards into a single comparison_table.
	// The prompt already forbids this, but if the agent slips up we merge to avoid card spam.
	const groupCards = artifacts.filter((a) => a.type === "group_card");
	if (groupCards.length >= 2) {
		const nonGroupCards = artifacts.filter((a) => a.type !== "group_card");
		const consolidated = {
			type: "comparison_table",
			payload: { groups: groupCards.map((a) => a.payload) },
		};
		artifacts.length = 0;
		artifacts.push(...nonGroupCards, consolidated);
		console.log(
			`[whatsapp-processor] Guard: consolidated ${groupCards.length} group_cards into comparison_table`,
		);
	}

	// 5. Save assistant response
	if (fullResponse) {
		await saveMessage(conversationId, "assistant", fullResponse);
	}

	// 6. Send text response(s) with human-like pacing between chunks
	let hasSent = false;
	if (fullResponse) {
		const formatted = formatTextForWhatsApp(fullResponse);
		const chunks = splitMessage(formatted);
		for (const chunk of chunks) {
			if (hasSent) await sleep(typingDelay(chunk.length));
			await sendTextMessage(from, chunk);
			hasSent = true;
		}
	}

	// 7. Send artifact interactive messages with a short pause between them
	for (const artifact of artifacts) {
		const waResponse = artifactToWhatsApp(artifact.type, artifact.payload);
		if (!waResponse) continue;

		if (hasSent) await sleep(ARTIFACT_PAUSE_MS);

		if (waResponse.type === "text" && waResponse.text) {
			await sendTextMessage(from, waResponse.text);
		} else if (waResponse.type === "interactive" && waResponse.interactive) {
			await sendInteractiveMessage(from, waResponse.interactive);
		}
		hasSent = true;

		// lead_form artifact is skipped on WhatsApp — handoff handles data collection
		// Handoff only triggers on explicit "Tenho interesse" button click (see processInteractiveReply)
	}

	// 8. Concierge anexa welcome buttons after the system reply.
	// Stays attached every turn while persona is still "concierge" — keeps the
	// user one tap away from triage even if they ignored the buttons before.
	// Skipped when routeIntent fired (handled above with early return).
	if (isConcierge) {
		if (hasSent) await sleep(ARTIFACT_PAUSE_MS);
		const buttons = welcomeButtonsToWhatsApp();
		if (buttons.interactive) {
			await sendInteractiveMessage(from, buttons.interactive);
		}
	}

	const expertiseTag = meta.expertiseLevel ? `, expertise=${meta.expertiseLevel}` : "";
	console.log(
		`[whatsapp-processor] Processed: ${from} | persona=${currentPersona}${expertiseTag} | ${artifacts.length} artifacts, ${fullResponse.length} chars`,
	);
}

/**
 * Process an interactive reply (button click, list selection).
 */
export async function processInteractiveReply(
	from: string,
	replyId: string,
	replyTitle: string,
	contactName?: string,
): Promise<void> {
	// Category triage (concierge's welcome buttons) → theatrical handoff to the
	// matching specialist (Helena / Rafael / Camila).
	if (replyId.startsWith("category_")) {
		const category = replyId.replace("category_", "") as SpecialistPersona;
		if ((ROUTABLE_CATEGORIES as readonly string[]).includes(category)) {
			const { id: conversationId } = await getOrCreateConversation(from);
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.id, conversationId),
			});
			const meta = (conv?.metadata ?? {}) as ConversationMetadata;
			const fromPersona: Persona = meta.currentPersona ?? "concierge";
			await transitionToSpecialist(from, conversationId, fromPersona, category);
			return;
		}
	}

	// Range/value picker selection → translate to natural search request
	if (replyId.startsWith("range_")) {
		const range = resolveRange(replyId);
		if (range) {
			const catLabel: Record<string, string> = {
				auto: "carro",
				imovel: "imóvel",
				servicos: "serviço",
			};
			const label = catLabel[range.category] ?? "consórcio";
			const budgetFmt = range.budget.toLocaleString("pt-BR");
			const minFmt = range.creditMin.toLocaleString("pt-BR");
			const maxFmt = range.creditMax.toLocaleString("pt-BR");
			const filtros =
				range.creditMin > 0
					? `creditMin=${range.creditMin}, creditMax=${range.creditMax}`
					: `creditMax=${range.creditMax}`;
			const nudge = `[sistema: usuario escolheu via slider a faixa de ${label} (${filtros}, orcamento mensal R$ ${budgetFmt}). FLUXO OBRIGATORIO: (1) chame search_groups com category="${range.category}" e os filtros (${filtros}); (2) se retornar 1 grupo, chame present_group_card; se retornar 2 ou mais, chame present_comparison_table com TODOS os grupos. NUNCA descreva os grupos em texto corrido — o componente visual e obrigatorio. Em texto, escreva UMA frase curta de orientacao apos os cards (ex: "Encontrei essas opcoes na sua faixa, qual quer simular?"). NAO narre passos antes das tools, NAO liste taxas/parcelas em prosa, NAO chame recommend_groups.]`;
			await processTextMessage(from, nudge, contactName);
			return;
		}
	}

	// Old picker_ buttons (legacy) → same treatment
	if (replyId.startsWith("picker_")) {
		// Extract value from title and forward as natural text
		await processTextMessage(from, `Meu orçamento é ${replyTitle}`, contactName);
		return;
	}

	// Group selection from comparison table list → simulate (with closure)
	if (replyId.startsWith("group_")) {
		const groupId = replyId.replace("group_", "");
		try {
			const details = await getAdapter().getGroupDetails({ groupId });
			await processTextMessage(
				from,
				`[sistema: usuario selecionou o grupo "${details.administradora}" (creditValue=${details.creditValue}, prazo=${details.termMonths}m). FLUXO: (1) chame simulate_quota com groupId="${groupId}" E creditValue=${details.creditValue}; (2) chame present_simulation_result com o retorno da tool. Em texto, NAO narre o que vai fazer (proibido "vou simular", "deixa eu calcular"). Apenas comente APOS o card aparecer, em UMA frase curta, o que chamou atencao (parcela, prazo ou taxa). NAO chame recommend_groups. NAO chame simulate_quota mais de uma vez. O card de simulacao tem botoes "Tenho interesse!" e "Ajustar valor", entao NAO peca pro usuario responder em texto, apenas direcione: "Toca em 'Tenho interesse' se fechar pra voce, ou 'Ajustar valor' se quiser mudar o credito."]`,
				contactName,
			);
		} catch (err) {
			console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
			await sendTextMessage(
				from,
				"Tive um problema ao localizar esse grupo. Pode tentar selecionar outra opcao ou me dizer um valor de credito que voce quer simular?",
			);
		}
		return;
	}

	// Simulate button on group card → run simulation (with closure)
	if (replyId.startsWith("simulate_")) {
		const groupId = replyId.replace("simulate_", "");
		try {
			const details = await getAdapter().getGroupDetails({ groupId });
			await processTextMessage(
				from,
				`[sistema: usuario quer simular o grupo "${details.administradora}" (creditValue=${details.creditValue}). FLUXO: (1) chame simulate_quota com groupId="${groupId}" E creditValue=${details.creditValue}; (2) chame present_simulation_result. NAO narre o que vai fazer. Comente APOS o card, em UMA frase. O card ja tem botoes "Tenho interesse!" e "Ajustar valor", direcione o usuario pra eles. NAO simule de novo o mesmo grupo.]`,
				contactName,
			);
		} catch (err) {
			console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
			await sendTextMessage(from, "Tive um problema ao localizar esse grupo. Pode tentar de novo?");
		}
		return;
	}

	// What-if button on simulation card → user wants to change the credit value
	if (replyId.startsWith("whatif_")) {
		const groupId = replyId.replace("whatif_", "");
		try {
			const details = await getAdapter().getGroupDetails({ groupId });
			await processTextMessage(
				from,
				`[sistema: o usuario quer ajustar o valor de credito do grupo "${details.administradora}" (creditValue atual=${details.creditValue}). Pergunte em UMA frase qual valor de credito ou parcela mensal ele quer simular agora. NAO simule ainda, espere a resposta dele com o novo valor.]`,
				contactName,
			);
		} catch (err) {
			console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
			await sendTextMessage(from, "Tive um problema ao localizar esse grupo. Pode tentar de novo?");
		}
		return;
	}

	// Detail button on group card → show full details
	if (replyId.startsWith("detail_")) {
		const groupId = replyId.replace("detail_", "");
		await processTextMessage(
			from,
			`[sistema: o usuario quer detalhes do grupo ${groupId}. Use get_group_details com esse groupId. NAO mencione IDs na resposta.]`,
			contactName,
		);
		return;
	}

	// "Tenho interesse!" button → ask for name, then handoff to all attendants
	if (replyId.startsWith("interest_")) {
		const agents = await getAttendantList();
		if (agents.length > 0) {
			const handoff = await getHandoffState(from);
			if (handoff?.conversationId && !handoff.isHandedOff) {
				await db
					.update(conversations)
					.set({
						metadata: { awaitingName: true },
						updatedAt: new Date(),
					})
					.where(eq(conversations.id, handoff.conversationId));

				await sendTextMessage(
					from,
					"Ótima escolha! 🎉 Pra te conectar com nosso consultor, me diz: *qual seu nome completo?*",
				);
				return;
			}
		}
	}

	// Route as text message to AI (or proxy if handed off)
	await processTextMessage(from, replyTitle, contactName);
}

function getWhatsAppConfig() {
	const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
	const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
	if (!accessToken || !phoneNumberId) {
		throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID required");
	}
	return { accessToken, phoneNumberId };
}

/**
 * Persist updated metadata for a conversation.
 * Centralized so classifier updates and persona transitions both go through
 * the same shape — keeps `updatedAt` consistent.
 */
async function persistMeta(conversationId: string, meta: ConversationMetadata): Promise<void> {
	await db
		.update(conversations)
		.set({ metadata: meta, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
}

/**
 * Send a raw WhatsApp interactive message (buttons / list / cta).
 * Helper used by both artifact rendering and persona orchestration.
 */
async function sendInteractiveMessage(to: string, interactive: Record<string, unknown>): Promise<void> {
	const { accessToken, phoneNumberId } = getWhatsAppConfig();
	const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
	await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			messaging_product: "whatsapp",
			to,
			type: "interactive",
			interactive,
		}),
	});
}

/**
 * Build a short conversation summary for the agent.
 */
function buildConversationSummary(
	history: Array<{ role: string; content: string }>,
	artifacts: Array<{ type: string; payload: Record<string, unknown> }>,
): string {
	const lines: string[] = [];

	// Last few messages for context
	const recent = history.slice(-6);
	for (const msg of recent) {
		const prefix = msg.role === "user" ? "👤" : "🤖";
		lines.push(`${prefix} ${msg.content.slice(0, 200)}`);
	}

	// Artifact summary
	for (const a of artifacts) {
		if (a.type === "recommendation_card") {
			const p = a.payload;
			lines.push(
				`\n📋 *Grupo recomendado:* ${p.administradora} — R$ ${(p.creditValue as number)?.toLocaleString("pt-BR")} — ${p.monthlyPayment}/mês — Score ${Math.round((p.score as number) * 100)}%`,
			);
		}
	}

	return lines.join("\n");
}
