/**
 * WhatsApp message processor.
 * Routes incoming WhatsApp messages through the AI pipeline or
 * the bidirectional proxy (when conversation is handed off to agent).
 */
import { streamText, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { consorcioTools, PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { WHATSAPP_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { getOrCreateConversation, loadConversationHistory, saveMessage } from "./session";
import { sendTextMessage, sendReplyButtons } from "./api";
import {
	formatTextForWhatsApp,
	splitMessage,
	artifactToWhatsApp,
	resolveRange,
} from "./formatter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
	getHandoffState,
	relayUserToAgent,
	relayAgentToUser,
	handoffToAgent,
} from "./proxy";

const anthropic = createAnthropic();

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

		// If sender is an agent, only relay — never treat as buyer
		const agentPhone = process.env.WHATSAPP_AGENT_PHONE;
		if (agentPhone && from === agentPhone) {
			const relayed = await relayAgentToUser(from, text);
			if (!relayed) {
				await sendTextMessage(from, "⏳ Nenhuma conversa ativa no momento. Quando um cliente demonstrar interesse, você receberá o resumo aqui.");
			}
			return;
		}

		// Check if this sender is an agent replying to a handed-off conversation
		const agentRelayed = await relayAgentToUser(from, text);
		if (agentRelayed) return;

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
				// User just sent their name — do the handoff
				const agentPhone = process.env.WHATSAPP_AGENT_PHONE;
				if (agentPhone) {
					// Clear the awaiting flag
					await db.update(conversations).set({
						metadata: { ...meta, awaitingName: false },
						contactName: text,
						updatedAt: new Date(),
					}).where(eq(conversations.id, handoff.conversationId));

					const history = await loadConversationHistory(handoff.conversationId);
					const summary = buildConversationSummary(history, []);
					await handoffToAgent(
						handoff.conversationId,
						from,
						text, // user's name
						agentPhone,
						summary,
					);
					return;
				}
			}
		}

		// Normal AI processing
		await processWithAI(from, text, contactName);
	} catch (err) {
		console.error(`[whatsapp-processor] Error processing message from ${from}:`, err);
		try {
			await sendTextMessage(from, "Desculpe, tive um problema processando sua mensagem. Pode tentar novamente?");
		} catch {
			// Silent
		}
	}
}

/**
 * Process a message through the AI pipeline.
 */
async function processWithAI(
	from: string,
	text: string,
	contactName?: string,
): Promise<void> {
	// 1. Get or create conversation
	const { id: conversationId, isNew } = await getOrCreateConversation(from);

	// 2. Save user message
	await saveMessage(conversationId, "user", text);

	// 2.5. First message → send welcome + category buttons
	// Only if user didn't already specify a category
	const mentionsCategory = /im[oó]vel|casa|apartamento|carro|auto|ve[ií]culo|servi[cç]o|reforma|viagem/i.test(text);
	if (isNew && !mentionsCategory) {
		await sendTextMessage(from, "Olá! 👋 Eu sou o consultor do *Aja Agora*. Vou te ajudar a encontrar o consórcio perfeito!");
		await sendReplyButtons(from, "O que você está buscando?", [
			{ id: "cat_imovel", title: "🏠 Imóvel" },
			{ id: "cat_auto", title: "🚗 Carro" },
			{ id: "cat_servicos", title: "💼 Serviços" },
		]);
		return;
	}

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

	// 5. Save assistant response
	if (fullResponse) {
		await saveMessage(conversationId, "assistant", fullResponse);
	}

	// 6. Send text response(s)
	if (fullResponse) {
		const formatted = formatTextForWhatsApp(fullResponse);
		const chunks = splitMessage(formatted);
		for (const chunk of chunks) {
			await sendTextMessage(from, chunk);
		}
	}

	// 7. Send artifact interactive messages
	for (const artifact of artifacts) {
		const waResponse = artifactToWhatsApp(artifact.type, artifact.payload);
		if (!waResponse) continue;

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

		// lead_form artifact is skipped on WhatsApp — handoff handles data collection
		// Handoff only triggers on explicit "Tenho interesse" button click (see processInteractiveReply)
	}

	console.log(
		`[whatsapp-processor] Processed: ${from} | ${artifacts.length} artifacts, ${fullResponse.length} chars`,
	);

	// Auto-follow-up: if simulation was shown but no recommendation, force it
	const hasSimulation = artifacts.some((a) => a.type === "simulation_result");
	const hasRecommendation = artifacts.some((a) => a.type === "recommendation_card");
	if (hasSimulation && !hasRecommendation) {
		console.log(`[whatsapp-processor] Auto-triggering recommendation after simulation`);
		// Reload history (now includes the simulation response)
		const updatedHistory = await loadConversationHistory(conversationId);
		let recResponse = "";
		const recArtifacts: Array<{ type: string; payload: Record<string, unknown> }> = [];

		const recResult = streamText({
			model: anthropic(process.env.AI_MODEL ?? "claude-sonnet-4-20250514"),
			system: WHATSAPP_SYSTEM_PROMPT,
			messages: [
				...updatedHistory,
				{
					role: "user" as const,
					content: "Agora me mostra a recomendação final com o card de compatibilidade e o botão para eu fechar.",
				},
			],
			tools: consorcioTools,
			stopWhen: stepCountIs(5),
		});

		for await (const part of recResult.fullStream) {
			if (part.type === "text-delta") {
				recResponse += part.text;
			} else if (part.type === "tool-call") {
				const shortName = part.toolName.replace("present_", "");
				if (PRESENTATION_TOOLS.has(part.toolName)) {
					recArtifacts.push({ type: shortName, payload: part.input as Record<string, unknown> });
				}
			}
		}

		if (recResponse) {
			await saveMessage(conversationId, "assistant", recResponse);
			const formatted = formatTextForWhatsApp(recResponse);
			for (const chunk of splitMessage(formatted)) {
				await sendTextMessage(from, chunk);
			}
		}

		for (const artifact of recArtifacts) {
			const waResponse = artifactToWhatsApp(artifact.type, artifact.payload);
			if (!waResponse) continue;
			if (waResponse.type === "text" && waResponse.text) {
				await sendTextMessage(from, waResponse.text);
			} else if (waResponse.type === "interactive" && waResponse.interactive) {
				const { accessToken, phoneNumberId } = getWhatsAppConfig();
				await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
					method: "POST",
					headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
					body: JSON.stringify({ messaging_product: "whatsapp", to: from, type: "interactive", interactive: waResponse.interactive }),
				});
			}
		}

		console.log(`[whatsapp-processor] Auto-recommendation: ${recArtifacts.length} artifacts, ${recResponse.length} chars`);
	}
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
	// Category buttons → translate to natural text for the AI
	const categoryMap: Record<string, string> = {
		cat_imovel: "Quero comprar um imóvel, me ajude a encontrar o melhor consórcio",
		cat_auto: "Quero comprar um carro, qual o melhor consórcio para mim?",
		cat_servicos: "Quero fazer um consórcio de serviços, o que vocês têm disponível?",
	};
	if (categoryMap[replyId]) {
		await processTextMessage(from, categoryMap[replyId], contactName);
		return;
	}

	// Range/value picker selection → translate to natural search request
	if (replyId.startsWith("range_")) {
		const range = resolveRange(replyId);
		if (range) {
			const catLabel: Record<string, string> = { auto: "carro", imovel: "imóvel", servicos: "serviço" };
			const prompt = `Quero um ${catLabel[range.category] ?? "consórcio"} de até R$ ${range.credit.toLocaleString("pt-BR")} com orçamento mensal de R$ ${range.budget.toLocaleString("pt-BR")}. Busque as melhores opções.`;
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

	// "Tenho interesse!" button → ask for name, then handoff
	if (replyId.startsWith("interest_")) {
		const agentPhone = process.env.WHATSAPP_AGENT_PHONE;
		if (agentPhone) {
			const handoff = await getHandoffState(from);
			if (handoff?.conversationId && !handoff.isHandedOff) {
				// Set awaiting_name flag and ask for name
				await db.update(conversations).set({
					metadata: { awaitingName: true },
					updatedAt: new Date(),
				}).where(eq(conversations.id, handoff.conversationId));

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
