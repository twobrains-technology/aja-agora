import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getAdapter } from "@/lib/adapters";
import { resolveAgent } from "@/lib/agent/agents";
import type {
	ConversationMetadata,
	ExperiencePrev,
	Persona,
	SpecialistPersona,
} from "@/lib/agent/personas";
import { PERSONA_CONFIG, ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import { type Gate, nextGate } from "@/lib/agent/qualify-state";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { analyzeTurn } from "@/lib/agent/turn-analyzer";
import { sendTextMessage } from "./api";
import {
	artifactToWhatsApp,
	creditRangeQuestionToWhatsApp,
	experienceQuestionToWhatsApp,
	formatTextForWhatsApp,
	lanceQuestionToWhatsApp,
	profileSummaryText,
	qualifyConsentToWhatsApp,
	resolveCreditReply,
	resolveLanceReply,
	resolveRange,
	resolveTimeframeReply,
	splitMessage,
	timeframeQuestionToWhatsApp,
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
// 200ms floor + 6ms per char, capped at 1.5s.
const typingDelay = (chars: number) => Math.min(1500, 200 + chars * 6);
const ARTIFACT_PAUSE_MS = 500;
const TRANSITION_DELAY_MS = 2000;

async function transitionToSpecialist(
	from: string,
	conversationId: string,
	fromPersona: Persona,
	toPersona: SpecialistPersona,
): Promise<void> {
	const config = PERSONA_CONFIG[toPersona];
	const fromConcierge = fromPersona === "concierge";

	const transitionText = transitionMessageText(
		{ name: config.name, emoji: config.emoji, categoryLabel: config.categoryLabel },
		fromConcierge,
	);
	await sendTextMessage(from, transitionText);
	await sleep(TRANSITION_DELAY_MS);

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = (conv?.metadata ?? {}) as ConversationMetadata;
	const seenSet = new Set<SpecialistPersona>(meta.personasSeen ?? []);
	const isReturning = seenSet.has(toPersona);
	seenSet.add(toPersona);

	// Specialist↔specialist switch resets answers (faixa/prazo vary by category);
	// concierge→specialist preserves them so upfront-extracted values survive.
	const updated: ConversationMetadata = {
		...meta,
		previousPersona: fromPersona,
		currentPersona: toPersona,
		personasSeen: Array.from(seenSet),
		qualifyAnswers: fromConcierge ? meta.qualifyAnswers : undefined,
	};
	await persistMeta(conversationId, updated);

	const offerCalibration = fromConcierge && !isReturning;

	// First arrival from concierge: skip the AI intro turn and bundle the
	// specialist's deterministic intro into the next gate's body.
	if (offerCalibration) {
		const firstName = conv?.contactName?.trim().split(/\s+/)[0] ?? null;
		const opener = firstName
			? `${config.openingReaction}, ${firstName}!`
			: `${config.openingReaction}!`;
		const intro = `${opener} ${config.categoryGreeting}.\n\nSou ${config.pronounArticle} *${config.name}*, especialista em consórcio ${config.specialtyLabel} aqui na *AJA AGORA*.`;

		// If the user already revealed enough upfront (e.g. typed everything to
		// Sofia), skip the experience question and jump straight to whichever
		// gate is actually missing.
		if (updated.experiencePrev) {
			const gate = nextGate(updated);
			if (gate === "search") {
				await sendTextMessage(from, intro);
				await sleep(typingDelay(intro.length));
				await fireSummaryAndSearch(from, conversationId, updated);
			} else if (gate !== "doubts-wait") {
				await fireGate(from, gate, updated, intro);
			} else {
				await sendTextMessage(from, intro);
			}
			return;
		}

		const r = experienceQuestionToWhatsApp(intro);
		if (r.interactive) await sendInteractiveMessage(from, r.interactive);
		return;
	}

	const directive = isReturning
		? `Voce esta RETOMANDO uma conversa que ja teve antes nesta sessao. NAO se apresente de novo. NAO solte opening hook. Responda direto a ultima pergunta do usuario, com tom natural de quem esta voltando ao assunto. Pode comecar com "Vamos la,", "Beleza,", ou ja com o conteudo direto.`
		: `PRIMEIRA aparicao sua, mas o usuario ja conversou com outro especialista do time antes (sobre outra categoria). NAO se apresente, JAMAIS comece com seu nome ou cargo. Comece DIRETO com a resposta a ultima pergunta do usuario, ou com uma reacao curta tipo "Beleza,", "Vamos la,", "Show,". Se o usuario perguntar quem e voce depois, ai sim diga seu nome. Nao mencione o nome do especialista anterior.`;

	await runAgentDirective(from, conversationId, directive);
}

async function reloadMeta(conversationId: string): Promise<ConversationMetadata> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	return (conv?.metadata ?? {}) as ConversationMetadata;
}

const INTEREST_RE =
	/^\s*(tenho\s+interesse|tô\s+interessad[oa]|estou\s+interessad[oa]|quero\s+(?:esse|este|essa|esta|fechar|isso|essa\s+opcao)|me\s+interessa|fechar|bora\s+fechar|vamos\s+fechar|topo|topei|fechado)\s*[!.?]*\s*$/i;

function isInterestExpression(text: string): boolean {
	return INTEREST_RE.test(text);
}

/**
 * Trigger the handoff flow when user expresses interest (button or text).
 * Skips the name question if we already have it from the WhatsApp profile.
 * Returns true if the flow was started.
 */
async function startInterestHandoff(
	from: string,
	conversationId: string,
	storedName: string | null,
): Promise<boolean> {
	const handoff = await getHandoffState(from);
	if (!handoff?.conversationId || handoff.isHandedOff) return false;

	// handoffToAgents marks the conversation as handed_off and sends a
	// user-facing message — handles both the with-attendants and zero-
	// attendants cases. We MUST go through it (not bail to AI) so the
	// conversation enters the proxy state and stops reaching the AI.
	if (storedName && storedName.trim().length > 0) {
		const history = await loadConversationHistory(conversationId);
		const summary = buildConversationSummary(history, []);
		await handoffToAgents(conversationId, from, storedName, summary);
		return true;
	}

	const meta = await reloadMeta(conversationId);
	await persistMeta(conversationId, { ...meta, awaitingName: true });
	await sendTextMessage(
		from,
		"Ótima escolha! 🎉 Pra te conectar com nosso consultor, me diz: *qual seu nome completo?*",
	);
	return true;
}

async function fireGate(
	from: string,
	gate: Gate,
	meta: ConversationMetadata,
	prefix?: string,
): Promise<void> {
	switch (gate) {
		case "experience": {
			const r = experienceQuestionToWhatsApp(prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "consent": {
			const r = qualifyConsentToWhatsApp(prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "credit": {
			const persona = meta.currentPersona;
			if (!persona || persona === "concierge") return;
			const r = creditRangeQuestionToWhatsApp(persona, prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "timeframe": {
			const persona = meta.currentPersona;
			if (!persona || persona === "concierge") return;
			const r = timeframeQuestionToWhatsApp(persona, prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "lance": {
			const r = lanceQuestionToWhatsApp(prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "doubts-wait":
		case "search":
			return;
	}
}

async function fireSummaryAndSearch(
	from: string,
	conversationId: string,
	meta: ConversationMetadata,
): Promise<void> {
	if (meta.searchDispatched) return;
	const persona = meta.currentPersona;
	if (!persona || persona === "concierge") return;
	const q = meta.qualifyAnswers ?? {};

	// Set BEFORE the work so concurrent re-entry sees the flag and bails out.
	await persistMeta(conversationId, { ...meta, searchDispatched: true });

	const summary = profileSummaryText(q);
	await sendTextMessage(from, summary);
	await saveMessage(conversationId, "assistant", summary);
	await sleep(typingDelay(summary.length));

	const filterParts: string[] = [];
	if (q.creditMin !== undefined && q.creditMin > 0) {
		filterParts.push(`creditMin=${q.creditMin}`);
	}
	if (q.creditMax !== undefined) {
		filterParts.push(`creditMax=${q.creditMax}`);
	}
	const filters = filterParts.length > 0 ? `, ${filterParts.join(", ")}` : "";

	const directive = `Usuario completou as 4 perguntas de qualificacao (experiencia=${meta.experiencePrev}, faixa=${q.creditMin ?? 0}-${q.creditMax ?? "?"}, prazo=${q.prazoMeses ?? "?"} meses, lance=${q.hasLance}). O sistema JA mandou o resumo do perfil pro usuario com a frase "Vou puxar as melhores opcoes pra voce" — NAO repita esse texto, NAO escreva texto introdutorio. FLUXO OBRIGATORIO: (1) chame search_groups com category="${persona}"${filters}; (2) chame present_comparison_table (ou present_group_card se vier 1 so). Apos os cards aparecerem, escreva UMA frase curta orientando ("qual quer simular?" ou similar). NAO narre passos antes das tools, NAO chame recommend_groups.`;
	await runAgentDirective(from, conversationId, directive);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Run the agent and render its response (text + artifacts) to WhatsApp,
 * then progress the qualify state machine to the next gate. Shared by the
 * user-text path (processWithAI) and the system-directive path (runAgentDirective).
 *
 * `isUserTurn=true` clears doubtsAddressed/pendingFollowUp when the AI replies.
 * `isUserTurn=false` (button-driven directive) leaves those flags as-is.
 */
async function executeAgentTurn(args: {
	from: string;
	conversationId: string;
	currentPersona: Persona;
	meta: ConversationMetadata;
	messages: ChatMessage[];
	isUserTurn: boolean;
}): Promise<void> {
	const { from, conversationId, currentPersona, meta, messages, isUserTurn } = args;

	let fullResponse = "";
	const artifacts: Array<{ type: string; payload: Record<string, unknown> }> = [];

	const isConcierge = currentPersona === "concierge";
	const agent = resolveAgent(currentPersona, meta);
	const result = await agent.stream({ messages });

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

	try {
		const pmeta = await result.providerMetadata;
		const anthropicMeta = pmeta?.anthropic as
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
		// providerMetadata is best-effort.
	}

	// Guard against agent slipping and emitting multiple group_cards.
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

	if (fullResponse) {
		await saveMessage(conversationId, "assistant", fullResponse);
	}

	const producedArtifact = artifacts.length > 0;
	let nextGateToFire: Gate | null = null;
	let prefixForNextGate: string | null = null;
	if (!isConcierge && !producedArtifact) {
		if (isUserTurn) {
			const userReplied = fullResponse.length > 0;
			if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed && userReplied) {
				meta.doubtsAddressed = true;
				await persistMeta(conversationId, meta);
			}
			if (meta.pendingFollowUp && userReplied) {
				meta.pendingFollowUp = false;
				await persistMeta(conversationId, meta);
			}
		}

		const refreshed = await reloadMeta(conversationId);
		const gate = nextGate(refreshed);
		if (gate !== "doubts-wait") {
			nextGateToFire = gate;
			// "search" has its own rich summary template; keep AI text separate.
			if (fullResponse && gate !== "search") {
				prefixForNextGate = formatTextForWhatsApp(fullResponse);
			}
		}
	}

	let hasSent = false;
	if (fullResponse && !prefixForNextGate) {
		const formatted = formatTextForWhatsApp(fullResponse);
		const chunks = splitMessage(formatted);
		for (const chunk of chunks) {
			if (hasSent) await sleep(typingDelay(chunk.length));
			await sendTextMessage(from, chunk);
			hasSent = true;
		}
	}

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
	}

	if (isConcierge) {
		if (hasSent) await sleep(ARTIFACT_PAUSE_MS);
		const buttons = welcomeButtonsToWhatsApp();
		if (buttons.interactive) {
			await sendInteractiveMessage(from, buttons.interactive);
		}
	}

	if (nextGateToFire) {
		if (hasSent) await sleep(ARTIFACT_PAUSE_MS);
		const refreshed = await reloadMeta(conversationId);
		if (nextGateToFire === "search") {
			await fireSummaryAndSearch(from, conversationId, refreshed);
		} else {
			await fireGate(from, nextGateToFire, refreshed, prefixForNextGate ?? undefined);
		}
	}

	const expertiseTag = meta.expertiseLevel ? `, expertise=${meta.expertiseLevel}` : "";
	console.log(
		`[whatsapp-processor] Processed: ${from} | persona=${currentPersona}${expertiseTag} | ${artifacts.length} artifacts, ${fullResponse.length} chars`,
	);
}

/**
 * Drive the agent with a server-authored instruction. Used after deterministic
 * events (button clicks, qualify completion) where we want the AI to react
 * in the persona's voice.
 *
 * The directive is appended as the LAST user-role message of the agent input
 * — this is the canonical Anthropic/AI SDK pattern for prompting the model
 * to take action. `system` parameter / role:system is reserved for persistent
 * context (persona, user name); the per-turn prompt goes at the end.
 *
 * The directive is NOT persisted to DB — it exists only in this turn's
 * agent input so it doesn't pollute future conversation history.
 */
async function runAgentDirective(
	from: string,
	conversationId: string,
	directive: string,
): Promise<void> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = (conv?.metadata ?? {}) as ConversationMetadata;
	const currentPersona: Persona = meta.currentPersona ?? "concierge";
	const knownName = conv?.contactName ?? null;

	const history = await loadConversationHistory(conversationId);
	const persistentContext: ChatMessage[] = [];
	if (knownName) {
		persistentContext.push({
			role: "system",
			content: `Nome do usuario: "${knownName}"`,
		});
	}

	const directiveTurn: ChatMessage = { role: "user", content: directive };

	await executeAgentTurn({
		from,
		conversationId,
		currentPersona,
		meta,
		messages: [...persistentContext, ...history, directiveTurn],
		isUserTurn: false,
	});
}

export async function processTextMessage(
	from: string,
	text: string,
	contactName?: string,
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
			await relayUserToAgent(from, text);
			return;
		}

		if (handoff?.conversationId) {
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.id, handoff.conversationId),
			});
			const meta = conv?.metadata as Record<string, unknown> | null;
			if (meta?.awaitingName) {
				const agents = await getAttendantList();
				if (agents.length > 0) {
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
					await handoffToAgents(handoff.conversationId, from, text, summary);
					return;
				}
			}

			const typedMeta = meta as ConversationMetadata | null;
			if (typedMeta?.searchDispatched && isInterestExpression(text)) {
				const conv2 = await db.query.conversations.findFirst({
					where: eq(conversations.id, handoff.conversationId),
				});
				const storedName = contactName ?? conv2?.contactName ?? null;
				const handled = await startInterestHandoff(from, handoff.conversationId, storedName);
				if (handled) return;
			}
		}

		await processWithAI(from, text, contactName);
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

async function processWithAI(from: string, text: string, contactName?: string): Promise<void> {
	const { id: conversationId } = await getOrCreateConversation(from);

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = (conv?.metadata ?? {}) as ConversationMetadata;
	const currentPersona: Persona = meta.currentPersona ?? "concierge";

	if (contactName && contactName !== conv?.contactName) {
		await db
			.update(conversations)
			.set({ contactName, updatedAt: new Date() })
			.where(eq(conversations.id, conversationId));
	}
	const knownName = contactName ?? conv?.contactName ?? null;

	// Single Haiku call covering both routing signals (category, switch, expertise)
	// and qualify extraction. AI SDK 6 Routing pattern — null is the "unsure" signal.
	const analysis = await analyzeTurn(text, currentPersona, meta);

	let metaChanged = false;
	// Drives a context message later so the AI gives the consorcio overview
	// when a user *types* "primeira vez" (instead of clicking the button).
	let newlyExtractedExperience: ExperiencePrev | null = null;

	// Persist BEFORE the AI runs so the prompt and post-AI nextGate() see the
	// updated state. Each field only fills empty slots — never overwrites.
	let extractedQualifyField = false;
	if (analysis.experiencePrev && !meta.experiencePrev) {
		meta.experiencePrev = analysis.experiencePrev;
		newlyExtractedExperience = analysis.experiencePrev;
		metaChanged = true;
	}
	const q = meta.qualifyAnswers ?? {};
	if (analysis.creditMax !== null && q.creditMax === undefined) {
		q.creditMin = analysis.creditMin ?? Math.round(analysis.creditMax * 0.9);
		q.creditMax = analysis.creditMax;
		meta.qualifyAnswers = q;
		metaChanged = true;
		extractedQualifyField = true;
	}
	if (analysis.prazoMeses !== null && q.prazoMeses === undefined) {
		q.prazoMeses = analysis.prazoMeses;
		meta.qualifyAnswers = q;
		metaChanged = true;
		extractedQualifyField = true;
	}
	if (analysis.hasLance && !q.hasLance) {
		q.hasLance = analysis.hasLance;
		meta.qualifyAnswers = q;
		metaChanged = true;
		extractedQualifyField = true;
	}
	// Typing a qualify value is a stronger opt-in than clicking "Bora!".
	if (extractedQualifyField && !meta.qualifyConsented) {
		meta.qualifyConsented = true;
		metaChanged = true;
	}

	// Short affirmatives like "sim" / "vamos" advance the consent gate when
	// the user types instead of clicking the button.
	if (
		currentPersona !== "concierge" &&
		!meta.qualifyConsented &&
		meta.experiencePrev &&
		!meta.pendingFollowUp &&
		isShortAffirmative(text)
	) {
		meta.qualifyConsented = true;
		metaChanged = true;
	}

	if (analysis.expertiseLevel !== "neutro" && analysis.expertiseLevel !== meta.expertiseLevel) {
		meta.expertiseLevel = analysis.expertiseLevel;
		metaChanged = true;
	}

	if (metaChanged) {
		await persistMeta(conversationId, meta);
	}

	// Routing: from concierge any detected category dispatches; between specialists
	// only an explicit switch ("na verdade quero...") triggers a transition.
	if (
		analysis.detectedCategory &&
		analysis.detectedCategory !== currentPersona &&
		(currentPersona === "concierge" || analysis.isExplicitSwitch)
	) {
		await saveMessage(conversationId, "user", text);
		await transitionToSpecialist(from, conversationId, currentPersona, analysis.detectedCategory);
		return;
	}

	await saveMessage(conversationId, "user", text);
	const history = await loadConversationHistory(conversationId);

	const contextMessages: ChatMessage[] = [];
	if (knownName) {
		contextMessages.push({
			role: "system",
			content: `Nome do usuario: "${knownName}"`,
		});
	}

	// Replicates the experience_* button nudge when the user got there via text.
	if (newlyExtractedExperience === "first") {
		contextMessages.push({
			role: "system",
			content: `O usuario acabou de revelar nesta mensagem que e a PRIMEIRA VEZ dele com consorcio. FLUXO IMPORTANTE: na sua resposta agora, reaja brevemente E EM SEGUIDA dê uma explicação curta (3-4 frases) sobre o essencial: grupo de pessoas que paga parcelas mensais sem juros, contemplacao por sorteio ou lance, diferenca de financiamento. Tom acolhedor, sem jargao tecnico (nada de cota/lance livre/fundo reserva). Termine sem pergunta — o sistema dispara a proxima etapa.`,
		});
	} else if (newlyExtractedExperience === "returning") {
		contextMessages.push({
			role: "system",
			content: `O usuario acabou de revelar que ja tem familiaridade com consorcio. FLUXO: reaja em UMA frase curta tipo "Show, vamos direto ao ponto entao." NAO explique o produto, NAO faca pergunta. O sistema dispara a proxima etapa em seguida.`,
		});
	}

	// Usuario veio de "Tenho duvidas" e esta perguntando algo especifico agora.
	// Apos a resposta, o sistema dispara "Posso te fazer 3 perguntinhas?" com
	// botoes [Bora!] / [Entender mais antes]. Por isso a AI NAO deve fechar
	// com "tem mais alguma duvida?" — duplica perguntas e cria atrito.
	if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed) {
		contextMessages.push({
			role: "system",
			content: `O usuario clicou "Tenho duvidas" anteriormente e agora esta perguntando algo especifico. Responda a duvida dele de forma direta e CLARA, em 2-4 frases. NAO termine com "tem mais alguma duvida?", "ficou claro?", "alguma outra pergunta?" ou similar — o sistema dispara automaticamente a transicao com botoes pra ele decidir se quer seguir ou pedir mais info. Voce so precisa entregar a resposta e parar.`,
		});
	}

	await executeAgentTurn({
		from,
		conversationId,
		currentPersona,
		meta,
		messages: [...contextMessages, ...history],
		isUserTurn: true,
	});
}

export async function processInteractiveReply(
	from: string,
	replyId: string,
	replyTitle: string,
	contactName?: string,
): Promise<void> {
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

	if (replyId.startsWith("experience_")) {
		const choice = replyId.replace("experience_", "") as ExperiencePrev;
		if (choice !== "first" && choice !== "returning" && choice !== "doubts") return;

		const { id: conversationId } = await getOrCreateConversation(from);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const meta = (conv?.metadata ?? {}) as ConversationMetadata;
		// Reset doubtsAddressed if user loops back through experience.
		await persistMeta(conversationId, {
			...meta,
			experiencePrev: choice,
			doubtsAddressed: choice === "doubts" ? false : meta.doubtsAddressed,
		});
		await saveMessage(conversationId, "user", replyTitle);

		// O sistema JA fez a apresentacao deterministica do especialista no turno
		// anterior (em transitionToSpecialist). A AI NUNCA deve se reapresentar
		// aqui — esses nudges reforcam isso pra evitar regressoes do firstMessageAnchor.
		let directive: string;
		if (choice === "first") {
			directive = `Usuario escolheu "${replyTitle}" — e a PRIMEIRA vez dele com consorcio. IMPORTANTE: o sistema JA te apresentou no turno anterior com saudacao + seu nome — NAO se apresente de novo, NAO diga "Aqui e Helena/Rafael/Camila", NAO mencione "anos de experiencia/mercado/especialidade". Va DIRETO ao conteudo. FLUXO: escreva UMA mensagem curta (3-4 frases) explicando o essencial sobre consorcio com SUAS palavras: e um grupo de pessoas que pagam parcelas mensais sem juros, e a cada mes alguem do grupo e contemplado por sorteio ou lance pra receber a carta de credito. Mencione brevemente que e diferente de financiamento (sem juros). NAO faca pergunta no final, NAO chame tools. Tom acolhedor e didatico, sem jargao tecnico (cota, lance livre, fundo reserva).`;
		} else if (choice === "returning") {
			directive = `Usuario escolheu "${replyTitle}" — ele JA tem familiaridade com consorcio. IMPORTANTE: o sistema JA te apresentou no turno anterior — NAO se apresente de novo, NAO diga "Aqui e Helena/Rafael/Camila", NAO mencione "anos de experiencia/mercado/especialidade". FLUXO: escreva APENAS UMA frase curta de transicao tipo "Show, vamos direto ao ponto entao." ou "Beleza, vamos seguir." NAO explique o produto, NAO faca pergunta, NAO chame tools.`;
		} else {
			directive = `Usuario escolheu "${replyTitle}" — ele tem duvidas sobre consorcio. IMPORTANTE: o sistema JA te apresentou no turno anterior — NAO se apresente de novo, NAO diga "Aqui e Helena/Rafael/Camila", NAO mencione "anos de experiencia/mercado/especialidade". Va DIRETO ao conteudo. FLUXO: escreva UMA mensagem (4-5 frases) explicando o essencial do produto com SUAS palavras: e um grupo de pessoas que paga parcelas mensais sem juros, contemplacao acontece por sorteio ou lance, prazo flexivel, diferenca de financiamento. Apos a explicacao, EM UMA frase curta convide o usuario a perguntar algo especifico se quiser ("se ficou alguma duvida especifica, manda aqui que eu respondo"). Tom acolhedor e didatico, sem jargao tecnico (cota, lance livre, fundo reserva). NAO chame tools.`;
		}
		await runAgentDirective(from, conversationId, directive);
		return;
	}

	if (replyId === "qualify_start_yes" || replyId === "qualify_start_more") {
		const { id: conversationId } = await getOrCreateConversation(from);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const meta = (conv?.metadata ?? {}) as ConversationMetadata;
		const persona = meta.currentPersona;
		await saveMessage(conversationId, "user", replyTitle);

		if (!persona || persona === "concierge") return;

		if (replyId === "qualify_start_yes") {
			await persistMeta(conversationId, { ...meta, qualifyConsented: true });
			const reaction = "Beleza, vamos lá.";
			await saveMessage(conversationId, "assistant", reaction);

			const refreshed = await reloadMeta(conversationId);
			const gate = nextGate(refreshed);
			if (gate === "search") {
				await sendTextMessage(from, reaction);
				await sleep(ARTIFACT_PAUSE_MS);
				await fireSummaryAndSearch(from, conversationId, refreshed);
			} else if (gate !== "doubts-wait") {
				// Fold the reaction into the next gate's body — one message instead of two.
				await fireGate(from, gate, refreshed, reaction);
			}
			return;
		}

		// pendingFollowUp keeps nextGate at doubts-wait until the user types
		// their question and the AI answers; then the post-AI hook clears it.
		await persistMeta(conversationId, { ...meta, pendingFollowUp: true });
		const directive = `Usuario quer entender mais antes de responder as perguntas de qualificacao. FLUXO: em UMA mensagem curta (2-3 frases), pergunte do que especificamente ele quer entender melhor (ex: "Claro, do que voce quer entender melhor antes? Pode ser sobre taxa, contemplacao, lance, prazo, ou diferenca de financiamento."). Tom acolhedor. NAO de explicacao longa nem despeje informacao — espere a pergunta especifica dele. NAO chame tools.`;
		await runAgentDirective(from, conversationId, directive);
		return;
	}

	if (replyId.startsWith("credit_")) {
		const resolved = resolveCreditReply(replyId);
		if (!resolved) return;

		const { id: conversationId } = await getOrCreateConversation(from);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const meta = (conv?.metadata ?? {}) as ConversationMetadata;
		const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
			...(meta.qualifyAnswers ?? {}),
			creditMin: resolved.min,
			creditMax: resolved.max,
		};
		await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
		await saveMessage(conversationId, "user", replyTitle);

		const directive = `Usuario escolheu faixa de credito "${resolved.title}" via botao. FLUXO: escreva UMA frase curta de reacao tipo "Boa, anotado." ou "Show, faixa que gira bem." NAO faca pergunta, NAO chame tools. O sistema vai mandar logo em seguida os botoes da proxima etapa.`;
		await runAgentDirective(from, conversationId, directive);
		return;
	}

	if (replyId.startsWith("timeframe_")) {
		const resolved = resolveTimeframeReply(replyId);
		if (!resolved) return;

		const { id: conversationId } = await getOrCreateConversation(from);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const meta = (conv?.metadata ?? {}) as ConversationMetadata;
		const persona = meta.currentPersona;
		const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
			...(meta.qualifyAnswers ?? {}),
			prazoMeses: resolved.prazoMeses,
		};
		await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
		await saveMessage(conversationId, "user", replyTitle);

		if (!persona || persona === "concierge") return;

		const directive = `Usuario escolheu prazo "${resolved.title}" via botao. FLUXO: escreva UMA frase curta de reacao adaptada ao prazo (ex: "Boa, prazo que gira bem.", "Show, da pra fazer um lance forte.", "Tranquilo, sem pressa funciona pra parcela mais leve."). NAO faca pergunta, NAO chame tools. O sistema vai mandar logo em seguida os botoes da proxima etapa.`;
		await runAgentDirective(from, conversationId, directive);
		return;
	}

	if (replyId.startsWith("lance_")) {
		const resolved = resolveLanceReply(replyId);
		if (!resolved) return;

		const { id: conversationId } = await getOrCreateConversation(from);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const meta = (conv?.metadata ?? {}) as ConversationMetadata;
		const persona = meta.currentPersona;
		const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
			...(meta.qualifyAnswers ?? {}),
			hasLance: resolved.value,
		};
		await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
		await saveMessage(conversationId, "user", replyTitle);

		if (!persona || persona === "concierge") return;

		const refreshed = await reloadMeta(conversationId);
		await fireSummaryAndSearch(from, conversationId, refreshed);
		return;
	}

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
			const filtros =
				range.creditMin > 0
					? `creditMin=${range.creditMin}, creditMax=${range.creditMax}`
					: `creditMax=${range.creditMax}`;
			const { id: conversationId } = await getOrCreateConversation(from);
			await saveMessage(conversationId, "user", replyTitle);
			const directive = `Usuario escolheu via slider a faixa de ${label} (${filtros}, orcamento mensal R$ ${budgetFmt}). FLUXO OBRIGATORIO: (1) chame search_groups com category="${range.category}" e os filtros (${filtros}); (2) se retornar 1 grupo, chame present_group_card; se retornar 2 ou mais, chame present_comparison_table com TODOS os grupos. NUNCA descreva os grupos em texto corrido — o componente visual e obrigatorio. Em texto, escreva UMA frase curta de orientacao apos os cards (ex: "Encontrei essas opcoes na sua faixa, qual quer simular?"). NAO narre passos antes das tools, NAO liste taxas/parcelas em prosa, NAO chame recommend_groups.`;
			await runAgentDirective(from, conversationId, directive);
			return;
		}
	}

	if (replyId.startsWith("picker_")) {
		await processTextMessage(from, `Meu orçamento é ${replyTitle}`, contactName);
		return;
	}

	if (replyId.startsWith("group_")) {
		const groupId = replyId.replace("group_", "");
		try {
			const details = await getAdapter().getGroupDetails({ groupId });
			const { id: conversationId } = await getOrCreateConversation(from);
			await saveMessage(conversationId, "user", replyTitle);
			const directive = `Usuario selecionou o grupo "${details.administradora}" (creditValue=${details.creditValue}, prazo=${details.termMonths}m). FLUXO: (1) chame simulate_quota com groupId="${groupId}" E creditValue=${details.creditValue}; (2) chame present_simulation_result com o retorno da tool. Em texto, NAO narre o que vai fazer (proibido "vou simular", "deixa eu calcular"). Apenas comente APOS o card aparecer, em UMA frase curta, o que chamou atencao (parcela, prazo ou taxa). NAO chame recommend_groups. NAO chame simulate_quota mais de uma vez. O card de simulacao tem botoes "Tenho interesse!" e "Ajustar valor", entao NAO peca pro usuario responder em texto, apenas direcione: "Toca em 'Tenho interesse' se fechar pra voce, ou 'Ajustar valor' se quiser mudar o credito."`;
			await runAgentDirective(from, conversationId, directive);
		} catch (err) {
			console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
			await sendTextMessage(
				from,
				"Tive um problema ao localizar esse grupo. Pode tentar selecionar outra opcao ou me dizer um valor de credito que voce quer simular?",
			);
		}
		return;
	}

	if (replyId.startsWith("simulate_")) {
		const groupId = replyId.replace("simulate_", "");
		try {
			const details = await getAdapter().getGroupDetails({ groupId });
			const { id: conversationId } = await getOrCreateConversation(from);
			await saveMessage(conversationId, "user", replyTitle);
			const directive = `Usuario quer simular o grupo "${details.administradora}" (creditValue=${details.creditValue}). FLUXO: (1) chame simulate_quota com groupId="${groupId}" E creditValue=${details.creditValue}; (2) chame present_simulation_result. NAO narre o que vai fazer. Comente APOS o card, em UMA frase. O card ja tem botoes "Tenho interesse!" e "Ajustar valor", direcione o usuario pra eles. NAO simule de novo o mesmo grupo.`;
			await runAgentDirective(from, conversationId, directive);
		} catch (err) {
			console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
			await sendTextMessage(from, "Tive um problema ao localizar esse grupo. Pode tentar de novo?");
		}
		return;
	}

	if (replyId.startsWith("whatif_")) {
		const groupId = replyId.replace("whatif_", "");
		try {
			const details = await getAdapter().getGroupDetails({ groupId });
			const { id: conversationId } = await getOrCreateConversation(from);
			await saveMessage(conversationId, "user", replyTitle);
			const directive = `O usuario quer ajustar o valor de credito do grupo "${details.administradora}" (creditValue atual=${details.creditValue}). Pergunte em UMA frase qual valor de credito ou parcela mensal ele quer simular agora. NAO simule ainda, espere a resposta dele com o novo valor.`;
			await runAgentDirective(from, conversationId, directive);
		} catch (err) {
			console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
			await sendTextMessage(from, "Tive um problema ao localizar esse grupo. Pode tentar de novo?");
		}
		return;
	}

	if (replyId.startsWith("detail_")) {
		const groupId = replyId.replace("detail_", "");
		const { id: conversationId } = await getOrCreateConversation(from);
		await saveMessage(conversationId, "user", replyTitle);
		const directive = `O usuario quer detalhes do grupo ${groupId}. Use get_group_details com esse groupId. NAO mencione IDs na resposta.`;
		await runAgentDirective(from, conversationId, directive);
		return;
	}

	if (replyId.startsWith("interest_")) {
		const handoff = await getHandoffState(from);
		if (handoff?.conversationId && !handoff.isHandedOff) {
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.id, handoff.conversationId),
			});
			const storedName = contactName ?? conv?.contactName ?? null;
			const handled = await startInterestHandoff(from, handoff.conversationId, storedName);
			if (handled) return;
		}
	}

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

const AFFIRMATIVE_REPLIES = new Set([
	"sim",
	"claro",
	"ok",
	"okay",
	"vamos",
	"vamo",
	"bora",
	"manda",
	"manda ver",
	"pode",
	"pode mandar",
	"pode ser",
	"certo",
	"beleza",
	"blz",
	"show",
	"isso",
	"aham",
	"positivo",
	"topo",
	"topei",
	"tá",
	"ta",
	"fechou",
	"vai",
	"segue",
	"siga",
]);

function isShortAffirmative(text: string): boolean {
	const trimmed = text
		.trim()
		.toLowerCase()
		.replace(/[!.?,]+$/, "")
		.trim();
	return AFFIRMATIVE_REPLIES.has(trimmed);
}

async function persistMeta(conversationId: string, meta: ConversationMetadata): Promise<void> {
	await db
		.update(conversations)
		.set({ metadata: meta, updatedAt: new Date() })
		.where(eq(conversations.id, conversationId));
}

async function sendInteractiveMessage(
	to: string,
	interactive: Record<string, unknown>,
): Promise<void> {
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

function buildConversationSummary(
	history: Array<{ role: string; content: string }>,
	artifacts: Array<{ type: string; payload: Record<string, unknown> }>,
): string {
	const lines: string[] = [];

	const recent = history.slice(-6);
	for (const msg of recent) {
		const prefix = msg.role === "user" ? "👤" : "🤖";
		lines.push(`${prefix} ${msg.content.slice(0, 200)}`);
	}

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
