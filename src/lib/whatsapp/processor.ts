import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getAdapter } from "@/lib/adapters";
import { resolveAgent } from "@/lib/agent/agents";
import { getCategoryMeta } from "@/lib/agent/categories";
import type { Category, ConversationMetadata, ExperiencePrev, Persona } from "@/lib/agent/personas";
import { ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import { pickPersonaForCategory } from "@/lib/agent/personas-repo";
import { type Gate, nextGate } from "@/lib/agent/qualify-state";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { analyzeTurn } from "@/lib/agent/turn-analyzer";
import { sendTextMessage } from "./api";
import {
	artifactToWhatsApp,
	creditRangeQuestionToWhatsApp,
	experienceQuestionToWhatsApp,
	formatTextForWhatsApp,
	handoffConfirmationToWhatsApp,
	lanceQuestionToWhatsApp,
	qualifyConsentToWhatsApp,
	resolveCreditReply,
	resolveLanceReply,
	resolveRange,
	resolveTimeframeReply,
	splitMessage,
	timeframeQuestionToWhatsApp,
	transitionBridgeText,
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
const typingDelay = (chars: number) => Math.min(1500, 200 + chars * 6);
const ARTIFACT_PAUSE_MS = 500;
// WhatsApp interactive (list/buttons) messages render slower than plain text,
// so a text sent ~800ms after a list can arrive on screen FIRST. Wait longer
// before queuing anything after an interactive send to preserve visual order.
const POST_INTERACTIVE_PAUSE_MS = 1800;
// Pause between the system bridge ("Conectando com Helena...") and the specialist's
// first turn. Gives the user a beat to read it before the next message arrives.
const TRANSITION_PAUSE_MS = 1200;

async function transitionToSpecialist(
	from: string,
	conversationId: string,
	fromPersona: Persona,
	toCategory: Category,
	expertiseHint?: string | null,
): Promise<void> {
	let personaRow: Awaited<ReturnType<typeof pickPersonaForCategory>>;
	try {
		personaRow = await pickPersonaForCategory(toCategory, expertiseHint ?? null);
	} catch (err) {
		console.error(
			`[whatsapp-processor] No active specialist persona for category=${toCategory}:`,
			err,
		);
		await sendTextMessage(
			from,
			"Desculpe, estou com um problema momentâneo pra te conectar com o especialista. Pode tentar de novo em alguns instantes?",
		);
		return;
	}
	const fromConcierge = fromPersona === "concierge";
	const meta0 = getCategoryMeta(personaRow);

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const seenSet = new Set<Category>(meta.personasSeen ?? []);
	const isReturning = seenSet.has(toCategory);
	seenSet.add(toCategory);

	// Specialist↔specialist switch drops faixa/prazo answers (they're category-specific).
	const updated: ConversationMetadata = {
		...meta,
		previousPersona: fromPersona,
		currentPersona: personaRow.id,
		currentCategory: toCategory,
		personasSeen: Array.from(seenSet),
		qualifyAnswers: fromConcierge ? meta.qualifyAnswers : undefined,
	};
	// Persist FIRST so runAgentDirective resolves the new specialist's voice.
	await persistMeta(conversationId, updated);

	// UX bridge: send a short system message announcing the connection BEFORE the
	// specialist takes over. Lets the user mentally prepare for the persona change.
	await sendTextMessage(
		from,
		transitionBridgeText({ name: personaRow.displayName, categoryLabel: meta0.label }),
	);
	await sleep(TRANSITION_PAUSE_MS);

	const offerCalibration = fromConcierge && !isReturning;
	const firstName = conv?.contactName?.trim().split(/\s+/)[0] ?? null;
	const nameHint = firstName
		? `O usuario se chama ${firstName}, voce pode usar o primeiro nome.`
		: "";

	if (offerCalibration) {
		// First contact with this specialist. The directive triggers Helena's welcome.
		// executeAgentTurn (inside runAgentDirective) auto-fires the next gate at end
		// of turn — Helena's text becomes the prefix of the experience question, all in
		// a single interactive WhatsApp message (text + buttons).
		// See SHARED_SPECIALIST_EXAMPLES "Primeiro turno apos transicao" for tone.
		const directive = `[sistema acabou de te conectar com o usuario que pediu pra falar sobre ${meta0.label}]${nameHint ? ` ${nameHint}` : ""}`;
		await runAgentDirective(from, conversationId, directive);
		return;
	}

	const directive = isReturning
		? `Voce esta RETOMANDO uma conversa que ja teve antes nesta sessao. NAO se apresente de novo. Responda direto a ultima mensagem do usuario NO SEU TOM, com naturalidade de quem esta voltando ao assunto. Em 1-2 frases.`
		: `PRIMEIRA aparicao sua, mas o usuario ja conversou com outro especialista antes (sobre outra categoria). Comece DIRETO com a resposta a ultima mensagem do usuario NO SEU TOM. Nao se apresente nem mencione o especialista anterior. Em 1-2 frases.`;

	await runAgentDirective(from, conversationId, directive);
}

// Single cast point — `conversations.metadata` is jsonb (Record<string, unknown>)
// at the schema level, but we know the shape. Avoids repeating the cast everywhere.
function metaOf(conv: { metadata: unknown } | null | undefined): ConversationMetadata {
	return (conv?.metadata ?? {}) as ConversationMetadata;
}

// Last-resort category detection when the Haiku analyzer fails (timeout, network).
// Conservative — só pega menções explícitas e claras pra evitar falso-positivo.
const CATEGORY_KEYWORDS: Record<Category, RegExp> = {
	imovel:
		/\b(im[oó]vel|im[oó]veis|apartamento|apto|casa|terreno|kitnet|comercial|sala\s+comercial)\b/i,
	auto: /\b(carro|autom[oó]vel|moto|motocicleta|caminhonete|caminh[aã]o|ve[ií]culo)\b/i,
	servicos: /\b(reforma|viagem|formatura|cirurgia|tratamento|servi[cç]o)\b/i,
};

function fallbackDetectCategory(text: string): Category | null {
	for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as Array<[Category, RegExp]>) {
		if (re.test(text)) return cat;
	}
	return null;
}

async function reloadMeta(conversationId: string): Promise<ConversationMetadata> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	return metaOf(conv);
}

const INTEREST_RE =
	/^\s*(tenho\s+interesse|tô\s+interessad[oa]|estou\s+interessad[oa]|quero\s+(?:esse|este|essa|esta|fechar|isso|essa\s+opcao)|me\s+interessa|fechar|bora\s+fechar|vamos\s+fechar|topo|topei|fechado)\s*[!.?]*\s*$/i;

function isInterestExpression(text: string): boolean {
	return INTEREST_RE.test(text);
}

async function startInterestHandoff(
	from: string,
	conversationId: string,
	storedName: string | null,
): Promise<boolean> {
	const handoff = await getHandoffState(from);
	if (!handoff?.conversationId || handoff.isHandedOff) return false;

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
	conversationId: string,
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
			// Mark as offered the first time we fire — nextGate uses this to avoid
			// re-prompting after each free-text doubt the user asks.
			if (!meta.consentOffered) {
				await persistMeta(conversationId, { ...meta, consentOffered: true });
			}
			const r = qualifyConsentToWhatsApp(prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "credit": {
			const category = meta.currentCategory;
			if (!category) return;
			const r = creditRangeQuestionToWhatsApp(category, prefix);
			if (r.interactive) await sendInteractiveMessage(from, r.interactive);
			return;
		}
		case "timeframe": {
			const category = meta.currentCategory;
			if (!category) return;
			const r = timeframeQuestionToWhatsApp(category, prefix);
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
	const category = meta.currentCategory;
	if (!category) return;
	const q = meta.qualifyAnswers ?? {};

	// Set BEFORE the work so concurrent re-entry sees the flag and bails out.
	await persistMeta(conversationId, { ...meta, searchDispatched: true });

	const filterParts: string[] = [];
	if (q.creditMin !== undefined && q.creditMin > 0) {
		filterParts.push(`creditMin=${q.creditMin}`);
	}
	if (q.creditMax !== undefined) {
		filterParts.push(`creditMax=${q.creditMax}`);
	}
	const filters = filterParts.length > 0 ? `, ${filterParts.join(", ")}` : "";

	// Single directive: agent summarizes IN voice + then calls the search tools.
	// Replaces the previous fixed bullet template ("✅ Crédito... ✅ Prazo...").
	const directive = `O usuario completou as 4 perguntas de qualificacao:
- experiencia=${meta.experiencePrev}
- faixa de credito=R$ ${q.creditMin ?? 0} a R$ ${q.creditMax ?? "?"}
- prazo=${q.prazoMeses ?? "?"} meses
- lance=${q.hasLance}

FLUXO OBRIGATORIO neste turno:
1. Em 1-2 frases curtas NO SEU TOM, espelhe esse perfil de volta pro usuario (ex: "Beleza, ${q.creditMax ?? 0} mil em [prazo], com lance — bora ver as opcoes."). NAO use bullets/checkboxes (✅), NAO escreva "Vou puxar as melhores opcoes pra voce", NAO use template.
2. Chame search_groups com category="${category}"${filters}.
3. Chame present_comparison_table com os grupos retornados (ou present_group_card se vier so 1).
4. Apos os cards, em UMA frase curta NO SEU TOM, oriente ("qual quer simular?" ou equivalente).

NAO narre passos antes das tools. NAO chame recommend_groups.`;
	await runAgentDirective(from, conversationId, directive);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// `isUserTurn` distinguishes a real user reply from a server-authored directive
// (button click etc.) — only user turns clear doubtsAddressed/pendingFollowUp.
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
	let handoffSignal: { triggerId?: string; reason: string } | null = null;

	const isConcierge = !meta.currentCategory;
	const agent = await resolveAgent(currentPersona, meta);
	const result = await agent.stream({ messages });

	for await (const part of result.fullStream) {
		switch (part.type) {
			case "text-delta":
				fullResponse += part.text;
				break;
			case "tool-call": {
				if (part.toolName === "suggest_handoff") {
					const input = part.input as { triggerId?: string; reason?: string };
					handoffSignal = {
						triggerId: input.triggerId,
						reason: input.reason ?? "trigger satisfied",
					};
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

	// Per AI SDK 6 docs: check finishReason after fullStream consumption.
	// "stop" = natural end, "tool-calls" = stopped to wait for tool result.
	// Anything else (length truncation, content filter, error) means the response
	// may be incomplete — log so we can spot it in production.
	try {
		const finishReason = await result.finishReason;
		if (finishReason !== "stop" && finishReason !== "tool-calls") {
			console.warn(
				`[whatsapp-processor] Agent stream ended with unexpected finishReason="${finishReason}" persona=${currentPersona}`,
			);
		}
	} catch {
		// finishReason is best-effort — not all providers expose it reliably.
	}

	// Handoff is exclusive: when the agent flags a trigger, drop AI text + artifacts
	// and let the system handle the confirmation. Prevents the salad seen in
	// production where Helena verbalized handoff AND advanced gates in the same turn.
	if (handoffSignal && !isConcierge) {
		console.log(
			`[handoff] persona=${currentPersona} reason="${handoffSignal.reason}" — pausing flow`,
		);
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			handoffSuggested: true,
			handoffReason: handoffSignal.reason,
		});
		const r = handoffConfirmationToWhatsApp();
		if (r.interactive) await sendInteractiveMessage(from, r.interactive);
		return;
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
	let lastWasInteractive = false;
	const pauseBeforeNext = () =>
		sleep(lastWasInteractive ? POST_INTERACTIVE_PAUSE_MS : ARTIFACT_PAUSE_MS);
	// Send artifacts FIRST (cards/comparison/simulation before commentary).
	// The system prompt instructs the agent to "comente APOS o card aparecer", so
	// the visual context lands before the text reacting to it. UX win.
	for (const artifact of artifacts) {
		const waResponse = artifactToWhatsApp(artifact.type, artifact.payload);
		if (!waResponse) continue;
		if (hasSent) await pauseBeforeNext();
		if (waResponse.type === "text" && waResponse.text) {
			await sendTextMessage(from, waResponse.text);
			lastWasInteractive = false;
		} else if (waResponse.type === "interactive" && waResponse.interactive) {
			await sendInteractiveMessage(from, waResponse.interactive);
			lastWasInteractive = true;
		}
		hasSent = true;
	}

	// Then text (unless it's being used as prefix of the next gate question).
	if (fullResponse && !prefixForNextGate) {
		const formatted = formatTextForWhatsApp(fullResponse);
		const chunks = splitMessage(formatted);
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			if (hasSent) {
				const wait = lastWasInteractive
					? POST_INTERACTIVE_PAUSE_MS
					: typingDelay(chunk.length);
				await sleep(wait);
			}
			await sendTextMessage(from, chunk);
			lastWasInteractive = false;
			hasSent = true;
		}
	}

	if (isConcierge) {
		if (hasSent) await pauseBeforeNext();
		const buttons = welcomeButtonsToWhatsApp();
		if (buttons.interactive) {
			await sendInteractiveMessage(from, buttons.interactive);
			lastWasInteractive = true;
		}
	}

	if (nextGateToFire) {
		if (hasSent) await pauseBeforeNext();
		const refreshed = await reloadMeta(conversationId);
		if (nextGateToFire === "search") {
			await fireSummaryAndSearch(from, conversationId, refreshed);
		} else {
			await fireGate(
				from,
				conversationId,
				nextGateToFire,
				refreshed,
				prefixForNextGate ?? undefined,
			);
		}
	}

	const expertiseTag = meta.expertiseLevel ? `, expertise=${meta.expertiseLevel}` : "";
	console.log(
		`[whatsapp-processor] Processed: ${from} | persona=${currentPersona}${expertiseTag} | ${artifacts.length} artifacts, ${fullResponse.length} chars`,
	);
}

// Directive goes in the LAST user-role message — Anthropic needs a user turn at
// the end to generate a response. Not persisted, only lives in this turn's input.
async function runAgentDirective(
	from: string,
	conversationId: string,
	directive: string,
): Promise<void> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
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
	const meta = metaOf(conv);
	const currentPersona: Persona = meta.currentPersona ?? "concierge";

	if (contactName && contactName !== conv?.contactName) {
		await db
			.update(conversations)
			.set({ contactName, updatedAt: new Date() })
			.where(eq(conversations.id, conversationId));
	}

	// While handoff is pending confirmation, don't run the agent or advance gates.
	// Re-prompt with the deterministic confirmation buttons so the user sees them again.
	if (meta.handoffSuggested) {
		await saveMessage(conversationId, "user", text);
		const r = handoffConfirmationToWhatsApp();
		if (r.interactive) await sendInteractiveMessage(from, r.interactive);
		return;
	}

	const knownName = contactName ?? conv?.contactName ?? null;

	const analysis = await analyzeTurn(text, currentPersona, meta);

	let metaChanged = false;
	// Tracked separately from meta because we trigger the consórcio overview
	// nudge only when extraction *just happened* this turn (vs. a previous one).
	let newlyExtractedExperience: ExperiencePrev | null = null;

	// Each field only fills empty slots — never overwrites a previous answer.
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
	// Typing a qualify value implies consent — same effect as clicking "Bora!".
	if (extractedQualifyField && !meta.qualifyConsented) {
		meta.qualifyConsented = true;
		metaChanged = true;
	}
	// Volunteering concrete data also implies familiarity with the product.
	// Skip the "Você já fez consórcio?" gate — feels robotic when user clearly knows
	// what they want. Treat as "returning"; the analyzer's expertiseLevel still
	// drives whether to add a brief explanation in the agent's response.
	if (extractedQualifyField && !meta.experiencePrev) {
		meta.experiencePrev = "returning";
		metaChanged = true;
	}

	if (
		meta.currentCategory &&
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

	// Use analyzer detection if present; else fall back to regex on the raw text.
	// Defends against analyzer timeouts/errors when the user clearly mentioned a category.
	const detectedCategory = analysis.detectedCategory ?? fallbackDetectCategory(text);
	if (
		detectedCategory &&
		detectedCategory !== meta.currentCategory &&
		(!meta.currentCategory || analysis.isExplicitSwitch)
	) {
		if (!analysis.detectedCategory) {
			console.log(
				`[whatsapp-processor] Analyzer missed category — regex fallback detected "${detectedCategory}" in: "${text.slice(0, 80)}"`,
			);
		}
		await saveMessage(conversationId, "user", text);
		await transitionToSpecialist(
			from,
			conversationId,
			currentPersona,
			detectedCategory,
			analysis.detectedSubTopic,
		);
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

	// AI shouldn't close with "tem mais alguma duvida?" — system fires consent
	// buttons right after, the duplicate question creates friction.
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
	if (replyId === "handoff_confirm") {
		const { id: conversationId } = await getOrCreateConversation(from);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const meta = metaOf(conv);
		await saveMessage(conversationId, "user", replyTitle);
		// Clear the lock either way — handoff queue takes over.
		await persistMeta(conversationId, {
			...meta,
			handoffSuggested: false,
			handoffReason: undefined,
		});
		const storedName = contactName ?? conv?.contactName ?? null;
		await startInterestHandoff(from, conversationId, storedName);
		return;
	}

	if (replyId === "handoff_decline") {
		const { id: conversationId } = await getOrCreateConversation(from);
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const meta = metaOf(conv);
		await saveMessage(conversationId, "user", replyTitle);
		const cleared: ConversationMetadata = {
			...meta,
			handoffSuggested: false,
			handoffReason: undefined,
		};
		await persistMeta(conversationId, cleared);
		// Resume the funnel — fire the next gate that was pending when handoff fired.
		const gate = nextGate(cleared);
		if (gate === "search") {
			await fireSummaryAndSearch(from, conversationId, cleared);
		} else if (gate !== "doubts-wait") {
			await fireGate(from, conversationId, gate, cleared);
		} else {
			await sendTextMessage(from, "Beleza, vamos seguir então. O que você quer saber?");
		}
		return;
	}

	if (replyId.startsWith("category_")) {
		const category = replyId.replace("category_", "") as Category;
		if ((ROUTABLE_CATEGORIES as readonly string[]).includes(category)) {
			const { id: conversationId } = await getOrCreateConversation(from);
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.id, conversationId),
			});
			const meta = metaOf(conv);
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
		const meta = metaOf(conv);
		// Reset doubtsAddressed if user loops back through experience.
		await persistMeta(conversationId, {
			...meta,
			experiencePrev: choice,
			doubtsAddressed: choice === "doubts" ? false : meta.doubtsAddressed,
		});
		await saveMessage(conversationId, "user", replyTitle);

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
		const meta = metaOf(conv);
		await saveMessage(conversationId, "user", replyTitle);

		if (!meta.currentCategory) return;

		if (replyId === "qualify_start_yes") {
			await persistMeta(conversationId, { ...meta, qualifyConsented: true });
			// Veja exemplo "Usuario aceitou comecar qualificacao" no SHARED_SPECIALIST_EXAMPLES.
			const directive = `[usuario aceitou comecar a qualificacao]`;
			await runAgentDirective(from, conversationId, directive);
			return;
		}

		// pendingFollowUp keeps nextGate at doubts-wait until the user types
		// their question and the AI answers; then the post-AI hook clears it.
		await persistMeta(conversationId, { ...meta, pendingFollowUp: true });
		const directive = `[usuario clicou "Entender mais antes" — pergunte em uma frase curta sobre o que especificamente ele quer entender, sem despejar info ainda]`;
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
		const meta = metaOf(conv);
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
		const meta = metaOf(conv);
		const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
			...(meta.qualifyAnswers ?? {}),
			prazoMeses: resolved.prazoMeses,
		};
		await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
		await saveMessage(conversationId, "user", replyTitle);

		if (!meta.currentCategory) return;

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
		const meta = metaOf(conv);
		const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
			...(meta.qualifyAnswers ?? {}),
			hasLance: resolved.value,
		};
		await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
		await saveMessage(conversationId, "user", replyTitle);

		if (!meta.currentCategory) return;

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
