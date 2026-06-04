import { recordStageReached } from "@/lib/admin/lead-stage-tracker";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import { buildSearchSummaryDirective } from "@/lib/agent/orchestrator/directives";
import { planTransition } from "@/lib/agent/orchestrator/transition";
import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import type { Gate } from "@/lib/agent/qualify-state";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { sendInteractiveMessage, sendTextMessage } from "./api";
import {
	artifactToWhatsApp,
	creditRangeQuestionToWhatsApp,
	experienceQuestionToWhatsApp,
	formatTextForWhatsApp,
	handoffConfirmationToWhatsApp,
	lanceEmbutidoQuestionToWhatsApp,
	lanceQuestionToWhatsApp,
	lanceValueQuestionToWhatsApp,
	qualifyConsentToWhatsApp,
	simulatorOfferToWhatsApp,
	splitMessage,
	timeframeQuestionToWhatsApp,
	welcomeButtonsToWhatsApp,
} from "./formatter";
import { getOrCreateConversation } from "./session";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const typingDelay = (chars: number) => Math.min(1500, 200 + chars * 6);
const ARTIFACT_PAUSE_MS = 500;
const POST_INTERACTIVE_PAUSE_MS = 1800;
const TRANSITION_PAUSE_MS = 1200;

type PendingArtifact = { type: string; payload: Record<string, unknown> };

async function gateInteractive(
	gate: Gate,
	conversationId: string,
	prefix: string | undefined,
): Promise<Record<string, unknown> | null> {
	const meta = await reloadMeta(conversationId);
	switch (gate) {
		case "experience":
			return experienceQuestionToWhatsApp(prefix).interactive ?? null;
		case "consent":
			return qualifyConsentToWhatsApp(prefix).interactive ?? null;
		case "credit": {
			const category = meta.currentCategory;
			if (!category) return null;
			return creditRangeQuestionToWhatsApp(category, prefix).interactive ?? null;
		}
		case "timeframe": {
			const category = meta.currentCategory;
			if (!category) return null;
			return timeframeQuestionToWhatsApp(category, prefix).interactive ?? null;
		}
		case "lance":
			return lanceQuestionToWhatsApp(prefix).interactive ?? null;
		case "lance-value": {
			// docx passo 2: "Qual valor aproximado?" — faixas relativas ao crédito.
			const creditMax = meta.qualifyAnswers?.creditMax;
			if (!creditMax) return null;
			return lanceValueQuestionToWhatsApp(creditMax, prefix).interactive ?? null;
		}
		case "lance-embutido":
			return lanceEmbutidoQuestionToWhatsApp(prefix).interactive ?? null;
		case "simulator-offer":
			// docx passo 4: oferta do simulador (botões Quero ver! / Agora não).
			return simulatorOfferToWhatsApp(prefix).interactive ?? null;
		case "identify":
		case "doubts-wait":
		case "search":
		case "decision":
			// "identify" não tem interactive — é coleta textual de CPF (fireGate
			// manda o prompt como texto; captura em identify-capture.ts).
			return null;
	}
}

async function consumeEvents(
	from: string,
	conversationId: string,
	events: AsyncIterable<TurnEvent>,
): Promise<void> {
	let textBuffer = "";
	let pendingArtifacts: PendingArtifact[] = [];
	let dropped = false;
	let hasSent = false;
	let lastWasInteractive = false;

	const pauseBeforeNext = () =>
		sleep(lastWasInteractive ? POST_INTERACTIVE_PAUSE_MS : ARTIFACT_PAUSE_MS);

	const flushText = async () => {
		if (!textBuffer) return;
		const formatted = formatTextForWhatsApp(textBuffer);
		textBuffer = "";
		if (!formatted) return;
		const chunks = splitMessage(formatted);
		for (const chunk of chunks) {
			if (hasSent) {
				const wait = lastWasInteractive ? POST_INTERACTIVE_PAUSE_MS : typingDelay(chunk.length);
				await sleep(wait);
			}
			await sendTextMessage(from, chunk);
			lastWasInteractive = false;
			hasSent = true;
		}
	};

	const flushArtifacts = async () => {
		if (pendingArtifacts.length === 0) return;
		const artifacts = pendingArtifacts;
		pendingArtifacts = [];
		for (const artifact of artifacts) {
			const wa = artifactToWhatsApp(artifact.type, artifact.payload);
			if (!wa) {
				// Visibilidade: artifact sem mapper cai em silêncio. Se um tipo
				// novo for adicionado a PRESENTATION_TOOLS sem mapping WA, o
				// warning aparece no log do canal. (artifact-coverage.test.ts
				// é o gate principal, mas o warning ajuda em produção.)
				console.warn(`[whatsapp/adapter] artifact dropado sem mapping: type=${artifact.type}`);
				continue;
			}
			if (hasSent) await pauseBeforeNext();
			if (wa.type === "text" && wa.text) {
				await sendTextMessage(from, wa.text);
				lastWasInteractive = false;
			} else if (wa.type === "interactive" && wa.interactive) {
				await sendInteractiveMessage(from, wa.interactive);
				lastWasInteractive = true;
			}
			hasSent = true;
		}
	};

	for await (const ev of events) {
		if (dropped) continue;

		switch (ev.type) {
			case "text-delta":
				textBuffer += ev.text;
				break;
			case "artifact":
				pendingArtifacts.push({ type: ev.artifactType, payload: ev.payload });
				break;
			case "lead-stage":
				await recordStageReached(conversationId, ev.stage as "engajado" | "qualificado");
				break;
			case "tool-call":
			case "meta-update":
				break;
			case "transition": {
				await flushText();
				await flushArtifacts();
				if (hasSent) await pauseBeforeNext();
				await sendTextMessage(from, ev.bridgeText);
				lastWasInteractive = false;
				hasSent = true;
				await sleep(TRANSITION_PAUSE_MS);
				break;
			}
			case "lead-collection-prompt": {
				await flushText();
				await flushArtifacts();
				if (hasSent) await pauseBeforeNext();
				await sendTextMessage(from, ev.text);
				lastWasInteractive = false;
				hasSent = true;
				break;
			}
			case "handoff": {
				textBuffer = "";
				pendingArtifacts = [];
				dropped = true;
				if (hasSent) await pauseBeforeNext();
				const r = handoffConfirmationToWhatsApp();
				if (r.interactive) {
					await sendInteractiveMessage(from, r.interactive);
					lastWasInteractive = true;
					hasSent = true;
				}
				break;
			}
			case "welcome-categories": {
				await flushText();
				await flushArtifacts();
				if (hasSent) await pauseBeforeNext();
				const w = welcomeButtonsToWhatsApp();
				if (w.interactive) {
					await sendInteractiveMessage(from, w.interactive);
					lastWasInteractive = true;
					hasSent = true;
				}
				break;
			}
			case "gate": {
				if (ev.prefix) {
					textBuffer = "";
				} else {
					await flushText();
				}
				await flushArtifacts();
				const interactive = await gateInteractive(ev.gate, conversationId, ev.prefix);
				if (interactive) {
					if (hasSent) await pauseBeforeNext();
					await sendInteractiveMessage(from, interactive);
					lastWasInteractive = true;
					hasSent = true;
				}
				break;
			}
			case "finish":
				await flushText();
				await flushArtifacts();
				break;
		}
	}
}

export async function processWithOrchestrator(
	from: string,
	text: string,
	contactName?: string,
): Promise<void> {
	const { id: conversationId } = await getOrCreateConversation(from);

	const events = runTurn({
		channel: "whatsapp",
		conversationId,
		userText: text,
		isUserTurn: true,
		contactName,
	});

	await consumeEvents(from, conversationId, events);
}

export async function runDirectiveWithOrchestrator(args: {
	from: string;
	conversationId: string;
	directive: string;
	contactName?: string | null;
}): Promise<void> {
	const { from, conversationId, directive, contactName } = args;

	const events = runTurn({
		channel: "whatsapp",
		conversationId,
		userText: directive,
		isUserTurn: false,
		contactName: contactName ?? null,
		skipAnalyzer: true,
		skipLeadCollection: true,
	});

	await consumeEvents(from, conversationId, events);
}

export async function runTransitionWithOrchestrator(args: {
	from: string;
	conversationId: string;
	fromPersona: Persona;
	toCategory: Category;
	expertiseHint?: string | null;
}): Promise<void> {
	const { from, conversationId, fromPersona, toCategory, expertiseHint } = args;
	const plan = await planTransition({ conversationId, fromPersona, toCategory, expertiseHint });
	if (plan.kind === "abort") {
		await sendTextMessage(from, plan.apologyText);
		return;
	}
	await sendTextMessage(from, plan.bridgeText);
	await sleep(TRANSITION_PAUSE_MS);
	await runDirectiveWithOrchestrator({ from, conversationId, directive: plan.directive });
}

export async function runSearchSummaryWithOrchestrator(args: {
	from: string;
	conversationId: string;
}): Promise<void> {
	const { from, conversationId } = args;
	const refreshed = await reloadMeta(conversationId);
	if (refreshed.searchDispatched) return;
	// Tripwire D1: busca real exige identidade (a Bevi não simula sem CPF).
	// Sem ela, pede o CPF por texto (celular = o próprio waId) — nunca buscar.
	if (!refreshed.identityCollected) {
		const { IDENTIFY_WHATSAPP_PROMPT } = await import("./identify-capture");
		await sendTextMessage(from, IDENTIFY_WHATSAPP_PROMPT);
		return;
	}
	const category = refreshed.currentCategory;
	if (!category) return;
	await persistMeta(conversationId, { ...refreshed, searchDispatched: true });
	const directive = buildSearchSummaryDirective({ category, meta: refreshed });
	await runDirectiveWithOrchestrator({ from, conversationId, directive });
}

export async function fireGate(
	from: string,
	conversationId: string,
	gate: Gate,
	meta: ConversationMetadata,
	prefix?: string,
): Promise<void> {
	if (gate === "consent" && !meta.consentOffered) {
		await persistMeta(conversationId, { ...meta, consentOffered: true });
	}
	// "identify" é textual (form não existe no WhatsApp): prompt de CPF + LGPD.
	if (gate === "identify") {
		const { IDENTIFY_WHATSAPP_PROMPT } = await import("./identify-capture");
		await sendTextMessage(from, IDENTIFY_WHATSAPP_PROMPT);
		return;
	}
	const interactive = await gateInteractive(gate, conversationId, prefix);
	if (interactive) await sendInteractiveMessage(from, interactive);
}
