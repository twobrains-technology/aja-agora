import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, remarketingTouches } from "@/db/schema";
import { detectBackIntent, popNavState } from "@/lib/agent/orchestrator/navigation";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { withSimulatorClockIfNeeded } from "@/lib/utils/simulator-clock-wrap";
import { processWithOrchestrator } from "./adapter";
import { sendTextMessage, sendTypingIndicator } from "./api";
import { withConversationLock } from "./conversation-lock";
import { dispatchInteractiveReply } from "./interactive-handlers";
import { isMesaClaimReply } from "./mesa/claim";
import { handleMesaClaim, handleMesaCopilot, isMesaAttendantPhone } from "./mesa/routing";
import { chaveTelefoneBR } from "./mesmo-numero";
import { claimButtonClick } from "./once";
import {
	getHandoffState,
	handleAgentMessage,
	handlePendingHandoffText,
	isAttendantPhone,
	relayUserToAgent,
} from "./proxy";
import { saveMessage } from "./session";
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

/**
 * O cliente pediu para sair do REMARKETING? Se sim, marca e responde; se não,
 * não faz nada (o fluxo normal segue).
 *
 * O `ehPedidoDeOptout` é conservador de propósito (ver `remarketing/motor.ts`):
 * só formulações explícitas de "pare de me mandar" marcam. O que grava é o
 * FATO em `contacts.remarketing_optout_at` — a régua inteira se apoia nele.
 *
 * Marca TODOS os contatos que resolvem para o mesmo telefone (o número é
 * gravado em formatos diferentes entre canais — ver `mesmo-numero.ts`) e todas
 * as linhas da régua desses contatos, para o worker não ter que descobrir
 * depois.
 */
async function tratarOptoutDeRemarketing(from: string, text: string): Promise<boolean> {
	const { ehPedidoDeOptout } = await import("@/lib/remarketing/motor");
	if (!ehPedidoDeOptout(text)) return false;

	try {
		const agora = new Date();
		const chave = chaveTelefoneBR(from);

		const todos = await db.select({ id: contacts.id, phone: contacts.phone }).from(contacts);
		const alvos = todos
			.filter((c) => (chave ? chaveTelefoneBR(c.phone) === chave : false))
			.map((c) => c.id);

		// Fallback: a conversa daquele wa_id já sabe o contato (quando a tabela de
		// contatos ainda não tem o telefone no formato comparável).
		if (alvos.length === 0) {
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.waId, from),
			});
			if (conv?.contactId) alvos.push(conv.contactId);
		}

		if (alvos.length > 0) {
			await db
				.update(contacts)
				.set({ remarketingOptoutAt: agora })
				.where(inArray(contacts.id, alvos));
			await db
				.update(remarketingTouches)
				.set({ status: "OPTOUT", motivoSaida: "optout_do_cliente", nextTouchAt: null })
				.where(inArray(remarketingTouches.contactId, alvos));
		}

		console.log(`[whatsapp-processor] Opt-out de remarketing registrado (phone: ${from})`);
	} catch (err) {
		console.error("[whatsapp-processor] Falha ao registrar opt-out:", err);
	}

	await sendTextMessage(
		from,
		"Entendido! Não vou mais te enviar mensagens de acompanhamento. Se quiser falar com a gente, é só chamar por aqui.",
	);
	return true;
}

/**
 * Ponto de entrada do texto inbound. SERIALIZADO por conversa: duas mensagens
 * seguidas do mesmo contato (padrão no WhatsApp — "quero um carro" / "uns 90
 * mil") rodavam dois turnos em paralelo sobre o mesmo metadata, e o segundo
 * apagava o que o primeiro escreveu (`persistMeta` é read-modify-write do
 * objeto inteiro). O lease é reentrante: o caminho clique → texto não trava.
 * Ver src/lib/whatsapp/conversation-lock.ts.
 */
export async function processTextMessage(
	from: string,
	text: string,
	contactName?: string,
	messageId?: string,
): Promise<void> {
	return withConversationLock(from, () =>
		processTextMessageSerialized(from, text, contactName, messageId),
	);
}

async function processTextMessageSerialized(
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

		// OPT-OUT DO REMARKETING — o cliente pediu para sair, e o pedido é por
		// PESSOA (telefone), não por conversa: vale para a régua inteira, para
		// sempre, e sobrevive a uma nova simulação. Marcado aqui, no ponto único
		// por onde toda mensagem de entrada passa, porque a régua roda no worker e
		// não vê o que o cliente escreve.
		if (await tratarOptoutDeRemarketing(from, text)) return;

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
			} = await import("./identify-capture");
			const capture = await captureIdentifyText(from, text);
			if (capture.handled) {
				if (capture.outcome === "invalid") {
					await sendTextMessage(from, IDENTIFY_INVALID_CPF_REPLY);
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
				CONTRACT_INVALID_CPF_REPLY,
				CONTRACT_CANCELLED_REPLY,
			} = await import("./contract-capture");
			const capture = await captureContractText(from, text);
			if (capture.handled) {
				const conv = await db.query.conversations.findFirst({
					where: eq(conversations.waId, from),
				});
				// A fala do cliente SEMPRE fica registrada, inclusive quando o turno é
				// resolvido deterministicamente aqui e nunca chega ao modelo. Sem isto
				// o "confirmado, pode seguir" evaporava: a conversa mostrava a pergunta
				// "confirma essa carta?" seguida direto do fechamento, como se ninguém
				// tivesse consentido — péssimo pro atendente que lê depois, e pior
				// ainda como registro do aceite.
				if (conv) await saveMessage(conv.id, "user", text);
				if (capture.outcome === "fire" && conv) {
					await withSimulatorClockIfNeeded(conv, () => fireContract(from, conv.id));
				} else if (capture.outcome === "finalize" && conv) {
					// O cliente aceitou a carta REAL por texto — mesmo terminal do botão
					// (confirmOffer → contractClosed → Parabéns → proposta em PDF).
					const { finalizarOfertaReal } = await import("./interactive-handlers");
					await withSimulatorClockIfNeeded(conv, () => finalizarOfertaReal(from, conv.id));
				} else if (capture.outcome === "cancel") {
					await sendTextMessage(from, CONTRACT_CANCELLED_REPLY);
					await processWithOrchestrator(from, "Quero ver outras opções", contactName);
				} else if (capture.outcome === "invalid-cpf") {
					await sendTextMessage(from, CONTRACT_INVALID_CPF_REPLY);
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

/** Ponto de entrada do clique inbound — mesma serialização por conversa do
 * caminho de texto (o clique também roda um turno inteiro e escreve metadata). */
export async function processInteractiveReply(
	from: string,
	replyId: string,
	replyTitle: string,
	contactName?: string,
	messageId?: string,
): Promise<void> {
	return withConversationLock(from, () =>
		processInteractiveReplySerialized(from, replyId, replyTitle, contactName, messageId),
	);
}

async function processInteractiveReplySerialized(
	from: string,
	replyId: string,
	replyTitle: string,
	contactName?: string,
	messageId?: string,
): Promise<void> {
	// Guard de clique duplo (paridade com o FIX-272 do web, que só existia lá).
	// Botão do WhatsApp NÃO desabilita depois do clique e o adapter dorme ~1,8s
	// entre balões — o cliente clica "Sim, considerar", não vê nada acontecer e
	// clica de novo. Sem isto o gate seguinte disparava DUAS vezes (dois cards
	// colados) ou o segundo caía num gate que já avançou e fechava o turno mudo.
	// Idempotência por ESTADO (o mesmo botão, na mesma conversa, numa janela de
	// segundos), uma vez só — não um `if` copiado em cada um dos 12 handlers.
	if (!(await claimButtonClick(from, replyId))) {
		console.log(`[whatsapp-processor] Clique duplo ignorado: ${replyId} de ${from}`);
		return;
	}

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
