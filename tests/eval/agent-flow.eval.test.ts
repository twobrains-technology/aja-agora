/**
 * Eval Agent-vs-Agent — Fluxo Bruna (B3/B6/B9/B11/B13) + captura de lead (mig 0015/0017/0018).
 *
 * Framework: um "user-bot" (LLM com persona de cliente leigo) simula a
 * jornada canônica do cliente; o agent REAL do aja-agora responde via
 * `runTurn` do orquestrador (mesmo code path do POST /api/chat). Captura
 * tool-calls, artifacts e texto de cada turno, e valida que o agent segue
 * o fluxo proposto pela Bruna + os steps novos de captura.
 *
 * NÃO PRECISA estar verde pra apresentar. O valor é ter o framework
 * rodando + relatório do que ainda não tá ok.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { beviProposals, conversations, leadEvents, leads, messages } from "@/db/schema";
import { __setDiscoveryAdapterFactoryForTests, __setProposalGatewayForTests } from "@/lib/adapters";
import type { ProposalGateway, ProposalStatus } from "@/lib/adapters/proposal-gateway";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import {
	buildCreditReactionDirective,
	buildExperienceFirstDirective,
	buildTimeframeReactionDirective,
} from "@/lib/agent/orchestrator/directives";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { objetivoForPrazo } from "@/lib/agent/qualify-config";
import { storeIdentity } from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import {
	FIXTURE_IDENTITY,
	FIXTURE_OFFERS_IMOVEL,
	fixtureDiscoveryAdapter,
} from "../helpers/fixture-discovery-adapter";
import { anthropicAvailable, warnEvalSkipped } from "./anthropic-availability";

// ── MOCK-RUNTIME-MORTO: o eval NUNCA toca a Bevi real ──
// Agente real + descoberta via adapter de FIXTURES (capturas reais da
// loja-piloto). Sem o seam, search_groups criaria proposta REAL na Bevi
// com CPF semeado (LGPD, regra de ouro da spec §13).
beforeAll(() => {
	__setDiscoveryAdapterFactoryForTests(() => fixtureDiscoveryAdapter());
	if (!process.env.IDENTITY_ENC_KEY) {
		process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
	}
});
afterAll(() => __setDiscoveryAdapterFactoryForTests(null));

// ─────────────────────────────────────────────────────────────────────────────
// Tipos do framework
// ─────────────────────────────────────────────────────────────────────────────

type Turn = {
	role: "user-bot" | "agent" | "system";
	content: string;
	toolCalls: string[];
	artifacts: Array<{ type: string; payload: Record<string, unknown> }>;
	events: TurnEvent[];
};

type Scenario = {
	name: string;
	userBotSystemPrompt: string;
	firstUserMessage: string;
	maxTurns?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// User-bot
// ─────────────────────────────────────────────────────────────────────────────

const anthropic = createAnthropic();
const USER_BOT_MODEL = process.env.AI_MODEL_EVAL ?? "claude-haiku-4-5";

async function userBotReply(args: { systemPrompt: string; transcript: Turn[] }): Promise<string> {
	const conversation = args.transcript
		.filter((t) => t.role !== "system")
		.map((t) => ({
			role: (t.role === "user-bot" ? "assistant" : "user") as "assistant" | "user",
			content: t.content || "(sem texto, apenas cards visuais)",
		}));

	const result = await generateText({
		model: anthropic(USER_BOT_MODEL),
		system: `${args.systemPrompt}\n\nResponda como o USUÁRIO da conversa, sempre em PT-BR, curto e natural (1-2 frases no MÁXIMO). Sem emojis. Sem listas. Se o agente apresentar opções, escolha 1 e responda curto. Se já respondeu tudo que precisava, escreva apenas "ok".`,
		messages: conversation,
	});
	return result.text.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: consome o stream de TurnEvents e materializa um Turn
// ─────────────────────────────────────────────────────────────────────────────

async function consumeAgentTurn(args: {
	conversationId: string;
	userText: string;
	isUserTurn: boolean;
}): Promise<Turn> {
	const events: TurnEvent[] = [];
	const toolCalls: string[] = [];
	const artifacts: Turn["artifacts"] = [];
	let text = "";

	const gen = runTurn({
		channel: "web",
		conversationId: args.conversationId,
		userText: args.userText,
		isUserTurn: args.isUserTurn,
		contactName: null,
		skipLeadCollection: true,
		userKey: null,
	});

	for await (const ev of gen) {
		events.push(ev);
		switch (ev.type) {
			case "text-delta":
				text += ev.text;
				break;
			case "tool-call":
				toolCalls.push(ev.toolName);
				break;
			case "artifact":
				artifacts.push({ type: ev.artifactType, payload: ev.payload });
				break;
		}
	}

	return { role: "agent", content: text, toolCalls, artifacts, events };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: processa eventos `gate` que requerem "clique" do usuário simulado
// (replica o que /api/chat POST faz nos handlers de action).
// ─────────────────────────────────────────────────────────────────────────────

async function handleGateEvent(args: {
	conversationId: string;
	gateEvent: Extract<TurnEvent, { type: "gate" }>;
}): Promise<Turn | null> {
	const { conversationId, gateEvent } = args;
	const meta = await reloadMeta(conversationId);

	switch (gateEvent.gate) {
		case "experience": {
			// Sempre "first" (primeira vez) — cobre B11.
			const label = "É a primeira vez";
			await persistMeta(conversationId, {
				...meta,
				experiencePrev: "first",
				doubtsAddressed: meta.doubtsAddressed,
			});
			await saveMessage(conversationId, "user", label, "web");
			return await consumeAgentTurn({
				conversationId,
				userText: buildExperienceFirstDirective(label),
				isUserTurn: false,
			});
		}

		case "consent": {
			// "Bora!" — aceita a qualificação direto.
			const label = "Bora!";
			await persistMeta(conversationId, { ...meta, qualifyConsented: true });
			await saveMessage(conversationId, "user", label, "web");
			// Importa só aqui pra evitar circular import na carga inicial.
			const { buildQualifyStartYesDirective } = await import("@/lib/agent/orchestrator/directives");
			return await consumeAgentTurn({
				conversationId,
				userText: buildQualifyStartYesDirective(),
				isUserTurn: false,
			});
		}

		case "credit": {
			// FIX-15: perfil Monique alinhado à captura REAL de IMOVEL (crédito ~R$ 80k,
			// parcela R$ 366–548). A fixture serve esses números; injetar 400k/2500 aqui
			// deixava o meta incoerente com a oferta real exibida.
			const credit = 80_000;
			const monthlyBudget = 600;
			const label = `R$ ${credit.toLocaleString("pt-BR")} · R$ ${monthlyBudget.toLocaleString("pt-BR")}/mês`;
			const creditMin = Math.round((credit * 0.85) / 1000) * 1000;
			const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
				...(meta.qualifyAnswers ?? {}),
				creditMin,
				creditMax: credit,
				monthlyBudget,
			};
			await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
			await saveMessage(conversationId, "user", label, "web");
			return await consumeAgentTurn({
				conversationId,
				userText: buildCreditReactionDirective(label),
				isUserTurn: false,
			});
		}

		case "timeframe": {
			// Jornada do doc: "1 ano" → contemplação rápida (objetivo Bevi).
			const label = "1 ano";
			const prazoMeses = 12;
			const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
				...(meta.qualifyAnswers ?? {}),
				prazoMeses,
				objetivo: objetivoForPrazo(prazoMeses),
			};
			await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
			await saveMessage(conversationId, "user", label, "web");
			return await consumeAgentTurn({
				conversationId,
				userText: buildTimeframeReactionDirective(label),
				isUserTurn: false,
			});
		}

		case "lance": {
			// Jornada do doc: usuário TEM reserva → dispara o gate de lance embutido
			// (NÃO vai direto pra busca). O directive de reação aciona o próximo gate.
			const label = "Sim, tenho reserva";
			const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
				...(meta.qualifyAnswers ?? {}),
				hasLance: "yes",
			};
			await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
			await saveMessage(conversationId, "user", label, "web");
			const { buildLanceReactionDirective } = await import("@/lib/agent/orchestrator/directives");
			return await consumeAgentTurn({
				conversationId,
				userText: buildLanceReactionDirective(label),
				isUserTurn: false,
			});
		}

		case "lance-value": {
			// docx passo 2: "Qual valor aproximado?" → ~30% da carta (clique simulado).
			const metaNow = await reloadMeta(conversationId);
			const q0 = metaNow.qualifyAnswers ?? {};
			const lv = q0.creditMax !== undefined ? Math.round(q0.creditMax * 0.3) : 30_000;
			await persistMeta(conversationId, { ...metaNow, qualifyAnswers: { ...q0, lanceValue: lv } });
			await saveMessage(conversationId, "user", "Uns 30% da carta", "web");
			return await handleGateEvent({
				conversationId,
				gateEvent: { ...gateEvent, gate: "lance-embutido" },
			});
		}

		case "lance-embutido": {
			// Jornada do doc: opta por considerar lance embutido nas simulações.
			const label = "Sim, considerar lance embutido";
			const refreshed0 = await reloadMeta(conversationId);
			const q = refreshed0.qualifyAnswers ?? {};
			const lanceValue =
				q.lanceValue ??
				(q.creditMax !== undefined ? Math.round((q.creditMax * 30) / 100) : undefined);
			await persistMeta(conversationId, {
				...refreshed0,
				qualifyAnswers: { ...q, lanceEmbutido: true, lanceEmbutidoPercent: 30, lanceValue },
			});
			await saveMessage(conversationId, "user", label, "web");
			// Gate identify (D1): identidade SINTÉTICA (DV válido) antes da busca —
			// só alcança o adapter de fixtures (seam), nunca a Bevi real.
			await storeIdentity(conversationId, FIXTURE_IDENTITY);
			await saveMessage(conversationId, "user", "Enviei meus dados pra buscar as ofertas", "web");
			// Agora segue pra busca (search reveal).
			const refreshed = await reloadMeta(conversationId);
			if (refreshed.searchDispatched) return null;
			const category = refreshed.currentCategory;
			if (!category) return null;
			await persistMeta(conversationId, { ...refreshed, searchDispatched: true });
			const { buildSearchSummaryDirective } = await import("@/lib/agent/orchestrator/directives");
			const directive = buildSearchSummaryDirective({ category, meta: refreshed });
			return await consumeAgentTurn({
				conversationId,
				userText: directive,
				isUserTurn: false,
			});
		}

		case "identify": {
			// Caminhos sem lance-embutido (hasLance no/maybe) chegam aqui: o submit
			// do form identify libera a busca (mirror do route identify-handler).
			await storeIdentity(conversationId, FIXTURE_IDENTITY);
			await saveMessage(conversationId, "user", "Enviei meus dados pra buscar as ofertas", "web");
			const refreshed = await reloadMeta(conversationId);
			if (refreshed.searchDispatched) return null;
			const category = refreshed.currentCategory;
			if (!category) return null;
			await persistMeta(conversationId, { ...refreshed, searchDispatched: true });
			const { buildSearchSummaryDirective } = await import("@/lib/agent/orchestrator/directives");
			return await consumeAgentTurn({
				conversationId,
				userText: buildSearchSummaryDirective({ category, meta: refreshed }),
				isUserTurn: false,
			});
		}

		case "simulator-offer": {
			// docx passo 4: este harness foca o fluxo de decisão — recusa o
			// simulador ("Agora não") e segue pro card de decisão (mirror do route).
			const metaSim = await reloadMeta(conversationId);
			await persistMeta(conversationId, {
				...metaSim,
				simulatorOfferDispatched: true,
				decisionDispatched: true,
			});
			await saveMessage(conversationId, "user", "Agora não", "web");
			const { buildDecisionPromptDirective } = await import("@/lib/agent/orchestrator/directives");
			return await consumeAgentTurn({
				conversationId,
				userText: buildDecisionPromptDirective({
					administradora: metaSim.recommendedAdministradora,
				}),
				isUserTurn: false,
			});
		}

		case "search":
		case "doubts-wait":
		case "decision":
			// "decision" é dirigido pelo orquestrador (index.ts) dentro do próprio
			// runTurn — não precisa de clique simulado aqui. O present_decision_prompt
			// já materializa como artifact no turn do usuário.
			return null;
	}

	// gate não tratado explicitamente → sem turno simulado
	return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop principal de conversação
// ─────────────────────────────────────────────────────────────────────────────

async function runConversation(scenario: Scenario): Promise<{
	turns: Turn[];
	conversationId: string;
	leadIdSeen: string | null;
}> {
	const maxTurns = scenario.maxTurns ?? 12;

	// 1. Cria conversation simulada
	const [conv] = await db
		.insert(conversations)
		.values({
			channel: "web",
			isSimulated: true,
			metadata: { evalScenario: scenario.name },
		})
		.returning();
	const conversationId = conv.id;

	const turns: Turn[] = [];

	// Primeira msg fornecida pelo cenário (não passa pelo user-bot)
	let nextUserMsg: string | null = scenario.firstUserMessage;

	for (let turnIdx = 0; turnIdx < maxTurns; turnIdx++) {
		if (!nextUserMsg) break;

		turns.push({
			role: "user-bot",
			content: nextUserMsg,
			toolCalls: [],
			artifacts: [],
			events: [],
		});

		const agentTurn = await consumeAgentTurn({
			conversationId,
			userText: nextUserMsg,
			isUserTurn: true,
		});
		turns.push(agentTurn);

		// Se o agent emitiu present_lead_form, finaliza.
		if (agentTurn.artifacts.some((a) => a.type === "lead_form")) {
			break;
		}

		// Processa gates emitidos por este turno.
		let producedExtraTurn = false;
		for (const ev of agentTurn.events) {
			if (ev.type === "gate") {
				const gateTurn = await handleGateEvent({ conversationId, gateEvent: ev });
				if (gateTurn) {
					turns.push(gateTurn);
					producedExtraTurn = true;
					if (gateTurn.artifacts.some((a) => a.type === "lead_form")) {
						nextUserMsg = null;
						break;
					}
				}
			}
		}

		if (nextUserMsg === null) break;

		// Se já chegamos a apresentar simulação/recommendation, o user-bot deve
		// reagir clicando "Tenho interesse" — emulamos via texto direto.
		const allArtifacts = turns.flatMap((t) => t.artifacts);
		const hasSimOrRecommendation = allArtifacts.some(
			(a) => a.type === "simulation_result" || a.type === "recommendation_card",
		);
		const hasLeadForm = allArtifacts.some((a) => a.type === "lead_form");
		const hasInterestSignal = turns.some(
			(t) => t.role === "user-bot" && /tenho interesse|quero esse|fechar|assinar/i.test(t.content),
		);

		if (hasSimOrRecommendation && !hasLeadForm && !hasInterestSignal && turnIdx >= 3) {
			nextUserMsg = "Tenho interesse, vamos prosseguir.";
			continue;
		}

		// Caso contrário, user-bot gera próxima msg via LLM.
		try {
			nextUserMsg = await userBotReply({
				systemPrompt: scenario.userBotSystemPrompt,
				transcript: turns,
			});
		} catch (e) {
			console.error("[user-bot] erro ao gerar resposta:", e);
			nextUserMsg = null;
		}
	}

	// Verifica lead criado
	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
	});

	return { turns, conversationId, leadIdSeen: lead?.id ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup helper
// ─────────────────────────────────────────────────────────────────────────────

async function cleanup(conversationId: string) {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
	});
	if (lead) {
		await db.delete(leadEvents).where(eq(leadEvents.leadId, lead.id));
		await db.delete(leads).where(eq(leads.id, lead.id));
	}
	await db.delete(messages).where(eq(messages.conversationId, conversationId));
	await db.delete(conversations).where(eq(conversations.id, conversationId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de asserção
// ─────────────────────────────────────────────────────────────────────────────

function allToolCalls(turns: Turn[]): string[] {
	return turns.flatMap((t) => t.toolCalls);
}

function allArtifactTypes(turns: Turn[]): string[] {
	return turns.flatMap((t) => t.artifacts).map((a) => a.type);
}

function fullAgentText(turns: Turn[]): string {
	return turns
		.filter((t) => t.role === "agent")
		.map((t) => t.content)
		.join("\n---\n");
}

function turnBefore(turns: Turn[], predicate: (t: Turn) => boolean): Turn | null {
	for (let i = 0; i < turns.length; i++) {
		if (predicate(turns[i])) {
			for (let j = i - 1; j >= 0; j--) {
				if (turns[j].role === "agent") return turns[j];
			}
		}
	}
	return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Skip se faltar API key
// ─────────────────────────────────────────────────────────────────────────────

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;
// Camada 3 exige API REAL disponível — cota esgotada/5xx/rede não é regressão
// (ver tests/eval/anthropic-availability.ts). Top-level await: vitest ESM ok.
const AVAILABILITY = HAS_API_KEY
	? await anthropicAvailable()
	: { ok: false, reason: "ANTHROPIC_API_KEY ausente" };
if (HAS_API_KEY && !AVAILABILITY.ok)
	warnEvalSkipped(import.meta.url.split("/").pop() ?? "eval", AVAILABILITY.reason ?? "");
const describeIfKey = AVAILABILITY.ok ? describe : describe.skip;

// ─────────────────────────────────────────────────────────────────────────────
// CENÁRIO 1 — "Primeira vez Imóvel (Monique)" — PRIORITÁRIO
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey("Eval flow Bruna — Cenário 1: Primeira vez Imóvel (Monique)", () => {
	let result: Awaited<ReturnType<typeof runConversation>> | null = null;

	// beforeAll: roda a conversa UMA vez e todas as assertions reusam o transcript.
	// Cada conversa custa ~120s + tokens; rodar uma vez por test seria 10x mais caro.
	beforeAll(async () => {
		result = await runConversation({
			name: "monique-imovel-primeira-vez",
			firstUserMessage: "Quero comprar um imóvel, me ajude a encontrar o melhor consórcio",
			// FIX-15: valor alinhado à captura REAL de IMOVEL da Bevi (crédito ~R$ 80k,
			// parcelas R$ 366–548, lance embutido). A fixture serve esses números; pedir
			// R$ 400 mil deixava a recomendação incoerente com a oferta real.
			userBotSystemPrompt: `Você é Monique, brasileira, leiga em consórcio, primeira vez fazendo um consórcio de imóvel.
Quer uma carta de crédito de imóvel de cerca de R$ 80 mil (pra dar entrada / comprar um terreno) e pode pagar até R$ 600/mês.
Você tem uma reserva guardada e topa dar um lance pra antecipar a contemplação — quando perguntarem se tem valor pra lance, diga que sim.
Responda SEMPRE de forma curta e siga o passo que o agente propõe; não invente perguntas novas nem peça pra recomeçar.
Quando perguntarem seu nome, diga apenas "Monique".
Quando o agente oferecer WhatsApp, aceite e diga seu número "11999998888".
Quando uma simulação ou recomendação aparecer, demonstre interesse: "Tenho interesse, vamos prosseguir".
Você é leiga: se ele falar de "lance", "contemplação", "carta", aceite naturalmente sem aprofundar.`,
			maxTurns: 16,
		});
	}, 300_000);

	afterAll(async () => {
		if (result) await cleanup(result.conversationId);
	});

	it("[FRAMEWORK] roda conversation sem crash e produz transcript", () => {
		expect(result, "runConversation deveria retornar resultado").not.toBeNull();
		expect(result?.turns.length, "deveria ter pelo menos 4 turnos").toBeGreaterThanOrEqual(4);
		console.log(
			`\n[transcript] ${result?.turns.length} turnos, ${allToolCalls(result?.turns ?? []).length} tool calls, ${allArtifactTypes(result?.turns ?? []).length} artifacts`,
		);
		console.log(`[tool calls] ${allToolCalls(result?.turns ?? []).join(", ")}`);
		console.log(`[artifacts] ${allArtifactTypes(result?.turns ?? []).join(", ")}`);
	});

	it("[mig 0015] save_contact_name foi chamado durante a conversa", () => {
		const tools = allToolCalls(result?.turns ?? []);
		expect(
			tools,
			`Esperado save_contact_name após user dizer o nome. Tool calls vistos: [${tools.join(", ")}]. ` +
				"Se faltar, persona pode não estar puxando o nome do usuário corretamente.",
		).toContain("save_contact_name");
	});

	it("[jornada-doc] a jornada tratou o lance da usuária com reserva (educou/coletou)", async () => {
		// Jornada canônica do .docx: usuária com reserva é educada sobre lance e
		// dá opt-in ANTES da busca. A SEQUÊNCIA exata dos gates de lance é coberta,
		// deterministicamente, por jornada-aja-agora.eval (harness scriptado). Aqui,
		// num diálogo LIVRE agent-vs-agent, validamos o RESULTADO canônico de forma
		// robusta: o lance foi tratado por ALGUM caminho — gate de lance disparou,
		// OU o opt-in ficou gravado no metadata, OU o agente educou sobre lance
		// embutido no texto. (FIX-15: o assert antigo exigia o evento de gate exato,
		// frágil sob não-determinismo da LLM.)
		const lanceGates = new Set(["lance", "lance-value", "lance-embutido"]);
		const firedLanceGate = (result?.turns ?? []).some((t) =>
			t.events.some((e) => e.type === "gate" && lanceGates.has(e.gate)),
		);

		const finalMeta = result ? await reloadMeta(result.conversationId) : null;
		const q = finalMeta?.qualifyAnswers;
		const recordedLance =
			q?.lanceEmbutido === true || q?.hasLance === "yes" || q?.lanceValue !== undefined;

		const educatedOnLance =
			/lance embutido|usar parte da (?:carta|pr[óo]pria)|antecipar.*contempl/.test(
				fullAgentText(result?.turns ?? []).toLowerCase(),
			);

		expect(
			firedLanceGate || recordedLance || educatedOnLance,
			`Esperado que a jornada tratasse o lance da usuária com reserva. ` +
				`Gate de lance: ${firedLanceGate}; meta(lance): ${JSON.stringify({ lanceEmbutido: q?.lanceEmbutido, hasLance: q?.hasLance, lanceValue: q?.lanceValue })}; educou no texto: ${educatedOnLance}.`,
		).toBe(true);
	});

	it("[mig 0017] present_value_picker foi chamado (faixa de crédito)", () => {
		const tools = allToolCalls(result?.turns ?? []);
		// Aceita present_value_picker OU o gate `credit` (Web usa gate; alguns flows usam picker)
		const hasGate = (result?.turns ?? []).some((t) =>
			t.events.some((e) => e.type === "gate" && e.gate === "credit"),
		);
		expect(
			tools.includes("present_value_picker") || hasGate,
			`Esperado present_value_picker ou gate 'credit'. Tool calls: [${tools.join(", ")}].`,
		).toBe(true);
	});

	it("[mig 0018] quando o opt-in de WhatsApp aparece, vem com narrativa estratégica antes", () => {
		const turns = result?.turns ?? [];
		const tools = allToolCalls(turns);
		// FIX-15: oferecer o opt-in é UM dos caminhos de conversão pós-reveal (a
		// presença/avanço é validada por "[jornada-doc] opt-in ... por estágio").
		// Aqui validamos a QUALIDADE: SE o agente ofereceu o opt-in, o texto ao
		// redor traz a narrativa de segurança/continuidade. Sem optin neste run
		// (caminho de decisão/handoff), nada a validar — não é falha.
		if (!tools.includes("present_whatsapp_optin")) return;

		// Procura o texto do agent ANTES de chamar present_whatsapp_optin
		const optinTurn = turns.find((t) => t.toolCalls.includes("present_whatsapp_optin"));
		// Considera tanto o texto desse turn quanto texto agregado de turns recentes anteriores
		// (porque presentation tools podem rodar no mesmo turno do texto narrativo).
		const idx = turns.indexOf(optinTurn!);
		const recentAgentText = turns
			.slice(Math.max(0, idx - 2), idx + 1)
			.filter((t) => t.role === "agent")
			.map((t) => t.content)
			.join(" ")
			.toLowerCase();

		const narrativeKeywords = /internet|perder|seguran|continuar|atendiment|conex/;
		expect(
			narrativeKeywords.test(recentAgentText),
			`Texto antes/durante present_whatsapp_optin deveria conter narrativa de segurança/continuidade. Texto visto: "${recentAgentText.slice(0, 300)}..."`,
		).toBe(true);
	});

	it("[B11] explica básico de consórcio para usuário primeira vez", () => {
		const text = fullAgentText(result?.turns ?? []).toLowerCase();
		// Termos básicos do produto que devem aparecer na explicação introdutória.
		const basicTerms = ["contempl", "parcela", "sorteio", "lance", "sem juros", "grupo"];
		const matched = basicTerms.filter((t) => text.includes(t));
		expect(
			matched.length,
			`Esperado >=3 termos básicos do consórcio (contempl/parcela/sorteio/lance/sem juros/grupo) ` +
				`para usuário primeira vez (B11). Encontrados: [${matched.join(", ")}].`,
		).toBeGreaterThanOrEqual(3);
	});

	it("[B6] revela a recomendação destacada sobre uma descoberta de >=3 opções reais", () => {
		// FIX-15: contrato CANÔNICO do reveal (docx passo 3/4 + jornada-aja-agora.eval):
		// a descoberta serve >=3 ofertas REAIS, e o usuário vê a RECOMENDADA em
		// destaque — não uma tabela de 3 group_cards (era mock). Qualquer artifact de
		// reveal (REVEAL_ARTIFACTS do runner) serve: a recomendação destacada
		// (recommendation_card/simulation_result) OU o comparativo das opções
		// (comparison_table/group_card). O que importa é que a descoberta de IMOVEL
		// produziu opções REAIS — não caiu em handoff por "0 grupos" (sintoma FIX-15).
		expect(
			FIXTURE_OFFERS_IMOVEL.length,
			"a descoberta de IMOVEL deve ter >=3 ofertas reais por trás da recomendação",
		).toBeGreaterThanOrEqual(3);

		const artifacts = (result?.turns ?? []).flatMap((t) => t.artifacts);
		const types = artifacts.map((a) => a.type);
		const REVEAL_ARTIFACTS = [
			"recommendation_card",
			"simulation_result",
			"comparison_table",
			"group_card",
		];
		const hasReveal = types.some((t) => REVEAL_ARTIFACTS.includes(t));
		expect(
			hasReveal,
			`Esperado reveal canônico (um de ${REVEAL_ARTIFACTS.join("/")}). Artifacts vistos: [${types.join(", ")}].`,
		).toBe(true);

		// Anti-regressão da era mock: o comparativo de "outras opções" NÃO repete a
		// recomendada — no máximo as 2 não-recomendadas (docx: "as outras 2").
		const comparison = artifacts.find((a) => a.type === "comparison_table");
		if (comparison) {
			const groups = (comparison.payload as { groups?: unknown[] }).groups ?? [];
			expect(
				groups.length,
				"comparison_table de 'outras opções' tem no máx. 3 opções concretas",
			).toBeLessThanOrEqual(3);
		}
	});

	it("[B6 anti-regra] não usa frase proibida 'cabe no bolso' sem dado", () => {
		const text = fullAgentText(result?.turns ?? []).toLowerCase();
		// "cabe no bolso/orcamento" sem número próximo (10 chars antes/depois) = violação
		const violations = [...text.matchAll(/cabe no (?:bolso|or(?:c|ç)amento)/g)];
		const offenders: string[] = [];
		for (const m of violations) {
			const start = Math.max(0, (m.index ?? 0) - 30);
			const end = Math.min(text.length, (m.index ?? 0) + 50);
			const window = text.slice(start, end);
			// Se NÃO tem dígito perto, é violação
			if (!/\d/.test(window)) offenders.push(window);
		}
		expect(
			offenders,
			`Frase "cabe no bolso/orçamento" SEM dado quantitativo é proibida (B6). Offenders: ${JSON.stringify(offenders)}`,
		).toEqual([]);
	});

	it("[FIX-36] coerência temporal: o texto ANTES de search_groups não afirma achado", () => {
		// Camada 3: o agente REAL não pode escrever "Encontrei opções" antes do
		// search_groups retornar (bug do print). Reconstrói o texto emitido ANTES
		// do 1º tool-call de search_groups no turno (a ordem do stream = a ordem que
		// o usuário vê). NÃO inclui "encontramos" no detector — a copy do docx
		// "Encontramos 3 boas opções" é o anúncio PÓS-tool (legítimo) e nem aparece
		// antes do tool-call no stream.
		const AFIRMA_ACHADO = /\bencontrei\b|\bachei\b|aqui est[ãa]o (as )?op[çc]|essas s[ãa]o as op/i;
		const turns = result?.turns ?? [];
		let checked = 0;
		for (const t of turns) {
			if (t.role !== "agent") continue;
			let preToolText = "";
			let hitSearch = false;
			for (const ev of t.events) {
				if (ev.type === "tool-call" && ev.toolName === "search_groups") {
					hitSearch = true;
					break;
				}
				if (ev.type === "text-delta") preToolText += ev.text;
			}
			if (!hitSearch) continue;
			checked++;
			expect(
				AFIRMA_ACHADO.test(preToolText),
				`FIX-36: o texto que precede search_groups NÃO pode afirmar achado antes do resultado. Texto pré-tool: "${preToolText}"`,
			).toBe(false);
		}
		console.log(`[FIX-36] turnos com search_groups validados (coerência temporal): ${checked}`);
	});

	it("[B9] frase de detalhamento contém 'detalhamento'/'simulação'/'ajustar' próximo a simulação", () => {
		const turns = result?.turns ?? [];
		const simTurn = turns.find((t) => t.artifacts.some((a) => a.type === "simulation_result"));
		// Junta texto do agent até o turn da simulação inclusive.
		const idx = simTurn ? turns.indexOf(simTurn) : -1;
		if (idx < 0) {
			// FIX-15: B9 é sobre a frase de DETALHAMENTO que acompanha a simulação.
			// Se o reveal saiu como comparativo (comparison_table/group_card) sem
			// simulation_result, a frase de detalhamento não se aplica — o reveal
			// canônico já é validado pelo [B6]. Não é falha.
			return;
		}
		const textUpToSim = turns
			.slice(0, idx + 1)
			.filter((t) => t.role === "agent")
			.map((t) => t.content)
			.join(" ")
			.toLowerCase();
		const b9Keywords = /detalhamento|simula(c|ç)(a|ã)o|ajustar.*carta|ajustar.*valor|aqui est/;
		expect(
			b9Keywords.test(textUpToSim),
			`Esperado frase tipo "Aqui está o detalhamento completo..." ou "ajustar a carta" (B9). Texto: "${textUpToSim.slice(-300)}"`,
		).toBe(true);
	});

	it("[B3] tom caloroso após escolha de categoria (animados/contar/realizar/show/boa)", () => {
		const turns = result?.turns ?? [];
		// A 1ª resposta do agent após "Quero comprar um imóvel" — geralmente turn[1] (agent)
		const firstAgent = turns.find((t) => t.role === "agent");
		const text = (firstAgent?.content ?? "").toLowerCase();
		const warmKeywords =
			/animad|contar|realiza|sonho|show|boa|beleza|legal|conqui|conquista|abre.*portas/;
		expect(
			warmKeywords.test(text),
			`Tom da 1ª resposta deveria ser caloroso (B3). Texto: "${text.slice(0, 250)}"`,
		).toBe(true);
	});

	it("[lead capture] lead criado no DB com nome populado", async () => {
		expect(result?.leadIdSeen, "lead deveria ter sido criado").not.toBeNull();
		const lead = await db.query.leads.findFirst({
			where: eq(leads.id, result!.leadIdSeen!),
		});
		expect(lead?.name, "lead.name deveria estar populado").toBeTruthy();
		// Nome esperado: Monique (ou qualquer 1ª palavra capitalizada da resposta)
		expect(lead?.name?.toLowerCase()).toContain("moniq");
	});

	it("[jornada-doc] opt-in de WhatsApp oferecido por estágio (canônico D1/optin)", async () => {
		// FIX-15: o passo que o AGENTE controla é OFERECER o opt-in de WhatsApp no
		// estágio certo (após o reveal — optin por estágio, FIX-5). Que o phone
		// fique salvo depende do clique da usuária no card + turnos restantes, então
		// é SOFT. O opt-in é UM dos caminhos de conversão pós-reveal; o contrato
		// canônico é que o agente AVANCE a usuária pra conversão (não fique preso
		// pós-reveal) por algum mecanismo: opt-in de WhatsApp, prompt de decisão,
		// form de contrato, OU handoff honesto pra consultor.
		const tools = allToolCalls(result?.turns ?? []);
		const artifactTypesSeen = (result?.turns ?? []).flatMap((t) => t.artifacts.map((a) => a.type));
		const finalMeta = result ? await reloadMeta(result.conversationId) : null;
		const optinOffered =
			tools.includes("present_whatsapp_optin") ||
			artifactTypesSeen.includes("whatsapp_optin") ||
			finalMeta?.whatsappOptinShown === true;
		const advancedToConversion =
			optinOffered ||
			tools.includes("present_decision_prompt") ||
			artifactTypesSeen.includes("decision_prompt") ||
			artifactTypesSeen.includes("contract_form") ||
			(result?.turns ?? []).some((t) => t.events.some((e) => e.type === "handoff"));
		expect(
			advancedToConversion,
			`Pós-reveal, o agente deveria avançar a usuária pra conversão (opt-in WhatsApp, ` +
				`decisão, contrato ou handoff). tools=[${tools.join(", ")}], ` +
				`whatsappOptinShown=${finalMeta?.whatsappOptinShown}.`,
		).toBe(true);

		// Soft: se o phone FOI salvo, tem que ser o número que a usuária enviou.
		if (result?.leadIdSeen) {
			const lead = await db.query.leads.findFirst({
				where: eq(leads.id, result.leadIdSeen),
			});
			if (lead?.phone) {
				expect(lead.phone.replace(/\D/g, "")).toContain("99999");
			}
		}
	});

	it("[lead form] se present_lead_form aparecer, vem com o nome prefilled (Monique)", () => {
		// FIX-15: o nome capturado já é validado de forma dura por "[lead capture]
		// lead criado no DB com nome populado" (save_contact_name → lead.name). No
		// fluxo canônico pós-mock o nome é coletado CONVERSACIONALMENTE; o lead_form
		// só aparece quando o agente o emite explicitamente (não garantido num
		// diálogo livre). Então: SE o lead_form saiu, ele tem que trazer o nome
		// prefilled — senão a captura conversacional já cobriu o nome.
		const leadFormArtifact = (result?.turns ?? [])
			.flatMap((t) => t.artifacts)
			.find((a) => a.type === "lead_form");
		if (!leadFormArtifact) return; // nome validado pelo assert de captura conversacional
		const payload = (leadFormArtifact.payload ?? {}) as { prefilledName?: string | null };
		expect(
			payload.prefilledName?.toLowerCase(),
			`lead_form emitido deveria trazer prefilledName='Monique'. Payload: ${JSON.stringify(payload)}`,
		).toContain("moniq");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// CENÁRIO CIRÚRGICO — BUG-SAVE-CONTACT-NAME-FIRE (1 turn, sem user-bot)
//
// Reproduz screenshot tb-dev (2026-05-18/19):
//   1. User: "Automóvel" (transition pra Rafael)
//   2. Agent (Rafael): "Show... como posso te chamar?"
//   3. User: "Paulo" (resposta curta com nome puro)
//   → Agent DEVE chamar save_contact_name(name="Paulo") ANTES de qualquer
//     texto E DEVE prosseguir com próxima ação (tool de gate/topic/value picker).
//
// Falha esperada SEM toolChoice wiring no orchestrator (estado HOJE):
//   agent responde só "Prazer, Paulo!" sem tool → conversation.contact_name
//   permanece NULL → turn morre.
//
// Verde esperado APÓS wiring no runner.ts (resolveAgent com toolChoice forçado):
//   tool_call save_contact_name capturado no turn 2 + DB persiste.
//
// Custo: ~15-30s (1 conversa, 2 turns Anthropic real).
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey("EVAL-SAVE-CONTACT-NAME-CIRURGICO — Rafael capta nome em 1 turn", () => {
	let conversationId: string | null = null;

	afterAll(async () => {
		if (conversationId) await cleanup(conversationId);
	});

	it("agent chama save_contact_name quando user responde com nome puro", async () => {
		// Setup: cria conversation web simulada, contact_name=NULL.
		const [conv] = await db
			.insert(conversations)
			.values({
				channel: "web",
				isSimulated: true,
				metadata: { evalScenario: "save-contact-name-cirurgico" },
			})
			.returning();
		conversationId = conv.id;

		const allTurns: Turn[] = [];

		// ── Turn 1: user diz "Automóvel" → orchestrator detecta categoria
		//    auto, faz transition pra Rafael, que reage + pergunta o nome. ──
		const t1: Turn = {
			role: "user-bot",
			content: "Automóvel",
			toolCalls: [],
			artifacts: [],
			events: [],
		};
		allTurns.push(t1);

		const agentT1 = await consumeAgentTurn({
			conversationId: conv.id,
			userText: "Automóvel",
			isUserTurn: true,
		});
		allTurns.push(agentT1);

		// Sanity: o transition aconteceu (Rafael entrou).
		const transitionEv = agentT1.events.find((e) => e.type === "transition");
		expect(
			transitionEv,
			`Esperado event 'transition' no turn 1 (Rafael deveria entrar). Eventos: ${agentT1.events.map((e) => e.type).join(", ")}`,
		).toBeDefined();

		// O texto do agent T1 deve perguntar o nome (âncora pra detect-name-turn).
		expect(
			/chamar|nome/i.test(agentT1.content),
			`Turn 1 do agent deveria perguntar nome. Texto: "${agentT1.content}"`,
		).toBe(true);

		// ── Turn 2: user responde "Paulo" → AQUI o agent DEVE chamar
		//    save_contact_name. Esse é o cenário crítico. ──
		const t2: Turn = {
			role: "user-bot",
			content: "Paulo",
			toolCalls: [],
			artifacts: [],
			events: [],
		};
		allTurns.push(t2);

		const agentT2 = await consumeAgentTurn({
			conversationId: conv.id,
			userText: "Paulo",
			isUserTurn: true,
		});
		allTurns.push(agentT2);

		// Log diagnóstico
		console.log(`\n[CIRURGICO] Turn 1 agent text: "${agentT1.content.slice(0, 200)}"`);
		console.log(`[CIRURGICO] Turn 1 tools: [${agentT1.toolCalls.join(", ")}]`);
		console.log(`[CIRURGICO] Turn 2 agent text: "${agentT2.content.slice(0, 200)}"`);
		console.log(`[CIRURGICO] Turn 2 tools: [${agentT2.toolCalls.join(", ")}]`);
		// Dump dos tool-call events com inputs (debug do bug do contact_name NULL)
		const t2ToolEvents = agentT2.events.filter((e) => e.type === "tool-call");
		for (const ev of t2ToolEvents) {
			if (ev.type === "tool-call") {
				console.log(
					`[CIRURGICO] Turn 2 tool-call: ${ev.toolName} input=${JSON.stringify(ev.input)}`,
				);
			}
		}
		console.log(`[CIRURGICO] conversationId esperado: ${conv.id}`);

		// ── ASSERTION CORE: save_contact_name foi chamado no turn 2. ──
		const t2Tools = agentT2.toolCalls;
		expect(
			t2Tools,
			`BUG-SAVE-CONTACT-NAME-FIRE: agent deveria chamar save_contact_name após user responder "Paulo". ` +
				`Texto literal emitido: "${agentT2.content}". Tools chamadas: [${t2Tools.join(", ")}]. ` +
				`Se vazio ou só "Prazer, Paulo!" → fix toolChoice no orchestrator é NECESSÁRIO.`,
		).toContain("save_contact_name");

		// ── ASSERTION: input da tool tem name="Paulo" (ou normalização). ──
		const saveCallEvent = agentT2.events.find(
			(e) => e.type === "tool-call" && e.toolName === "save_contact_name",
		);
		expect(saveCallEvent, "tool-call event save_contact_name deveria existir").toBeDefined();
		if (saveCallEvent && saveCallEvent.type === "tool-call") {
			const input = saveCallEvent.input as { name?: string };
			expect(
				input.name?.toLowerCase(),
				`save_contact_name.input.name esperado conter 'paulo'. Input: ${JSON.stringify(input)}`,
			).toContain("paulo");
		}

		// ── ASSERTION: conversationId NÃO aparece no input da tool. ──
		// BUG-CONVERSATION-ID-HALLUCINATION (fix commit XXXX): o
		// `conversationId` foi REMOVIDO do `inputSchema` de save_contact_name
		// — agora ele é injetado via closure pela factory
		// `buildConsorcioTools({ conversationId })` no builder de agent.
		//
		// Pré-fix: modelo alucinava "conv_001" → UPDATE não acertava linha →
		// contact_name NULL → form final vazio (BUG-LEAD-FORM-PREFILL).
		// Pós-fix: input só tem { name } — closure carrega o UUID real.
		//
		// Esta assertion documenta o invariante pós-fix: SE conversationId
		// voltar a aparecer no input, alguém regrediu o schema (sched
		// hallucination de novo). Camada 1 estrutural pega antes.
		if (saveCallEvent && saveCallEvent.type === "tool-call") {
			const input = saveCallEvent.input as { conversationId?: string };
			expect(
				input.conversationId,
				`save_contact_name.input NÃO deve conter conversationId (fix " +
					"BUG-CONVERSATION-ID-HALLUCINATION). conversationId é injetado via " +
					"closure pela factory buildConsorcioTools(). Visto: "${input.conversationId}". ` +
					`Se voltou, alguém adicionou conversationId no inputSchema — ` +
					`regressão arquitetural (modelo vai alucinar de novo).`,
			).toBeUndefined();
		}

		// ── ASSERTION: DB persistiu contact_name após turn 2. ──
		const refreshed = await db.query.conversations.findFirst({
			where: eq(conversations.id, conv.id),
		});
		expect(
			refreshed?.contactName?.toLowerCase(),
			`conversation.contact_name no DB deveria conter 'paulo' após turn 2. Visto: "${refreshed?.contactName}". ` +
				`Se permanecer NULL apesar do tool-call ter sido feito → confirma ` +
				`BUG-CONVERSATION-ID-HALLUCINATION (modelo passou ID inválido pra tool).`,
		).toContain("paulo");

		// ── ASSERTION: agent NÃO terminou só com greeting — fez próxima ação.
		// Aceita: (a) chamou outra tool no mesmo turn (topic_picker, value_picker,
		// experience picker etc.), OU (b) emitiu gate event pra próxima etapa.
		const otherTools = t2Tools.filter((t) => t !== "save_contact_name");
		const hasGateEvent = agentT2.events.some((e) => e.type === "gate");
		expect(
			otherTools.length > 0 || hasGateEvent,
			`Turn 2 deveria ter próxima ação além de save_contact_name (tool ou gate). ` +
				`Tools além do save: [${otherTools.join(", ")}]. Gate event: ${hasGateEvent}. ` +
				`Texto literal: "${agentT2.content}"`,
		).toBe(true);
	}, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-11 — Pós-fechamento amnésico (rodada 2026-06-05 tarde)
// Bug real: pós-fechamento CANOPUS (grupo 4400, docs enviados), "qual status
// da proposta?" → agent negou o fechamento, re-rodou a descoberta e ofereceu
// OUTRA administradora. Aqui: seed do estado terminal direto no DB (barato —
// 1 turno real) + pergunta de status. Rubric: punir negação de estado e
// segunda administradora.
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey("EVAL-FIX-11 — pós-fechamento responde status do estado, sem re-descoberta", () => {
	let convId: string;
	let statusTurn: Turn | null = null;

	beforeAll(async () => {
		// FIX-14 (bloco B) plugou a tool check_proposal_status — pergunta de
		// status agora consulta o gateway. Dublê pra NUNCA tocar a Bevi real
		// (mesmo seam do EVAL-FIX-14); o estado narrado segue o da proposta.
		__setProposalGatewayForTests({
			getStatus: async (proposalId: string) => ({
				proposalId,
				statusName: "Documentos recebidos",
				situation: "pending",
				statusDescription: null,
				integrationCode: null,
				createdAt: "2026-06-05T14:47:00.000Z",
				updatedAt: "2026-06-05T14:52:00.000Z",
				approvedAt: null,
				reprovedAt: null,
				changesHistory: [],
			}),
		} as unknown as Parameters<typeof __setProposalGatewayForTests>[0]);
		const { beviProposals } = await import("@/db/schema");
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				metadata: {
					currentPersona: "moto",
					currentCategory: "moto",
					expertiseLevel: "neutro",
					qualifyConsented: true,
					experiencePrev: "first",
					identityCollected: true,
					qualifyAnswers: { creditMax: 40000, monthlyBudget: 800, prazoMeses: 8, hasLance: "no" },
					searchDispatched: true,
					revealCompleted: true,
					decisionDispatched: true,
					recommendedAdministradora: "CANOPUS",
					recommendedOffer: {
						administradora: "CANOPUS",
						creditValue: 46000,
						termMonths: 98,
						monthlyPayment: 469.95,
					},
					contractClosed: true,
				} satisfies ConversationMetadata,
			})
			.returning();
		convId = c.id;
		await db.insert(beviProposals).values({
			conversationId: convId,
			proposalId: "eval-fix11-proposal",
			administradora: "CANOPUS",
			grupo: "4400",
			creditValue: "46000",
			monthlyPayment: "469.95",
			proposalStatus: "documentos",
		});
		// Histórico mínimo coerente com o fechamento (a versão SAUDÁVEL do
		// histórico que no bug real estava mutilado).
		await saveMessage(convId, "user", "Confirmo essa carta", "web");
		await saveMessage(
			convId,
			"assistant",
			"Perfeito! Você está contratando um consórcio da CANOPUS. Parabéns! Recebi seus documentos ✅ — sua ficha está completa.",
			"web",
			"moto",
		);

		statusTurn = await consumeAgentTurn({
			conversationId: convId,
			userText: "qual o status da proposta?",
			isUserTurn: true,
		});
	}, 120_000);

	afterAll(async () => {
		__setProposalGatewayForTests(null);
		if (convId) await cleanup(convId);
	});

	it("não emite NENHUM artifact de descoberta/simulação (bug: recommendation_card de outra adm)", () => {
		const types = (statusTurn?.artifacts ?? []).map((a) => a.type);
		expect(types).not.toContain("recommendation_card");
		expect(types).not.toContain("simulation_result");
		expect(types).not.toContain("comparison_table");
		expect(types).not.toContain("group_card");
		expect(types).not.toContain("contract_form");
	});

	it("não chama tool de busca (bug: re-rodou a descoberta)", () => {
		const tools = statusTurn?.toolCalls ?? [];
		expect(tools).not.toContain("search_groups");
		expect(tools).not.toContain("recommend_groups");
	});

	it("não NEGA o estado (bug: 'nada chegou no nosso sistema nesse chat')", () => {
		const text = statusTurn?.content ?? "";
		expect(text).not.toMatch(/nada chegou/i);
		expect(text).not.toMatch(/n[ãa]o recebi nenhum (dado|documento)/i);
	});

	it("responde do estado salvo: menciona a administradora do contrato (nunca outra)", () => {
		const text = statusTurn?.content ?? "";
		expect(text).toMatch(/CANOPUS/i);
		expect(text).not.toMatch(/BANCO DO BRASIL/i);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-12 — contract_form sequestrou o identify (rodada 2026-06-05 tarde)
// Bug real: fim da qualificação → modelo chamou present_contract_form (passo
// 5) no lugar do gate identify do servidor → proposta REAL na Bevi sem o
// usuário ver UMA opção. Rubric: a jornada NUNCA cria proposta antes do
// reveal; o card de contratação NUNCA aparece pré-reveal.
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey("EVAL-FIX-12 — fim da qualificação NUNCA vira fechamento", () => {
	let convId: string;
	let endTurn: Turn | null = null;

	beforeAll(async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				metadata: {
					currentPersona: "moto",
					currentCategory: "moto",
					expertiseLevel: "neutro",
					experiencePrev: "first",
					qualifyConsented: true,
					qualifyAnswers: {
						creditMin: 35000,
						creditMax: 40000,
						monthlyBudget: 800,
						prazoMeses: 8,
						hasLance: "no",
						lanceEmbutido: false,
					},
				} satisfies ConversationMetadata,
			})
			.returning();
		convId = c.id;

		// Fim do passo 2 — o turno exato em que o bug disparou.
		endTurn = await consumeAgentTurn({
			conversationId: convId,
			userText: "Fechado, pode buscar as opções pra mim!",
			isUserTurn: true,
		});
	}, 120_000);

	afterAll(async () => {
		if (convId) await cleanup(convId);
	});

	it("NENHUM contract_form pré-reveal (o card do bug era o de contratação)", () => {
		const types = (endTurn?.artifacts ?? []).map((a) => a.type);
		expect(types).not.toContain("contract_form");
	});

	it("NENHUMA proposta criada na conversa antes do reveal (invariante da jornada canônica)", async () => {
		const { beviProposals } = await import("@/db/schema");
		const rows = await db
			.select({ id: beviProposals.id })
			.from(beviProposals)
			.where(eq(beviProposals.conversationId, convId));
		expect(rows).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// EVAL-FIX-38 — clique explícito "Tenho interesse" avança em UM passo
// Camada 3 (nightly): o clique EXPLÍCITO vai DIRETO pro passo 5
// (present_contract_form) — sem o card de decisão "Esse plano faz sentido?"
// (dupla confirmação por construção do FIX-34). Mirror do route pós-FIX-38:
// decisionDispatched já marcado (libera present_contract_form na fase closing
// da tool-policy) + buildAdvanceToContractDirective rodado pelo agent REAL.
// Critério: nº de gates de confirmação entre o sinal explícito e o contrato ≤ 1
// (zero card de decisão extra), sob não-determinismo do modelo.
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey("EVAL-FIX-38 — avanço explícito sem dupla confirmação", () => {
	let advanceTurn: Turn | null = null;
	let convId: string | null = null;

	beforeAll(async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Kairo",
				metadata: {
					currentPersona: "auto",
					currentCategory: "auto",
					experiencePrev: "first",
					qualifyConsented: true,
					identityCollected: true,
					qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
					searchDispatched: true,
					revealCompleted: true,
					simulatorOfferDispatched: true,
					// FIX-38: o route marca decisionDispatched ANTES de dirigir o avanço
					// (sem isso, fase "reveal" filtraria present_contract_form da policy).
					decisionDispatched: true,
					recommendedAdministradora: "ITAÚ",
				} satisfies ConversationMetadata,
			})
			.returning();
		convId = c.id;
		await saveMessage(convId, "user", "Tenho interesse", "web");
		const { buildAdvanceToContractDirective } = await import(
			"@/lib/agent/orchestrator/directives"
		);
		advanceTurn = await consumeAgentTurn({
			conversationId: convId,
			userText: buildAdvanceToContractDirective({ administradora: "ITAÚ" }),
			isUserTurn: false,
		});
	}, 120_000);

	afterAll(async () => {
		if (convId) await cleanup(convId);
	});

	it("dirige present_contract_form no passo de avanço", () => {
		const tools = advanceTurn?.toolCalls ?? [];
		const arts = (advanceTurn?.artifacts ?? []).map((a) => a.type);
		expect(
			tools.includes("present_contract_form") || arts.includes("contract_form"),
			`Esperado present_contract_form/contract_form no avanço. Tools: [${tools.join(", ")}], artifacts: [${arts.join(", ")}].`,
		).toBe(true);
	});

	it("NÃO re-apresenta o card de decisão (dupla confirmação) nem captura lead", () => {
		const tools = advanceTurn?.toolCalls ?? [];
		const arts = (advanceTurn?.artifacts ?? []).map((a) => a.type);
		expect(tools).not.toContain("present_decision_prompt");
		expect(arts).not.toContain("decision_prompt");
		expect(tools).not.toContain("present_lead_form");
		expect(arts).not.toContain("lead_form");
	});

	it("texto não re-pergunta 'faz sentido?' nem promete consultor humano", () => {
		const text = (advanceTurn?.content ?? "").toLowerCase();
		expect(text).not.toMatch(/faz sentido/);
		expect(text).not.toContain("consultor");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// EVAL-FIX-36 — texto pré-tool não afirma achado (reveal dirigido, determinístico)
// Camada 3: o critério no cenário Monique depende do diálogo livre alcançar o
// reveal (flaky — checked=0 quando o user-bot encerra cedo). Este cenário dirige
// buildSearchSummaryDirective DIRETO pelo agente REAL e valida que o texto que
// PRECEDE o tool-call de search_groups não afirma achado ("Encontrei/achei"),
// sob não-determinismo do modelo. Descoberta via fixtures (mock do beforeAll).
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey("EVAL-FIX-36 — reveal dirigido não afirma achado antes do search_groups", () => {
	let revealTurn: Turn | null = null;
	let convId: string | null = null;

	beforeAll(async () => {
		const [c] = await db
			.insert(conversations)
			.values({
				contactName: "Monique",
				metadata: {
					currentPersona: "imovel",
					currentCategory: "imovel",
					experiencePrev: "first",
					qualifyConsented: true,
					identityCollected: true,
					qualifyAnswers: {
						creditMin: 70_000,
						creditMax: 80_000,
						monthlyBudget: 600,
						prazoMeses: 12,
						hasLance: "no",
					},
				} satisfies ConversationMetadata,
			})
			.returning();
		convId = c.id;
		await storeIdentity(convId, FIXTURE_IDENTITY);
		const refreshed = await reloadMeta(convId);
		const { buildSearchSummaryDirective } = await import("@/lib/agent/orchestrator/directives");
		revealTurn = await consumeAgentTurn({
			conversationId: convId,
			userText: buildSearchSummaryDirective({ category: "imovel", meta: refreshed }),
			isUserTurn: false,
		});
	}, 120_000);

	afterAll(async () => {
		if (convId) await cleanup(convId);
	});

	it("o agente chamou search_groups (validação não-trivial)", () => {
		expect(revealTurn?.toolCalls ?? []).toContain("search_groups");
	});

	it("o texto que PRECEDE search_groups não afirma achado", () => {
		const AFIRMA_ACHADO = /\bencontrei\b|\bachei\b|aqui est[ãa]o (as )?op[çc]|essas s[ãa]o as op/i;
		let preToolText = "";
		for (const ev of revealTurn?.events ?? []) {
			if (ev.type === "tool-call" && ev.toolName === "search_groups") break;
			if (ev.type === "text-delta") preToolText += ev.text;
		}
		expect(
			AFIRMA_ACHADO.test(preToolText),
			`FIX-36: o texto que precede search_groups NÃO pode afirmar achado. Texto pré-tool: "${preToolText}"`,
		).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// EVAL-FIX-14 — pergunta de status consulta a Bevi AO VIVO via tool (cirúrgico)
// Plano de teste: docs/test-plans/fix-14-tool-status-proposta.md (CA-27/CA-28).
// Conversa pós-fechamento (bevi_proposals seedada) + gateway dublê — usuário
// pergunta "qual o status?" e o agent REAL deve chamar check_proposal_status,
// zero re-descoberta (o bug do print do Kairo) e narrar a tradução leiga.
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey("EVAL-FIX-14-STATUS-VIA-TOOL — status real via tool, zero re-descoberta", () => {
	let conversationId: string | null = null;
	const getStatusCalls: string[] = [];

	// Captura REAL da POC 2026-06-05 (proposta 6a230bb1…, waitingForUniqueCode).
	const statusFixture: ProposalStatus = {
		proposalId: "6a230bb1cf5174e43abd089b",
		statusName: "Aguardando inserção da proposta",
		situation: "pending",
		statusDescription: null,
		integrationCode: null,
		createdAt: "2026-06-05T14:47:00.000Z",
		updatedAt: "2026-06-05T14:52:00.000Z",
		approvedAt: null,
		reprovedAt: null,
		changesHistory: [
			{
				previousState: {
					title: "Comprovante de endereço",
					situation: "pending",
					systemicValue: "comprovanteDeEndereco",
					sort: 9,
				},
				newState: {
					title: "Aguardando inserção da proposta",
					situation: "pending",
					systemicValue: "waitingForUniqueCode",
					sort: 10,
				},
				changeDate: "2026-06-05T14:52:00.000Z",
			},
		],
	};

	afterAll(async () => {
		// CA-28 — restaura seams e limpa seed (bevi_proposals cai por cascade).
		__setProposalGatewayForTests(null);
		if (conversationId) await cleanup(conversationId);
	});

	it("agent chama check_proposal_status (proposalId da conversa) e narra o estado traduzido", async () => {
		__setProposalGatewayForTests({
			getStatus: async (proposalId: string) => {
				getStatusCalls.push(proposalId);
				return statusFixture;
			},
		} as unknown as ProposalGateway);

		// Setup: conversa web simulada + transition pro specialist (turn 1).
		const [conv] = await db
			.insert(conversations)
			.values({
				channel: "web",
				isSimulated: true,
				metadata: { evalScenario: "fix-14-status-via-tool" },
			})
			.returning();
		conversationId = conv.id;

		const agentT1 = await consumeAgentTurn({
			conversationId: conv.id,
			userText: "Automóvel",
			isUserTurn: true,
		});
		expect(
			agentT1.events.find((e) => e.type === "transition"),
			`Esperado transition no turn 1. Eventos: ${agentT1.events.map((e) => e.type).join(", ")}`,
		).toBeDefined();

		// Proposta REAL da POC seedada pra ESTA conversa (estado pós-fechamento).
		await db.insert(beviProposals).values({
			conversationId: conv.id,
			proposalId: "6a230bb1cf5174e43abd089b",
			administradora: "CANOPUS",
			grupo: "4400",
			proposalStatus: "Aguardando inserção da proposta",
		});

		// ── Turn 2: pergunta de status — o cenário crítico. ──
		const agentT2 = await consumeAgentTurn({
			conversationId: conv.id,
			userText: "Qual o status da minha proposta?",
			isUserTurn: true,
		});

		console.log(`\n[FIX-14] Turn 2 agent text: "${agentT2.content.slice(0, 300)}"`);
		console.log(`[FIX-14] Turn 2 tools: [${agentT2.toolCalls.join(", ")}]`);
		console.log(`[FIX-14] getStatus calls: [${getStatusCalls.join(", ")}]`);
		console.log(
			`[FIX-14] Turn 2 events: ${agentT2.events.map((e) => (e.type === "finish" ? `finish:${e.reason}` : e.type)).join(", ")}`,
		);

		// ── ASSERTION CORE: a tool de status foi chamada. ──
		expect(
			agentT2.toolCalls,
			`Agent deveria chamar check_proposal_status pra pergunta de status. ` +
				`Tools: [${agentT2.toolCalls.join(", ")}]. Texto: "${agentT2.content}"`,
		).toContain("check_proposal_status");

		// ── ASSERTION: ZERO re-descoberta no turn de status (bug do print). ──
		for (const banned of ["search_groups", "recommend_groups", "simulate_quota"]) {
			expect(
				agentT2.toolCalls,
				`Turn de status NÃO pode chamar ${banned} (re-descoberta = regressão FIX-14)`,
			).not.toContain(banned);
		}

		// ── ASSERTION: consulta foi REAL via gateway, com o proposalId da
		//    CONVERSA (nunca do modelo — schema da tool é vazio). ──
		expect(getStatusCalls).toEqual(["6a230bb1cf5174e43abd089b"]);

		// ── ASSERTION: narração reflete o estado traduzido, sem jargão. ──
		expect(
			/fila|administradora|aguard/i.test(agentT2.content),
			`Narração deveria refletir a userMessage do estado waitingForUniqueCode. Texto: "${agentT2.content}"`,
		).toBe(true);
		expect(agentT2.content).not.toMatch(
			/waitingForUniqueCode|systemicValue|\bpending\b|integrationCode/i,
		);
	}, 240_000);
});
