/**
 * WhatsApp message processor.
 * Routes incoming WhatsApp messages through the AI pipeline or
 * the bidirectional proxy (when conversation is handed off to agent).
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs, streamText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { WHATSAPP_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { consorcioTools, PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { sendTextMessage } from "./api";
import { artifactToWhatsApp, formatTextForWhatsApp, resolveRange, splitMessage } from "./formatter";
import {
	getAttendantList,
	getHandoffState,
	handleAgentMessage,
	handoffToAgents,
	isAttendantPhone,
	relayUserToAgent,
} from "./proxy";
import { getOrCreateConversation, loadConversationHistory, saveMessage } from "./session";

const anthropic = createAnthropic();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// "Typing" delay curve: 200ms floor, 6ms per char, capped at 1.5s.
// Short chunk (~50 chars) pauses ~500ms; long chunk (~300 chars) pauses 2s (capped at 1.5s).
const typingDelay = (chars: number) => Math.min(1500, 200 + chars * 6);
// Fixed pause between messages where length doesn't apply (e.g. before an interactive card).
const ARTIFACT_PAUSE_MS = 500;

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

	// 2. Save user message
	await saveMessage(conversationId, "user", text);

	// 3. Load conversation history
	const history = await loadConversationHistory(conversationId);

	// 4. Run AI pipeline
	let fullResponse = "";
	const artifacts: Array<{ type: string; payload: Record<string, unknown> }> = [];

	const result = streamText({
		model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-20250514"),
		system: WHATSAPP_SYSTEM_PROMPT,
		messages: history,
		tools: consorcioTools,
		stopWhen: stepCountIs(10),
	});

	for await (const part of result.fullStream) {
		switch (part.type) {
			case "text-delta":
				fullResponse += part.text;
				break;
			case "tool-call": {
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
					to: from,
					type: "interactive",
					interactive: waResponse.interactive,
				}),
			});
		}
		hasSent = true;

		// lead_form artifact is skipped on WhatsApp — handoff handles data collection
		// Handoff only triggers on explicit "Tenho interesse" button click (see processInteractiveReply)
	}

	console.log(
		`[whatsapp-processor] Processed: ${from} | ${artifacts.length} artifacts, ${fullResponse.length} chars`,
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
	// Range/value picker selection → translate to natural search request
	// (legacy — value_picker is no longer emitted by the agent, kept for safety)
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
			const prompt =
				range.creditMin > 0
					? `Quero um ${label} entre R$ ${minFmt} e R$ ${maxFmt} com orçamento mensal de R$ ${budgetFmt}. Busque apenas grupos com creditValue dentro dessa faixa (creditMin=${range.creditMin}, creditMax=${range.creditMax}).`
					: `Quero um ${label} de até R$ ${maxFmt} com orçamento mensal de R$ ${budgetFmt}. Busque com creditMax=${range.creditMax}.`;
			await processTextMessage(from, prompt, contactName);
			return;
		}
	}

	// Old picker_ buttons (legacy) → same treatment
	if (replyId.startsWith("picker_")) {
		// Extract value from title and forward as natural text
		await processTextMessage(from, `Meu orçamento é ${replyTitle}`, contactName);
		return;
	}

	// Group selection from comparison table list → simulate + recommend
	if (replyId.startsWith("group_")) {
		const groupId = replyId.replace("group_", "");
		await processTextMessage(
			from,
			`[sistema: o usuario selecionou ESPECIFICAMENTE o grupo ${groupId} da lista. FLUXO OBRIGATORIO: (1) chame simulate_quota com groupId="${groupId}" para pegar os numeros; (2) chame get_group_details com groupId="${groupId}" para pegar contemplationRate; (3) chame present_recommendation_card passando EXATAMENTE os dados desse grupo ${groupId} (administradora, creditValue, monthlyPayment, adminFeePercent, termMonths, contemplationRate e o score/scoreBreakdown calculados desse mesmo grupo). NAO chame recommend_groups — o usuario JA escolheu. NAO troque o grupo por outro do ranking. NAO mencione IDs ou termos tecnicos na resposta textual.]`,
			contactName,
		);
		return;
	}

	// Simulate button on group card → run simulation
	if (replyId.startsWith("simulate_")) {
		const groupId = replyId.replace("simulate_", "");
		await processTextMessage(
			from,
			`[sistema: o usuario quer simular o grupo ${groupId}. Use simulate_quota com esse groupId e present_simulation_result. NAO mencione IDs na resposta.]`,
			contactName,
		);
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
