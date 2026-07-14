import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { detectBackIntent, popNavState } from "@/lib/agent/orchestrator/navigation";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { withSimulatorClockIfNeeded } from "@/lib/utils/simulator-clock-wrap";
import { processWithOrchestrator } from "./adapter";
import { sendTextMessage, sendTypingIndicator } from "./api";
import { dispatchInteractiveReply } from "./interactive-handlers";
import { isMesaClaimReply } from "./mesa/claim";
import { handleMesaClaim, handleMesaCopilot, isMesaAttendantPhone } from "./mesa/routing";
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

		// Mesa de operação (FIX-66): número de um atendente de mesa cadastrado vai
		// pro COPILOTO, nunca pro agente de vendas (spec §8 — anti-colisão de
		// canal). Precedência sobre o atendente-de-chat (isAttendantPhone): o
		// roteamento por número é binário — é mesa → é copiloto, com ou sem
		// handoff aberto (handleMesaCopilot acolhe o caso sem handoff).
		if (await isMesaAttendantPhone(from)) {
			await handleMesaCopilot(from, text);
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

		if (await handlePendingHandoffText(from, text)) return;

		// Intent textual "voltar" — early-return sem chamar o agent (#06 Bruna v1 review).
		if (detectBackIntent(text)) {
			await handleBackIntent(from);
			return;
		}

		// Gate "identify" (D1): funil aguardando CPF → captura textual determinística
		// (valida DV, persiste cifrado, celular = waId) sem turno de agente.
		{
			const {
				captureIdentifyText,
				IDENTIFY_CONFIRMED_REPLY,
				IDENTIFY_CONTINUE_REPLY,
				IDENTIFY_INVALID_CPF_REPLY,
				IDENTIFY_WHATSAPP_PROMPT,
			} = await import("./identify-capture");
			const capture = await captureIdentifyText(from, text);
			if (capture.handled) {
				if (capture.outcome === "invalid") {
					await sendTextMessage(from, IDENTIFY_INVALID_CPF_REPLY);
					return;
				}
				// FIX-217: qualquer desvio (pergunta, tentativa de pular) reemite o
				// pedido do CPF — NUNCA passa pro pipeline geral do agente (Lei 4).
				if (capture.outcome === "ask-cpf") {
					await sendTextMessage(from, IDENTIFY_WHATSAPP_PROMPT);
					return;
				}
				const conv = await db.query.conversations.findFirst({
					where: eq(conversations.waId, from),
				});
				if (conv) {
					// FIX-53: identidade vem ANTES do valor. NÃO revela aqui — segue a
					// qualificação despachando o próximo gate (mesmo padrão do
					// handleHandoffDecline). Só revela se a qualificação já estava
					// completa (nextGate=search). O tripwire de identidade do reveal
					// agora sempre passa, pois a identidade já foi coletada cedo.
					const cMeta = metaOf(conv);
					const nextG = nextGate(cMeta);
					const { runSearchSummaryWithOrchestrator, fireGate } = await import("./adapter");
					if (nextG === "search") {
						await sendTextMessage(from, IDENTIFY_CONFIRMED_REPLY);
						await withSimulatorClockIfNeeded(conv, () =>
							runSearchSummaryWithOrchestrator({ from, conversationId: conv.id }),
						);
					} else {
						await sendTextMessage(from, IDENTIFY_CONTINUE_REPLY);
						await withSimulatorClockIfNeeded(conv, () => fireGate(from, conv.id, nextG, cMeta));
					}
				}
				return;
			}
		}

		// Passo 5 "Contratar" (FIX-25): fechamento ativo (contractCollection) →
		// captura conversacional do aceite/recusa/CPF sem turno de agente.
		{
			const {
				captureContractText,
				fireContract,
				CONTRACT_CPF_PROMPT,
				CONTRACT_INVALID_CPF_REPLY,
				CONTRACT_REPROMPT_CONFIRM,
				CONTRACT_CANCELLED_REPLY,
			} = await import("./contract-capture");
			const capture = await captureContractText(from, text);
			if (capture.handled) {
				const conv = await db.query.conversations.findFirst({
					where: eq(conversations.waId, from),
				});
				if (capture.outcome === "fire" && conv) {
					await withSimulatorClockIfNeeded(conv, () => fireContract(from, conv.id));
				} else if (capture.outcome === "cancel") {
					await sendTextMessage(from, CONTRACT_CANCELLED_REPLY);
					await processWithOrchestrator(from, "Quero ver outras opções", contactName);
				} else if (capture.outcome === "invalid-cpf") {
					await sendTextMessage(from, CONTRACT_INVALID_CPF_REPLY);
				} else if (capture.outcome === "ask-cpf") {
					await sendTextMessage(from, CONTRACT_CPF_PROMPT);
				} else if (capture.outcome === "ask-confirm") {
					await sendTextMessage(from, CONTRACT_REPROMPT_CONFIRM);
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
	// Mesa de operação (FIX-124): número de um atendente de mesa clicando um botão vai
	// pra MESA, nunca pro funil de cliente — espelha a precedência do caminho de texto
	// (isMesaAttendantPhone → handleMesaCopilot). O clique "Vou atender"
	// (mesa_claim:<handoffId>) dispara o claim atômico; qualquer outro clique cai no
	// copiloto (acolhe com/sem handoff). Sem isso, o clique de um atendente seria tratado
	// como cliente pelo dispatchInteractiveReply (gap latente).
	if (await isMesaAttendantPhone(from)) {
		if (isMesaClaimReply(replyId)) {
			await handleMesaClaim(from, replyId);
		} else {
			await handleMesaCopilot(from, replyTitle);
		}
		return;
	}

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
