import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { detectBackIntent, popNavState } from "@/lib/agent/orchestrator/navigation";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { withSimulatorClockIfNeeded } from "@/lib/utils/simulator-clock-wrap";
import { processWithOrchestrator } from "./adapter";
import { sendTextMessage, sendTypingIndicator } from "./api";
import { dispatchInteractiveReply } from "./interactive-handlers";
import {
	getHandoffState,
	handleAgentMessage,
	handlePendingHandoffText,
	isAttendantPhone,
	relayUserToAgent,
} from "./proxy";
import { isSimulatedWaId, publishToClient } from "./simulator-bus";

async function handleBackIntent(from: string): Promise<void> {
	const conv = await db.query.conversations.findFirst({ where: eq(conversations.waId, from) });
	const meta: ConversationMetadata = conv ? metaOf(conv) : ({} as ConversationMetadata);
	const { stack: nextStack, popped } = popNavState(meta.navigationStack ?? []);
	if (conv && popped) {
		await persistMeta(conv.id, {
			...meta,
			navigationStack: nextStack,
			currentPersona: popped.persona,
			currentCategory: popped.category ?? undefined,
			expertiseLevel: popped.expertiseLevel,
			experiencePrev: popped.experiencePrev ?? undefined,
			qualifyAnswers: popped.qualifyAnswers,
		});
	}
	await sendTextMessage(from, popped ? "Voltando ao passo anterior." : "Você já está no início.");
}

export async function processTextMessage(
	from: string,
	text: string,
	contactName?: string,
	messageId?: string,
): Promise<void> {
	try {
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

		const handoff = await getHandoffState(from);
		if (handoff?.isHandedOff) {
			// Relay to human — don't fake AI typing.
			await relayUserToAgent(from, text);
			return;
		}

		if (await handlePendingHandoffText(from, text, contactName)) return;

		// Intent textual "voltar" — early-return sem chamar o agent (#06 Bruna v1 review).
		if (detectBackIntent(text)) {
			await handleBackIntent(from);
			return;
		}

		// Gate "identify" (D1): funil aguardando CPF → captura textual determinística
		// (valida DV, persiste cifrado, celular = waId) sem turno de agente.
		{
			const { captureIdentifyText, IDENTIFY_CONFIRMED_REPLY, IDENTIFY_INVALID_CPF_REPLY } =
				await import("./identify-capture");
			const capture = await captureIdentifyText(from, text);
			if (capture.handled) {
				if (capture.outcome === "invalid") {
					await sendTextMessage(from, IDENTIFY_INVALID_CPF_REPLY);
					return;
				}
				await sendTextMessage(from, IDENTIFY_CONFIRMED_REPLY);
				const conv = await db.query.conversations.findFirst({
					where: eq(conversations.waId, from),
				});
				if (conv) {
					const { runSearchSummaryWithOrchestrator } = await import("./adapter");
					await withSimulatorClockIfNeeded(conv, () =>
						runSearchSummaryWithOrchestrator({ from, conversationId: conv.id }),
					);
				}
				return;
			}
		}

		// Typing indicator: Meta API real precisa de messageId; simulador precisa
		// que o painel mostre as bolinhas, sem messageId Meta — publica no bus direto.
		if (isSimulatedWaId(from)) {
			publishToClient(from, { type: "typing", on: true });
		} else if (messageId) {
			sendTypingIndicator(messageId).catch(() => {});
		}
		// Simulator: se conv é simulada (waId começa com SIM-), wrap em
		// runWithSimulatorClock pra que `simulatorNow()` aplique o offset.
		const conv = isSimulatedWaId(from)
			? await db.query.conversations.findFirst({ where: eq(conversations.waId, from) })
			: null;
		await withSimulatorClockIfNeeded(conv ?? null, () =>
			processWithOrchestrator(from, text, contactName),
		);
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

export async function processInteractiveReply(
	from: string,
	replyId: string,
	replyTitle: string,
	contactName?: string,
	messageId?: string,
): Promise<void> {
	// Most interactive paths trigger an AI directive (gates, transitions, group
	// selection). Fire the typing indicator up front; brief flash on the few
	// non-AI paths (e.g. handoff_decline) is acceptable.
	if (isSimulatedWaId(from)) {
		publishToClient(from, { type: "typing", on: true });
	} else if (messageId) {
		sendTypingIndicator(messageId).catch(() => {});
	}
	const conv = isSimulatedWaId(from)
		? await db.query.conversations.findFirst({ where: eq(conversations.waId, from) })
		: null;
	const handled = await withSimulatorClockIfNeeded(conv ?? null, () =>
		dispatchInteractiveReply({
			from,
			replyId,
			replyTitle,
			contactName,
			processTextMessage,
		}),
	);
	if (!handled) {
		await processTextMessage(from, replyTitle, contactName, messageId);
	}
}
