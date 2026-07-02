import { recordStageReached } from "@/lib/admin/lead-stage-tracker";
import { reengageQuestionForGate } from "@/lib/agent/gate-reengage";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import { buildSearchSummaryDirective } from "@/lib/agent/orchestrator/directives";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { planTransition } from "@/lib/agent/orchestrator/transition";
import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import { type Gate, nextGate } from "@/lib/agent/qualify-state";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { traceTurnEvents } from "@/lib/telemetry/turn-trace";
import { sendInteractiveMessage, sendTextMessage } from "./api";
import {
	artifactToWhatsApp,
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
			// docx: pós-explicação de primeira vez → "Entendi, pode continuar".
			return (
				qualifyConsentToWhatsApp(prefix, { firstTime: meta.experiencePrev === "first" })
					.interactive ?? null
			);
		case "credit":
			// FIX-120 (paridade FIX-115): o valor do bem virou CONVERSA — o WhatsApp
			// não manda mais a lista de faixas. A pergunta sai como TEXTO (ver
			// gateTextPrompt), espelhando o gate `identify`. A resposta livre é
			// capturada pelo analyzer + backstop parseAssetValue.
			return null;
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
		case "name":
		case "identify":
		case "doubts-wait":
		case "search":
		case "decision":
			// FIX-17: "name" degrada pra texto no WhatsApp — a pergunta do nome já
			// sai no texto do directive de primeiro contato; o card não existe aqui.
			// "identify" não tem interactive — é coleta textual de CPF (fireGate
			// manda o prompt como texto; captura em identify-capture.ts).
			return null;
	}
}

// FIX-120 (paridade FIX-115): gates CONVERSACIONAIS (o valor do bem, `credit`)
// saem como TEXTO no WhatsApp — não como componente de seleção — espelhando o
// tratamento textual do `identify`. Retorna a pergunta (com prefix embutido) ou
// null pros gates que não são textuais. A resposta livre do usuário é capturada
// pelo pipeline conversacional (analyzer + backstop parseAssetValue, FIX-115).
// Gates que saem como TEXTO no WhatsApp (nenhum tem componente interativo):
// `credit` (valor do bem, FIX-120) E `identify` (CPF+celular, FIX-53). BUG DE PROD
// (2026-07-02): o identify NÃO estava aqui — ao clicar "Bora!" (consent) o funil ia
// pro gate identify, o gate disparava mas NADA era enviado no WhatsApp (gateInteractive
// e gateTextPrompt = null), fechando o turno MUDO: por clique = silêncio, por texto
// ("continua") = "me perdi". Agora o identify entrega a pergunta do CPF como texto.
const WHATSAPP_TEXT_GATES = new Set<Gate>(["credit", "identify"]);
async function gateTextPrompt(
	gate: Gate,
	conversationId: string,
	prefix: string | undefined,
): Promise<string | null> {
	if (!WHATSAPP_TEXT_GATES.has(gate)) return null;
	const meta = await reloadMeta(conversationId);
	// `credit` usa a categoria no texto; `identify` é fixo — gateQuestion aceita null.
	const question = gateQuestion(gate, meta.currentCategory ?? null);
	if (!question) return null;
	return prefix ? `${prefix}\n\n${question}` : question;
}

async function consumeEvents(
	from: string,
	conversationId: string,
	events: AsyncIterable<TurnEvent>,
	opts?: { guardEmptyTurn?: boolean },
): Promise<void> {
	// FIX-21: este é o funil único de consumo de TurnEvents do canal WhatsApp
	// (todos os run*WithOrchestrator passam por aqui). Tap passthrough fecha 1
	// trace/turno SEM tocar runner.ts (bloco G). Persona no início do turno é
	// best-effort — telemetria nunca derruba o turno.
	const personaAtStart = await reloadMeta(conversationId)
		.then((m) => m.currentPersona ?? null)
		.catch(() => null);
	const tracedEvents = traceTurnEvents(events, {
		conversationId,
		channel: "whatsapp",
		persona: personaAtStart,
	});

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
			// FIX-109: o valor do bem virou CONVERSA — o agente (bloco-jornada-entrada)
			// parou de emitir value_picker. Se ainda chegar um, NÃO renderizamos a
			// lista de faixas: o formatter degrada pra um pedido conversacional. O warn
			// flagra em produção se a emissão não tiver sido removida no agente.
			// TODO(bloco-jornada-entrada): confirmar a parada de emissão do value_picker.
			if (artifact.type === "value_picker") {
				console.warn(
					"[whatsapp/adapter] value_picker chegou no WhatsApp — valor agora é conversa (FIX-109); degradando pra pedido conversacional",
				);
			}
			// FIX-25: passo 5 no WhatsApp — ao renderizar o contract_form, abre a
			// máquina de estado do fechamento (confirm/cpf). O turno seguinte do
			// usuário cai em captureContractText (processor) e os botões em
			// interactive-handlers; o disparo do startContract é o aceite.
			if (artifact.type === "contract_form") {
				const { beginContractCollection } = await import("./contract-capture");
				await beginContractCollection(conversationId, artifact.payload).catch(() => {});
			}
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

	for await (const ev of tracedEvents) {
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
			case "suppression":
			case "usage":
				// FIX-24: telemetria interna — o tap `traceTurnEvents` já consumiu
				// o evento; nada a enviar no WhatsApp.
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
					console.log(`[gate-delivery] conv=${conversationId} gate=${ev.gate} via=interactive`);
				} else {
					// FIX-120: gates conversacionais (credit/identify) saem como TEXTO — a
					// pergunta viajava no body da lista; sem a lista, mandamos em texto.
					const textPrompt = await gateTextPrompt(ev.gate, conversationId, ev.prefix);
					if (textPrompt) {
						if (hasSent) await pauseBeforeNext();
						await sendTextMessage(from, textPrompt);
						lastWasInteractive = false;
						hasSent = true;
						console.log(`[gate-delivery] conv=${conversationId} gate=${ev.gate} via=text`);
					} else {
						// Nenhuma entrega pro gate no WhatsApp → o turno pode fechar MUDO.
						// Alerta ALTO pra caçar buracos de entrega de gate (o do identify,
						// 2026-07-02). Se você vê isto, um gate disparou sem forma de enviar.
						console.error(
							`[gate-undelivered] conv=${conversationId} gate=${ev.gate} — SEM entrega no WhatsApp (nem interactive nem texto); turno pode fechar mudo`,
						);
					}
				}
				break;
			}
			case "finish":
				await flushText();
				await flushArtifacts();
				break;
		}
	}

	// FIX-172: guard de turno-mudo (paridade com o web, route.ts:1109). Se o turno
	// do usuário fecha SEM emitir nada visível (ex.: loop de save_contact_name até
	// stepCountIs, textChars=0), o usuário ficaria sem resposta — 27s de silêncio.
	// Emite o fallback honesto. `dropped` (handoff) tem seu card silencioso próprio.
	if (opts?.guardEmptyTurn && !hasSent && !dropped) {
		// FIX-208 (rede final): se o turno fecharia mudo com um gate de COLETA
		// PENDENTE (ex.: o gate de VALOR — usuário respondeu "200" e nada foi emitido),
		// re-emite a PERGUNTA do gate em vez do "me perdi". Nunca deixa a coleta muda.
		// `nextGate` sem hasContactName é o padrão do WhatsApp (o nome vem do pushName,
		// não força o gate "name"; ver processor.ts). reengageQuestionForGate só
		// retorna texto pros gates de coleta — os demais caem no fallback honesto.
		const guardMeta = await reloadMeta(conversationId);
		const ng = nextGate(guardMeta);
		const reengage = reengageQuestionForGate(ng, guardMeta.currentCategory);
		console.warn(
			`[empty-turn-guard] conv=${conversationId} DISPAROU (turno fechou mudo) nextGate=${ng} ação=${reengage ? "re-pergunta-do-gate" : "fallback-honesto(me-perdi)"}`,
		);
		await sendTextMessage(from, reengage ?? EMPTY_TURN_FALLBACK);
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

	// guardEmptyTurn: SÓ no user-turn (paridade com o web) — o agente SEMPRE deve
	// responder algo ao usuário. Directives (runDirective/Transition) podem ser
	// silenciosos por design, então NÃO recebem o guard. FIX-172.
	await consumeEvents(from, conversationId, events, { guardEmptyTurn: true });
}

export async function runDirectiveWithOrchestrator(args: {
	from: string;
	conversationId: string;
	directive: string;
	contactName?: string | null;
	/** FIX-189: liga o guard de turno-mudo do consumeEvents. Directives em geral
	 * podem ser silenciosos por design (não guardam), MAS a descoberta SEMPRE deve
	 * revelar algo — o dispatch de busca passa true pra não pendurar no chip. */
	guardEmptyTurn?: boolean;
}): Promise<void> {
	const { from, conversationId, directive, contactName, guardEmptyTurn } = args;

	const events = runTurn({
		channel: "whatsapp",
		conversationId,
		userText: directive,
		isUserTurn: false,
		contactName: contactName ?? null,
		skipAnalyzer: true,
		skipLeadCollection: true,
	});

	await consumeEvents(from, conversationId, events, { guardEmptyTurn });
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
	// FIX-189 (pendura): a descoberta SEMPRE deve revelar algo — se o turno fechar
	// só com o chip (0 texto, 0 artifact), o guardEmptyTurn emite o fallback em vez
	// de deixar o usuário no silêncio até cutucar.
	await runDirectiveWithOrchestrator({ from, conversationId, directive, guardEmptyTurn: true });
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
	// FIX-120: gates conversacionais (credit) saem como TEXTO, espelhando o identify.
	const textPrompt = await gateTextPrompt(gate, conversationId, prefix);
	if (textPrompt) {
		await sendTextMessage(from, textPrompt);
		return;
	}
	const interactive = await gateInteractive(gate, conversationId, prefix);
	if (interactive) await sendInteractiveMessage(from, interactive);
}
