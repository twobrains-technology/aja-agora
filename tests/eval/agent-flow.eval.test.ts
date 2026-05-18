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

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leadEvents, leads, messages } from "@/db/schema";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import {
	buildCreditReactionDirective,
	buildExperienceFirstDirective,
	buildTimeframeReactionDirective,
} from "@/lib/agent/orchestrator/directives";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import { saveMessage } from "@/lib/conversation/messages";

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

async function userBotReply(args: {
	systemPrompt: string;
	transcript: Turn[];
}): Promise<string> {
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
			const { buildQualifyStartYesDirective } = await import(
				"@/lib/agent/orchestrator/directives"
			);
			return await consumeAgentTurn({
				conversationId,
				userText: buildQualifyStartYesDirective(),
				isUserTurn: false,
			});
		}

		case "credit": {
			// Imóvel: ~400k, parcela 2500 (perfil Monique).
			const credit = 400_000;
			const monthlyBudget = 2_500;
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
			const label = "3 a 5 anos";
			const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
				...(meta.qualifyAnswers ?? {}),
				prazoMeses: 60,
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
			const label = "Talvez, depende";
			const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
				...(meta.qualifyAnswers ?? {}),
				hasLance: "maybe",
			};
			await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
			await saveMessage(conversationId, "user", label, "web");
			// pipeSearchSummaryTurn = chama runTurn com searchSummaryDirective.
			const refreshed = await reloadMeta(conversationId);
			if (refreshed.searchDispatched) return null;
			const category = refreshed.currentCategory;
			if (!category) return null;
			await persistMeta(conversationId, { ...refreshed, searchDispatched: true });
			const { buildSearchSummaryDirective } = await import(
				"@/lib/agent/orchestrator/directives"
			);
			const directive = buildSearchSummaryDirective({ category, meta: refreshed });
			return await consumeAgentTurn({
				conversationId,
				userText: directive,
				isUserTurn: false,
			});
		}

		case "search":
		case "doubts-wait":
			return null;
	}
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
		const hasInterestSignal = turns.some((t) =>
			t.role === "user-bot" && /tenho interesse|quero esse|fechar|assinar/i.test(t.content),
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
const describeIfKey = HAS_API_KEY ? describe : describe.skip;

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
			userBotSystemPrompt: `Você é Monique, brasileira, leiga em consórcio, primeira vez comprando imóvel.
Quer R$ 400 mil e pode pagar até R$ 2.500/mês.
Quando perguntarem seu nome, diga apenas "Monique".
Quando o agente oferecer WhatsApp, aceite e diga seu número "11999998888".
Quando uma simulação ou recomendação aparecer, demonstre interesse: "Tenho interesse, vamos prosseguir".
Você é leiga: se ele falar de "lance", "contemplação", "carta", aceite naturalmente sem aprofundar.`,
			maxTurns: 14,
		});
	}, 240_000);

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

	it("[mig 0018] present_whatsapp_optin foi chamado com narrativa estratégica no texto anterior", () => {
		const turns = result?.turns ?? [];
		const tools = allToolCalls(turns);
		expect(
			tools,
			`Esperado present_whatsapp_optin após primeira simulação/recomendação. Tool calls: [${tools.join(", ")}]`,
		).toContain("present_whatsapp_optin");

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

	it("[B6] apresenta >=3 opções concretas (comparison_table ou múltiplos group_cards)", () => {
		const artifacts = (result?.turns ?? []).flatMap((t) => t.artifacts);
		const comparison = artifacts.find((a) => a.type === "comparison_table");
		const groupCards = artifacts.filter((a) => a.type === "group_card");

		let optionCount = 0;
		if (comparison) {
			const payload = comparison.payload as { groups?: unknown[] };
			optionCount = payload.groups?.length ?? 0;
		} else {
			optionCount = groupCards.length;
		}

		expect(
			optionCount,
			`Esperado >=3 opções concretas (B6). Visto: comparison_table=${comparison ? "sim" : "não"}, group_cards=${groupCards.length}, total=${optionCount}.`,
		).toBeGreaterThanOrEqual(3);
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

	it("[B9] frase de detalhamento contém 'detalhamento'/'simulação'/'ajustar' próximo a simulação", () => {
		const turns = result?.turns ?? [];
		const simTurn = turns.find((t) =>
			t.artifacts.some((a) => a.type === "simulation_result"),
		);
		// Junta texto do agent até o turn da simulação inclusive.
		const idx = simTurn ? turns.indexOf(simTurn) : -1;
		if (idx < 0) {
			throw new Error("Sem simulation_result no fluxo — assertion B9 não aplicável");
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

	it("[lead capture] WhatsApp salvo (phone populado no lead)", async () => {
		if (!result?.leadIdSeen) {
			throw new Error("Sem lead — assertion não aplicável");
		}
		const lead = await db.query.leads.findFirst({
			where: eq(leads.id, result.leadIdSeen),
		});
		expect(
			lead?.phone,
			"Esperado phone do lead populado após user dizer o WhatsApp. " +
				"Se NULL, a tool save_contact_whatsapp não foi acionada — " +
				"agent não chamou ou user-bot não enviou o número via card.",
		).toBeTruthy();
	});

	it("[lead form prefilled] present_lead_form recebeu prefilledName='Monique'", () => {
		const leadFormArtifact = (result?.turns ?? [])
			.flatMap((t) => t.artifacts)
			.find((a) => a.type === "lead_form");
		expect(leadFormArtifact, "lead_form artifact deveria ter sido emitido").toBeDefined();
		// payload pode vir como { conversationId, prefilledName } (do action handler)
		// ou só { conversationId } (do tool call do agent — não tem prefill).
		// Esta assertion verifica que ALGUM caminho leva o nome prefilled.
		const payload = (leadFormArtifact?.payload ?? {}) as {
			prefilledName?: string | null;
		};
		expect(
			payload.prefilledName?.toLowerCase(),
			`lead_form.payload.prefilledName esperado 'monique'. Payload: ${JSON.stringify(payload)}`,
		).toContain("moniq");
	});
});
