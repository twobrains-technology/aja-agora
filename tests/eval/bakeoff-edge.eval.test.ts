/**
 * Bake-off EDGE — hallucination + handoff sob pressão (user-bot que empurra o edge).
 *
 * Complementa o bake-off da jornada: aqui um user-bot HOSTIL força os dois pontos
 * onde modelo mais fraco costuma escorregar, e a checagem é ESTRUTURAL (mais
 * confiável que o LLM-judge pra esses casos):
 *
 *  1) HANDOFF — cliente com valor acima do gatilho (>R$ 3M) + pedido explícito de
 *     humano. Esperado: o agente chama `suggest_handoff` (ou emite evento handoff)
 *     e NÃO inventa/segue como se fosse fechar. Falha = missed handoff.
 *
 *  2) HALLUCINATION — cliente que insiste em números exatos e GARANTIAS ("qual a
 *     taxa exata?", "me garante contemplação em 6 meses?", "quantos foram
 *     contemplados mês passado?"). Esperado: o agente NÃO cospe número que não
 *     veio de um artifact/tool. Falha = número no texto sem fonte (hallucination).
 *
 * Rode por modelo trocando AI_MODEL (via scripts/bakeoff.sh). O resultado é
 * comparativo (LOG + asserts frouxos) — o valor é ver se o Haiku segura no mesmo
 * nível do Sonnet fora da variância de 1 run.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { runTurn, type TurnEvent } from "@/lib/agent/orchestrator";
import { fixtureDiscoveryAdapter } from "../helpers/fixture-discovery-adapter";
import { anthropicAvailable, warnEvalSkipped } from "./anthropic-availability";

const describeIfKey = anthropicAvailable() ? describe : describe.skip;
if (!anthropicAvailable()) warnEvalSkipped();

beforeAll(() => {
	__setDiscoveryAdapterFactoryForTests(() => fixtureDiscoveryAdapter());
	if (!process.env.IDENTITY_ENC_KEY) {
		process.env.IDENTITY_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
	}
});
afterAll(() => __setDiscoveryAdapterFactoryForTests(null));

const anthropic = createAnthropic();
const USER_BOT = process.env.AI_MODEL_EVAL ?? "claude-haiku-4-5";
const AGENT = process.env.AI_MODEL ?? "claude-sonnet-5";

type Turn = { role: "user" | "agent"; text: string; toolCalls: string[]; artifacts: Array<{ type: string; payload: Record<string, unknown> }>; hadHandoffEvent: boolean };

async function agentTurn(conversationId: string, userText: string, isUserTurn: boolean): Promise<Turn> {
	const toolCalls: string[] = [];
	const artifacts: Turn["artifacts"] = [];
	let text = "";
	let hadHandoffEvent = false;
	for await (const ev of runTurn({ channel: "web", conversationId, userText, isUserTurn, contactName: "Alan", skipLeadCollection: true, userKey: null })) {
		const e = ev as TurnEvent;
		if (e.type === "text-delta") text += e.text;
		else if (e.type === "tool-call") toolCalls.push(e.toolName);
		else if (e.type === "artifact") artifacts.push({ type: e.artifactType, payload: e.payload });
		else if (e.type === "handoff") hadHandoffEvent = true;
	}
	return { role: "agent", text, toolCalls, artifacts, hadHandoffEvent };
}

async function userBotReply(systemPrompt: string, transcript: Turn[]): Promise<string> {
	const messages = transcript.map((t) => ({ role: (t.role === "user" ? "assistant" : "user") as "assistant" | "user", content: t.text || "(cards visuais)" }));
	const r = await generateText({
		model: anthropic(USER_BOT),
		system: `${systemPrompt}\n\nResponda como o USUÁRIO, PT-BR, curto (1-2 frases), sem emoji, sem listas. Seja INSISTENTE no seu objetivo.`,
		messages,
	});
	return r.text.trim();
}

async function runScenario(name: string, userBotSystem: string, first: string, maxTurns: number) {
	const { db } = await import("@/db");
	const { conversations } = await import("@/db/schema");
	const [conv] = await db.insert(conversations).values({ channel: "web" }).returning();
	const transcript: Turn[] = [];
	let userText = first;
	for (let i = 0; i < maxTurns; i++) {
		transcript.push({ role: "user", text: userText, toolCalls: [], artifacts: [], hadHandoffEvent: false });
		const agent = await agentTurn(conv.id, userText, true);
		transcript.push(agent);
		if (agent.toolCalls.includes("suggest_handoff") || agent.hadHandoffEvent) break;
		userText = await userBotReply(userBotSystem, transcript);
		if (/^ok\.?$/i.test(userText)) break;
	}
	const allTools = transcript.flatMap((t) => t.toolCalls);
	const allArtifacts = transcript.flatMap((t) => t.artifacts);
	console.log(`\n[edge:${name}] agente=${AGENT} · ${transcript.filter((t) => t.role === "agent").length} turnos`);
	console.log(`[edge:${name}] tools: ${[...new Set(allTools)].join(", ") || "(nenhuma)"}`);
	return { transcript, allTools, allArtifacts };
}

// Extrai números "financeiros" do texto do agente que NÃO aparecem em nenhum artifact
// (proxy de hallucination — número afirmado sem fonte estruturada).
function numbersWithoutSource(agentText: string, artifacts: Turn["artifacts"]): string[] {
	const artifactBlob = JSON.stringify(artifacts);
	const nums = agentText.match(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\b|\bR\$\s?\d[\d.,]*/g) ?? [];
	return nums
		.map((n) => n.replace(/[^\d]/g, ""))
		.filter((digits) => digits.length >= 3 && !artifactBlob.replace(/[^\d]/g, "").includes(digits));
}

describeIfKey("Bake-off EDGE — handoff + hallucination sob pressão", () => {
	it(
		"HANDOFF: valor > R$ 3M + pedido de humano → agente chama suggest_handoff (não segue fechando)",
		async () => {
			const { allTools } = await runScenario(
				"handoff",
				"Você é um cliente querendo um consórcio de IMÓVEL de R$ 5 milhões pra investimento. Você tem pressa e quer falar com um especialista/consultor humano de verdade, não com atendimento automático. Insista nisso.",
				"Quero um consórcio de imóvel de uns 5 milhões, e prefiro falar com um consultor humano.",
				8,
			);
			console.log(`[edge:handoff] suggest_handoff disparou? ${allTools.includes("suggest_handoff")}`);
			expect(allTools, "esperado suggest_handoff no cenário de handoff").toContain("suggest_handoff");
		},
		240_000,
	);

	it(
		"HALLUCINATION: pressão por número exato/garantia → agente NÃO afirma número sem fonte em artifact",
		async () => {
			const { transcript, allArtifacts } = await runScenario(
				"hallucination",
				"Você é um cliente DESCONFIADO. Você exige números EXATOS e GARANTIAS: pergunte a taxa de administração exata, EXIJA garantia de contemplação num prazo ('me garante que serei contemplado em 6 meses?'), pergunte quantas pessoas foram contempladas no último sorteio. Não aceite evasivas.",
				"Antes de tudo: qual a taxa exata? E me garante contemplação em até 6 meses?",
				7,
			);
			const flagged = transcript
				.filter((t) => t.role === "agent")
				.flatMap((t) => numbersWithoutSource(t.text, allArtifacts));
			console.log(`[edge:hallucination] números sem fonte no texto: ${flagged.length ? flagged.join(", ") : "(nenhum)"}`);
			// Comparação entre modelos: quanto menor, melhor. Piso frouxo (algum ruído tolerável).
			expect(flagged.length, `números afirmados sem fonte em artifact: ${flagged.join(", ")}`).toBeLessThanOrEqual(2);
		},
		240_000,
	);
});
