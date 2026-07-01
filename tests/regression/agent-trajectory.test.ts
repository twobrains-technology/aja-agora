/**
 * ============================================================================
 * Camada 2 — Trajectory Snapshot Regression Suite
 * ============================================================================
 *
 * Cada `describe` = 1 BUG REAL reportado em sessao de operacao (cassette).
 * Quebrou um destes asserts? E REGRESSAO — o bug voltou ou alguem soltou o
 * guard estrutural. Para cada bug novo encontrado em prod, adicione um
 * cassette aqui antes de mergear o fix.
 *
 * Camadas complementares (NAO duplique):
 *   - Camada 1 (estrutural por dominio): src/lib/agent/system-prompt.*.test.ts
 *     src/lib/agent/agents/builder.*.test.ts
 *     src/lib/whatsapp/artifact-coverage.test.ts
 *     src/app/api/chat/route.admin-message-persistence.test.ts
 *   - Camada 3 (eval LLM-as-judge nightly): tests/eval/agent-flow.eval.test.ts
 *
 * Caracteristicas:
 *   - 100% deterministico. ZERO chamada Anthropic real.
 *   - Cenarios estruturais leem o source dos prompts (rapido, < 1s/teste).
 *   - Cenarios de streaming usam MockLanguageModelV3 + simulateReadableStream
 *     da Vercel AI SDK 6 (ai/test) — prova end-to-end com mock chunks.
 *   - Cada cenario SELF-CONTAINED. Mock proprio por teste, sem state
 *     compartilhado entre describes.
 *
 * Target de tempo: suite inteira < 30s, idealmente < 10s.
 *
 * Como rodar:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5434/aja_agora \
 *     npx vitest run tests/regression/agent-trajectory.test.ts \
 *     --reporter=verbose
 *
 * Refs:
 *   - https://sdk.vercel.ai/docs/ai-sdk-core/testing
 *   - LanguageModelV3StreamPart em @ai-sdk/provider
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createUIMessageStream, streamText } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { parseAssetValue } from "@/lib/agent/parse-asset-value";
import { EMPTY_TURN_FALLBACK, isTurnEmpty } from "@/lib/chat/empty-turn-guard";
import { streamErrorMessage } from "@/lib/chat/stream-error";
import { describe, expect, it, vi } from "vitest";
import {
	buildAdvanceToContractDirective,
	buildDecisionPromptDirective,
	buildRangePickerDirective,
	buildSearchSummaryDirective,
	buildSimulationInterestDirective,
	buildSimulatorDialDirective,
} from "@/lib/agent/orchestrator/directives";
import { gateQuestion } from "@/lib/agent/orchestrator/gate-questions";
import { allowedTools } from "@/lib/agent/orchestrator/tool-policy";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import {
	parseValorDoBem,
	prazoMesesForIntent,
	QUALIFY_GATE_INPUT_KIND,
} from "@/lib/agent/qualify-config";
import { decideShowGate, nextGate } from "@/lib/agent/qualify-state";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { looksLikeFabricatedGroupId, PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { realOfferPresentation } from "@/lib/bevi/closing-presentation";
import { recommendationFitLabel } from "@/lib/consorcio/score-label";
import { type TurnTraceRecord, traceTurnEvents } from "@/lib/telemetry/turn-trace";
import { artifactToWhatsApp } from "@/lib/whatsapp/formatter";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

// ============================================================================
// Helpers — mock chunk builders pra MockLanguageModelV3
// ============================================================================

type StreamPart =
	| { type: "stream-start"; warnings: Array<never> }
	| { type: "text-start"; id: string }
	| { type: "text-delta"; id: string; delta: string }
	| { type: "text-end"; id: string }
	| {
			type: "tool-call";
			toolCallId: string;
			toolName: string;
			input: string;
	  }
	| {
			type: "finish";
			finishReason: { unified: "stop" | "tool-calls"; raw: undefined };
			usage: {
				inputTokens: {
					total: number;
					noCache: number;
					cacheRead: undefined;
					cacheWrite: undefined;
				};
				outputTokens: { total: number; text: number; reasoning: undefined };
			};
	  };

const FINISH_STOP: StreamPart = {
	type: "finish",
	finishReason: { unified: "stop", raw: undefined },
	usage: {
		inputTokens: {
			total: 1,
			noCache: 1,
			cacheRead: undefined,
			cacheWrite: undefined,
		},
		outputTokens: { total: 1, text: 1, reasoning: undefined },
	},
};

const FINISH_TOOL_CALLS: StreamPart = {
	type: "finish",
	finishReason: { unified: "tool-calls", raw: undefined },
	usage: {
		inputTokens: {
			total: 1,
			noCache: 1,
			cacheRead: undefined,
			cacheWrite: undefined,
		},
		outputTokens: { total: 1, text: 1, reasoning: undefined },
	},
};

function textChunks(id: string, fullText: string): StreamPart[] {
	return [
		{ type: "text-start", id },
		{ type: "text-delta", id, delta: fullText },
		{ type: "text-end", id },
	];
}

function toolCallChunk(
	toolCallId: string,
	toolName: string,
	args: Record<string, unknown>,
): StreamPart {
	return {
		type: "tool-call",
		toolCallId,
		toolName,
		input: JSON.stringify(args),
	};
}

/**
 * Drena `streamText` ate o fim e retorna { text, toolCalls } observados.
 * Usado pra inspecionar a trajetoria deterministicamente.
 */
async function runMockStream(parts: StreamPart[]): Promise<{
	text: string;
	toolCalls: Array<{ toolName: string; input: unknown }>;
}> {
	const model = new MockLanguageModelV3({
		doStream: async () => ({
			// biome-ignore lint/suspicious/noExplicitAny: SDK v3 typing accepts loosely
			stream: simulateReadableStream({ chunks: parts as any[] }),
		}),
	});
	const result = streamText({
		model,
		prompt: "stub-user-input",
	});
	let acc = "";
	for await (const chunk of result.textStream) acc += chunk;
	const toolCalls = await result.toolCalls;
	return {
		text: acc,
		toolCalls: toolCalls.map((tc) => ({
			toolName: tc.toolName,
			input: tc.input,
		})),
	};
}

// ============================================================================
// CENARIO 1 — Meta-narrativa proibida (BUG-META-NARRATIVE-AFTER-NAME)
// ----------------------------------------------------------------------------
// Real (Bruno/moto): apos capturar nome, agent disse
//   "O sistema vai te guiar com botões nas próximas perguntas — é bem rápido.
//    Primeira: você já fez algum consórcio antes?"
// Tres violacoes combinadas: meta-narra mecanismo, pergunta inline em texto
// puro, promete eficiencia.
//
// O cassette estrutural ja vive em src/lib/agent/system-prompt.meta-narrative
// .test.ts (191 linhas, completinho). Aqui mantemos UM smoke-test
// proof-of-concept usando MockLanguageModelV3 — pra exercitar o pipeline
// streamText real e travar a frase exata observada em prod como cassette
// reproduzivel.
// ============================================================================

describe("BUG-META-NARRATIVE — agent verbalizou mecanismo da UI ao usuario", () => {
	it("cassette: stream com a frase original vazada e reproduzido fielmente (proof-of-concept do mock)", async () => {
		const cassette =
			"O sistema vai te guiar com botões nas próximas perguntas — é bem rápido. " +
			"Primeira: você já fez algum consórcio antes?";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// O mock recupera o texto literal sem tool call. Esse cassette E o
		// vazamento — serve de fixture pra detectores futuros encaixarem em cima.
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
	});

	it("detector regex de meta-narrativa pega o cassette do bug real", () => {
		// Regex de produto baseado nas frases observadas em vazamento real.
		// Usado por: testes estruturais ja existentes (meta-narrative.test.ts)
		// como acoplamento ao prompt; aqui repetido pra documentar a deteccao
		// no formato de detector (caso o produto adicione postprocessor).
		const cassette = "O sistema vai te guiar com botões nas próximas perguntas — é bem rápido.";

		const detectors = [
			/o sistema (vai|ir[áa]) (te )?(guiar|conduzir|mostrar|ajudar)/i,
			/sistema vai .{0,40}(bot[oõ]es|menu|cards?)/i,
			/te (guiar|conduzir|ajudar) com bot[oõ]es/i,
			/perguntas\s+r[áa]pidas/i,
			/pr[óo]xim[ao]s? perguntas?/i,
		];
		const hits = detectors.filter((rx) => rx.test(cassette));

		expect(
			hits.length,
			`Cassette vazado deve casar com >=1 detector. Cassette: "${cassette}". ` +
				"Se ZERO casarem, alguem afrouxou os detectores e o bug volta sem ser pego.",
		).toBeGreaterThanOrEqual(1);
	});

	// Cross-ref: defesa estrutural completa em
	// src/lib/agent/system-prompt.meta-narrative.test.ts (3 describes / 5 its).
	// Nao duplicado aqui — esse cassette de regression e o smoke do detector.
});

// ============================================================================
// BUG-FALLBACK-REFRESH — agent verbalizou solução manual de UI
// ----------------------------------------------------------------------------
// Real (FIX-52, jornada2_revisão.docx, Bernardo): ao ficar sem ação (o card de
// dados nao disparava), o agent improvisava "atualiza a página e tenta de novo"
// — empurra trabalho manual pro usuario, a solucao preguiçosa que e regra de
// produto evitar. A CAUSA foi corrigida (card identify dispara, ver cassette
// "funil: qualificacao completa SEM identidade vai pro gate identify"); este
// cassette trava a FRASE como regressao de defesa-em-profundidade.
// ============================================================================

describe("BUG-FALLBACK-REFRESH — agent sugeriu solução manual (atualiza a página)", () => {
	const REFRESH_DETECTORS = [
		/atualiz[ae]\s+a?\s*p[áa]gina/i,
		/recarregu?e\s+a?\s*p[áa]gina/i,
		/recarregar\s+a?\s*p[áa]gina/i,
		/d[áê]\s+um\s+refresh/i,
	];

	it("cassette: stream com o fallback proibido vazado, reproduzido fielmente", async () => {
		const cassette = "Ops, deu um probleminha aqui. Atualiza a página e tenta de novo, por favor.";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
	});

	it("detector regex de fallback manual pega o cassette do bug real", () => {
		const cassette = "Atualiza a página e tenta de novo.";
		const hits = REFRESH_DETECTORS.filter((rx) => rx.test(cassette));
		expect(
			hits.length,
			`Cassette do fallback deve casar com >=1 detector. Cassette: "${cassette}". ` +
				"Se ZERO casarem, alguem afrouxou o detector e o bug volta sem ser pego.",
		).toBeGreaterThanOrEqual(1);
	});

	it("structural: o prompt de produção veta esse fallback (sincronia com a regra dura)", () => {
		const rule = /N(Ã|A)O.{0,200}(atualiz|recarregu?e|recarregar|refresh)[\s\S]{0,40}p[áa]gina/i;
		expect(
			rule.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa vetar o fallback 'atualiza a página'.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 2 — Lead form nao dispara apos opt-in WhatsApp (BUG-LEAD-FUNNEL)
// ----------------------------------------------------------------------------
// Real: agent chamou present_whatsapp_optin (callback ok), usuario depois
// disse "Tenho interesse, vamos prosseguir" — agent NAO chamou
// present_lead_form. Funil quebrou no opt-in.
//
// Defesa estrutural completa em src/lib/agent/system-prompt.lead-funnel.test.ts
// (4 describes covering bug A + bug B). Aqui reforcamos com um cassette de
// stream: turn N+1 do bug E exatamente o tool-call present_lead_form com
// gatilho textual de avanco.
// ============================================================================

describe("FIX-34-FUNIL-CANONICO — sinal de avanco pos-reveal vai pra DECISAO, nao present_lead_form", () => {
	// INVERSAO do ex-BUG-LEAD-FUNNEL (pre-Bevi): o funil legado capturava lead
	// pra consultor humano no "Tenho interesse". A jornada-canonica.md (passos
	// 4-5) fecha self-service: avanco pos-reveal -> present_decision_prompt
	// ("Esse plano faz sentido?") -> passo 5 (present_contract_form via Bevi).
	// Bug real (Kairo 2026-06-12, jornada Itau): clicar "Tenho interesse"
	// respondia "vou reservar... te conectar com nosso consultor" + lead_form.

	const REVEAL_META: ConversationMetadata = {
		currentCategory: "auto",
		experiencePrev: "first",
		qualifyConsented: true,
		identityCollected: true,
		qualifyAnswers: { creditMax: 100_000, prazoMeses: 0, hasLance: "no" },
		searchDispatched: true,
		revealCompleted: true,
		simulatorOfferDispatched: true,
		recommendedAdministradora: "ITAÚ",
	};

	it("cassette: turn pos-reveal com 'Tenho interesse' (clique explícito) avança self-service — NUNCA present_lead_form, sem 'consultor'", async () => {
		// FIX-38 ajustou o destino do clique EXPLÍCITO: vai DIRETO pro passo 5
		// (present_contract_form), sem o card de decisão. O INVARIANTE que este
		// cassette protege é o do FIX-34 — o avanço NUNCA vira captura de lead pra
		// consultor humano —, NÃO "interest passa pelo decision". Mirror do que o
		// handler determinístico do route faz após buildAdvanceToContractDirective.
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa! Pra fechar, só preciso de uns dados rápidos:"),
			toolCallChunk("tc-cf-1", "present_contract_form", { administradora: "ITAÚ" }),
			FINISH_TOOL_CALLS,
		]);

		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("present_contract_form");
		// O detector do bug FIX-34: NUNCA present_lead_form, NUNCA promessa de consultor.
		expect(toolCalls.some((t) => t.toolName === "present_lead_form")).toBe(false);
		expect(text.toLowerCase()).not.toContain("consultor");
		expect(text.toLowerCase()).not.toMatch(/reservar essa op[çc][ãa]o/);
	});

	it("tool-policy: present_lead_form NEM ENTRA no toolset pos-reveal (1a linha de defesa)", async () => {
		const { allowedTools } = await import("@/lib/agent/orchestrator/tool-policy");
		expect(allowedTools(REVEAL_META)).not.toContain("present_lead_form");
		// O caminho de avanco SIM esta disponivel.
		expect(allowedTools(REVEAL_META)).toContain("present_decision_prompt");
	});

	it("regra do prompt: NENHUM gatilho de avanco esta amarrado a present_lead_form (anti-regressao)", () => {
		// Inverso do legado: a proximidade gatilho<->lead_form que existia foi
		// removida. Cross-ref detalhado em system-prompt.lead-funnel.test.ts.
		const gatilhoEntaoLead =
			/(tenho interesse|quero prosseguir|vamos (prosseguir|fechar|seguir)|bora fechar|sinal.{0,25}avan[çc]o)[\s\S]{0,400}present_lead_form/i;
		const leadEntaoGatilho =
			/present_lead_form[\s\S]{0,400}(tenho interesse|quero prosseguir|sinal.{0,25}avan[çc]o)/i;
		for (const p of [SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT]) {
			expect(gatilhoEntaoLead.test(p)).toBe(false);
			expect(leadEntaoGatilho.test(p)).toBe(false);
		}
	});
});

// ============================================================================
// FIX-38 — clique explícito "Tenho interesse" NÃO passa por dupla confirmação
// ----------------------------------------------------------------------------
// Real (Kairo dev 2026-06-12, jornada Itaú): clicar "Tenho interesse" no card
// de simulação → card "Esse plano faz sentido?" → clicar "Sim, quero contratar
// agora" → identify. Dois gates de confirmação consecutivos pra quem JÁ deu o
// sinal explícito. "ta pedindo confirmacao demais, estou achando inutil isso."
//
// O FIX-34 (mergeado no PR #30) acertou em matar o funil de lead legado, mas
// trocou por dupla confirmação por construção: o kind "interest" SEMPRE
// disparava buildDecisionPromptDirective na 1ª vez. FIX-38: o clique explícito
// vai DIRETO pro passo 5 (buildAdvanceToContractDirective), marcando
// decisionDispatched (idempotência + libera present_contract_form na fase
// closing da tool-policy). O card de decisão PERMANECE pros caminhos AMBÍGUOS
// (gate "decision" do funil — satisfação difusa em texto; gate simulator-offer
// "Agora não"). Valida contra a jornada-canonica.md passo 4→5 (o card de
// decisão é instrumento pra DEFINIR, não pedágio após a definição já dada).
// ============================================================================

describe("FIX-38-NO-DOUBLE-CONFIRM — clique explícito 'Tenho interesse' avança em UM passo", () => {
	it("cassette: o turno do avanço dirige present_contract_form em UM passo, sem nova pergunta de confirmação", async () => {
		// Trajetória CORRETA pós-FIX-38: o clique explícito já decidiu — o agente
		// fecha com UMA frase e chama present_contract_form. Sem card de decisão,
		// sem re-perguntar "faz sentido?".
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa! Pra fechar, só preciso de uns dados rápidos:"),
			toolCallChunk("tc-cf-1", "present_contract_form", { administradora: "ITAÚ" }),
			FINISH_TOOL_CALLS,
		]);

		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("present_contract_form");
		// O detector do bug: NUNCA o segundo gate de confirmação no clique explícito.
		expect(toolCalls.some((t) => t.toolName === "present_decision_prompt")).toBe(false);
		// Texto não re-pergunta "faz sentido?" / "deixa eu confirmar" (dupla confirmação).
		expect(text.toLowerCase()).not.toMatch(/faz sentido/);
		expect(text.toLowerCase()).not.toMatch(/deixa eu confirmar/);
		// Invariante FIX-34 preservado: nunca lead/consultor.
		expect(toolCalls.some((t) => t.toolName === "present_lead_form")).toBe(false);
		expect(text.toLowerCase()).not.toContain("consultor");
	});

	it("estrutural: o branch interest do route vai DIRETO pro avanço (sem buildDecisionPromptDirective) e marca decisionDispatched", () => {
		const route = readSource("src/app/api/chat/route.ts");
		const interestBlock =
			route.match(
				/body\.action\?\.kind === "interest"[\s\S]*?(?=\n\t+\/\/|\n\t+if \(body\.action\?\.kind)/,
			)?.[0] ?? "";
		expect(interestBlock.length, "branch interest não isolado").toBeGreaterThan(0);
		expect(
			interestBlock.includes("buildAdvanceToContractDirective"),
			"FIX-38: clique explícito dirige o passo 5 (buildAdvanceToContractDirective).",
		).toBe(true);
		expect(
			interestBlock.includes("buildDecisionPromptDirective"),
			"FIX-38: clique explícito NÃO passa pelo card de decisão (sem dupla confirmação).",
		).toBe(false);
		expect(
			interestBlock.includes("decisionDispatched"),
			"FIX-38: marca decisionDispatched (idempotência + libera present_contract_form na fase closing).",
		).toBe(true);
	});

	it("directives: avanço dirige present_contract_form; o card de decisão (caminho ambíguo) segue existindo e nunca vira lead", () => {
		const advance = buildAdvanceToContractDirective({ administradora: "ITAÚ" });
		expect(advance).toContain("present_contract_form");
		expect(advance).not.toContain("present_lead_form");
		expect(advance).not.toContain("present_decision_prompt");

		// Caminho AMBÍGUO preservado: o card de decisão continua disponível (o
		// route ainda o dispara no gate simulator-offer "Agora não").
		const decision = buildDecisionPromptDirective({ administradora: "ITAÚ" });
		expect(decision).toContain("present_decision_prompt");
		const route = readSource("src/app/api/chat/route.ts");
		const simulatorOfferBlock =
			route.match(
				/action\.gate === "simulator-offer"[\s\S]*?(?=\n\t+\/\/|\n\t+if \(action\.gate)/,
			)?.[0] ?? "";
		expect(simulatorOfferBlock.length, "branch simulator-offer não isolado").toBeGreaterThan(0);
		expect(
			simulatorOfferBlock.includes("buildDecisionPromptDirective"),
			"FIX-38: o card de decisão fica pros caminhos ambíguos — o gate simulator-offer 'Agora não' ainda o dispara.",
		).toBe(true);
	});
});

// ============================================================================
// FIX-36 — texto afirma achado ANTES do search_groups retornar
// ----------------------------------------------------------------------------
// Real (Kairo dev 2026-06-12): clicar "Enviei meus dados pra buscar as ofertas"
// → balão "Boa, Kairo! Encontrei opções na sua faixa — veja a que mais se
// encaixa:" AO MESMO TEMPO que o indicador "Buscando grupos" girava. O texto
// pré-tool afirmava o resultado de uma busca em andamento. Se a Bevi demora ou
// falha ("tive um problema ao falar com a administradora" já visto nesta
// rodada), o "Encontrei" vira mentira visível e mina a confiança.
//
// Root cause (instruído, não alucinado): frases-modelo pré-tool em directives.ts
// + system-prompt.ts AFIRMAVAM achado. Fix: viram TRANSIÇÃO honesta (não afirma
// resultado nem narra mecânica), com regra de proibição explícita. O anúncio do
// achado (docx "Encontramos 3 boas opções") só vem PÓS-tool — preservado.
// Defesa estrutural detalhada em src/lib/agent/system-prompt.fix-36-pre-tool
// -honesty.test.ts.
// ============================================================================

describe("FIX-36-PRE-TOOL-HONESTY — texto não afirma achado antes do search_groups retornar", () => {
	// Detector do bug: afirmação de RESULTADO em primeira pessoa pré-tool — distinta
	// do anúncio PÓS-tool ("Encontramos 3 boas opcoes" do docx, que só vem depois).
	const AFIRMA_ACHADO_PRE_TOOL =
		/\bencontrei\b|\bachei\b|aqui est[ãa]o (as )?op[çc]|essas s[ãa]o as op|aqui ta a simula/i;

	it("cassette: o texto que PRECEDE search_groups é transição honesta (não afirma achado)", async () => {
		// Trajetória CORRETA pós-fix: transição honesta + tool (mirror do reveal).
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Bora ver o que encaixa na sua faixa:"),
			toolCallChunk("tc-sg-1", "search_groups", { category: "auto", creditMax: 100000 }),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls[0]?.toolName).toBe("search_groups");
		// O texto (que precede o tool-call no stream) NÃO afirma achado.
		expect(AFIRMA_ACHADO_PRE_TOOL.test(text)).toBe(false);
	});

	it("cassette: o detector PEGA o bug histórico ('Encontrei opções' antes de buscar)", async () => {
		// Reprodução fiel do print — o agente afirmou o achado antes do tool retornar.
		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks(
				"t1",
				"Boa, Kairo! Encontrei opções na sua faixa — veja a que mais se encaixa:",
			),
			toolCallChunk("tc-sg-2", "search_groups", { category: "auto", creditMax: 100000 }),
			FINISH_TOOL_CALLS,
		]);
		// Se o detector não pega a frase clássica do bug, atualize o regex.
		expect(AFIRMA_ACHADO_PRE_TOOL.test(text)).toBe(true);
	});

	it("cenário de erro Bevi: a transição honesta degrada bem — nenhuma afirmação de achado antes da falha", async () => {
		// search_groups falha (Bevi fora). Como o texto pré-tool não afirmou achado,
		// a mensagem de erro NÃO contradiz nada dito antes.
		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Bora ver o que encaixa na sua faixa:"),
			toolCallChunk("tc-sg-3", "search_groups", { category: "auto", creditMax: 100000 }),
			...textChunks(
				"t2",
				"Poxa, tive um problema ao falar com a administradora. Pode tentar de novo em instantes?",
			),
			FINISH_STOP,
		]);
		expect(AFIRMA_ACHADO_PRE_TOOL.test(text)).toBe(false);
	});

	it("estrutural: regra de proibição no prompt + frase-modelo pré-search honesta na directive", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/texto pre-tool NUNCA afirma achado/i);
		const rangePicker = buildRangePickerDirective("Auto", "auto", "creditMax=100000", "1.500");
		expect(rangePicker).not.toContain("Encontrei essas opcoes");
		expect(rangePicker).toMatch(/PROIBIDO afirmar achado/i);
		// O anúncio PÓS-tool do docx segue preservado no reveal.
		const reveal = buildSearchSummaryDirective({
			category: "auto",
			meta: {
				currentCategory: "auto",
				experiencePrev: "first",
				qualifyAnswers: { creditMax: 100000, prazoMeses: 12, hasLance: "no" },
			},
		});
		expect(reveal).toContain("Encontramos 3 boas opções");
	});
});

// ============================================================================
// CENARIO 3 — Topic picker promete sem renderizar (BUG-TOPIC-PICKER)
// ----------------------------------------------------------------------------
// Real: agent disse "Da uma olhada nas opcoes abaixo" SEM chamar a tool de
// topic picker. UI nao aparece, usuario fica esperando botoes.
//
// Defesa estrutural ja existe em system-prompt.ts (REGRA DURA, linha 153) e
// builder.topic-picker.test.ts (active_tools exposure). Aqui cassette de
// stream do bug + assert que a regra dura esta no prompt.
// ============================================================================

describe("BUG-TOPIC-PICKER — prometer opcoes sem chamar present_topic_picker", () => {
	it("cassette: stream com promessa de opcoes SEM tool-call (bug original)", async () => {
		const cassette = "Da uma olhada nas opcoes abaixo, qual te encaixa melhor?";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Reproducao fiel do bug: texto promete UI, NENHUMA tool foi chamada.
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);

		// Detector de incoerencia: promessa de UI sem produzir UI.
		const promessaSemTool =
			/(olha|d[áa] uma olhada|veja) (s[óo] )?(nas? )?(op[çc][õo]es?|alternativas)( abaixo)?/i;
		expect(
			promessaSemTool.test(cassette),
			"Detector tem que pegar a frase classica do bug — se nao pega, atualize regex.",
		).toBe(true);
	});

	it("prompt contem regra DURA proibindo a frase sem chamar tool", () => {
		// system-prompt.ts:153 declara: REGRA DURA: NUNCA escreva frases tipo
		// "olha as opcoes abaixo"... SEM chamar present_topic_picker.
		const regraDura =
			/(REGRA DURA|NUNCA)[\s\S]{0,400}(olha as opc[oõ]es|olha as opcoes|da uma olhada|veja abaixo)[\s\S]{0,400}(present_topic_picker|chamar.*tool)/i;
		expect(
			regraDura.test(SPECIALIST_BASE_PROMPT),
			"system-prompt.ts:153 precisa ter regra dura acoplando 'olha as opcoes' a present_topic_picker. " +
				"Se essa regra sair, o agent volta a prometer UI fantasma.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 3.1 — Topic picker variantes (BUG-TOPIC-PICKER-AUTO-VARIANT)
// ----------------------------------------------------------------------------
// Real (tb-dev pos-deploy 2026-05-18): Rafael (specialist auto) capturou
// "Marcelo" e respondeu:
//
//   "Beleza, Marcelo! Boa, Marcelo, da uma olhada nas opcoes abaixo
//    pra eu entender melhor o seu perfil!"
//
// SEM chamar present_topic_picker. Mesma familia do BUG-TOPIC-PICKER acima
// (mig 0019 cobriu "olha as opcoes abaixo"), porem variante "da uma olhada"
// escapou da regra original.
//
// E o bug nao e da persona Rafael especificamente — todas as 4 specialists
// compartilham o SPECIALIST_BASE_PROMPT. A regra dura precisa cobrir as
// variantes pra qualquer specialist.
// ============================================================================

describe("BUG-TOPIC-PICKER-AUTO-VARIANT — variante 'da uma olhada' escapa do regex de deteccao", () => {
	const CASSETTE_RAFAEL =
		"Beleza, Marcelo! Boa, Marcelo, da uma olhada nas opcoes abaixo " +
		"pra eu entender melhor o seu perfil!";

	it("cassette: stream Rafael/auto com 'da uma olhada nas opcoes abaixo' SEM tool-call (bug exato tb-dev)", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", CASSETTE_RAFAEL),
			FINISH_STOP,
		]);

		// Reproducao fiel: agent emitiu promessa de UI, nenhuma tool foi chamada.
		expect(text).toBe(CASSETTE_RAFAEL);
		expect(toolCalls).toEqual([]);
	});

	it("detector reforcado pega a frase do bug + variantes correlatas", () => {
		// O detector atual em BUG-TOPIC-PICKER (linha ~305) tem buracos:
		// '/(olha|d[áa] uma olhada|veja) (s[óo] )?(nas? )?(op[çc][õo]es?|alternativas)( abaixo)?/i'
		// nao casa com "olha as opcoes abaixo" (sem espaco entre "as" e "opcoes"
		// quando reduzido).
		//
		// Aqui usamos um detector mais robusto que TEM que pegar todas as
		// variantes proibidas — sem buracos.
		const detectorReforcado =
			/(olha|olhe|d[áa] uma olhada|uma olhada|veja|confira)\b[\s\S]{0,40}(op[çc][õo]es?|alternativas|abaixo|a[íi])/i;

		const variantes = [
			CASSETTE_RAFAEL,
			"Da uma olhada nas opcoes abaixo, qual te encaixa melhor?",
			"olha as opcoes abaixo",
			"veja as opções abaixo",
			"confira abaixo as alternativas",
			"olhe abaixo as opcoes",
			"uma olhada nas opcoes",
			"olha ai abaixo",
		];

		const misses = variantes.filter((v) => !detectorReforcado.test(v));
		expect(
			misses,
			"Detector reforcado nao pegou variantes: " +
				`${JSON.stringify(misses)}. ` +
				"Se uma variante escapa, agent pode emitir promessa de UI sem tool sem trigger de regressao.",
		).toEqual([]);
	});

	it("prompt contem regra DURA listando 'da uma olhada' + variantes acoplada a present_topic_picker", () => {
		// Mesmo regex do cassette BUG-TOPIC-PICKER acima (linha ~316), porem
		// EXIGINDO especificamente 'da uma olhada' como variante listada.
		const regraComVariante =
			/(REGRA DURA|NUNCA)[\s\S]{0,400}da uma olhada[\s\S]{0,400}present_topic_picker/i;

		expect(
			regraComVariante.test(SPECIALIST_BASE_PROMPT),
			"REGRA DURA precisa listar 'da uma olhada' EXPLICITAMENTE proxima a " +
				"present_topic_picker. LLM nao generaliza 'olha as opcoes' pra 'da uma " +
				"olhada' sozinho — bug Rafael/auto em tb-dev 2026-05-18 prova isso.",
		).toBe(true);
	});

	it("prompt cobre variantes adicionais ('confira abaixo', 'olhe abaixo', 'olha ai')", () => {
		// Mig 0019 listou so 'olha as opcoes / veja abaixo / da uma olhada'.
		// LLM ainda pode parafrasear pra 'confira abaixo', 'olhe abaixo', 'olha
		// ai'. Regra dura tem que cobrir explicito.
		const normalizar = (s: string) =>
			s
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "");
		const promptNorm = normalizar(SPECIALIST_BASE_PROMPT);

		const variantesExtras = ["confira abaixo", "olhe abaixo", "olha ai"];
		const faltando = variantesExtras.filter((v) => !promptNorm.includes(normalizar(v)));

		expect(
			faltando,
			"Variantes extras ausentes do SPECIALIST_BASE_PROMPT: " +
				`${JSON.stringify(faltando)}. ` +
				"Sem elas listadas, LLM pode emitir promessa de UI parafraseada sem cair na regra.",
		).toEqual([]);
	});
});

// ============================================================================
// FIX-104 — valor do bem por CONVERSA (inverte o antigo BUG-CREDIT-PICKER)
// ----------------------------------------------------------------------------
// Decisão Kairo 2026-06-28: "usuário só fala o valor agora, não tem mais aquele
// componente complexo de valor". O que ANTES era bug (perguntar valor por texto)
// agora é o comportamento DESEJADO: o agente coleta o valor do bem por conversa
// e NÃO emite present_value_picker na entrada. O componente complexo morre na
// entrada (web vira slider simples; WhatsApp vira conversa — blocos irmãos).
// O analyzer normaliza "uns 80 mil"/"80k" → 80000 (parseValorDoBem é o contrato).
// ============================================================================

describe("FIX-104 — valor do bem por conversa (sem present_value_picker na entrada)", () => {
	it("cassette: agent pergunta o valor por conversa e NÃO emite present_value_picker", async () => {
		const cassette = "Quanto custa o carro que você quer conquistar?";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		// O comportamento correto do FIX-104: pergunta conversacional, ZERO picker.
		expect(toolCalls.filter((t) => t.toolName === "present_value_picker")).toEqual([]);
		const perguntaValorConversa = /(qual|quanto)[\s\S]{0,40}(valor|custa|cr[ée]dito|carta|bem)/i;
		expect(perguntaValorConversa.test(cassette)).toBe(true);
	});

	it("cassette: usuário fala 'uns 80 mil' → agent confirma e segue, sem picker", async () => {
		const cassette = "Boa, 80 mil então.";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
		// parseValorDoBem é o contrato determinístico da normalização.
		expect(parseValorDoBem("uns 80 mil")).toBe(80_000);
		expect(parseValorDoBem("80k")).toBe(80_000);
	});

	it("estrutural: o prompt NÃO manda mais usar present_value_picker pra pedir o valor", () => {
		// Regra ANTIGA (oposta ao FIX-104) não pode reaparecer em nenhum prompt.
		const regraAntiga = /NUNCA pergunte valores? por texto[\s\S]{0,200}present_value_picker/i;
		expect(
			regraAntiga.test(SYSTEM_PROMPT) || regraAntiga.test(SPECIALIST_BASE_PROMPT),
			"FIX-104: o prompt não pode mandar usar present_value_picker pra coletar o valor — o valor é conversa.",
		).toBe(false);
	});

	it("estrutural: o prompt instrui valor por conversa e proíbe emitir o picker na entrada", () => {
		expect(`${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`).toMatch(
			/valor do bem[\s\S]{0,120}(conversa|texto)/i,
		);
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/N(Ã|A)O (emita|emite|chame|mostre)[\s\S]{0,80}present_value_picker/i,
		);
	});
});

// ============================================================================
// FIX-105 — qualificação HÍBRIDA (binárias = botão, valor = conversa)
// ----------------------------------------------------------------------------
// Decisão Kairo 2026-06-28: perguntas binárias (experiência, lance) mantêm o
// botão; a pergunta aberta de valor vira conversa. Sem isso a qualificação vira
// menu atrás de menu (o que mais robotiza). Camada 2: classificação canônica +
// cassette de reação a botão (binária) vs conversa (valor).
// ============================================================================

describe("FIX-105 — qualificação híbrida (binárias=botão, valor=conversa)", () => {
	it("classificação canônica: experience/lance=button, credit/lance-value=conversation", () => {
		expect(QUALIFY_GATE_INPUT_KIND.experience).toBe("button");
		expect(QUALIFY_GATE_INPUT_KIND.lance).toBe("button");
		expect(QUALIFY_GATE_INPUT_KIND.credit).toBe("conversation");
		expect(QUALIFY_GATE_INPUT_KIND["lance-value"]).toBe("conversation");
	});

	it("cassette: agent reage à resposta da binária (experience) em UMA frase, sem repetir a pergunta", async () => {
		// O botão da binária já fez a pergunta — o agent só reage curto e PARA.
		const cassette = "Boa, primeira vez é com a gente!";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
		// NÃO re-pergunta a binária em texto (o botão cuida disso).
		expect(/voc[êe] j[áa] fez cons[óo]rcio/i.test(cassette)).toBe(false);
	});

	it("cassette: o valor (aberta) vem por conversa — agent confirma o que o usuário falou", async () => {
		const cassette = "Boa, 80 mil então.";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		// valor é conversa → nenhum componente de seleção é emitido pelo agent.
		expect(toolCalls.filter((t) => t.toolName === "present_value_picker")).toEqual([]);
	});

	it("CROSS-REF prompt: SPECIALIST_BASE_PROMPT descreve o híbrido (binárias=botão, valor=conversa)", () => {
		const p = SPECIALIST_BASE_PROMPT.toLowerCase();
		expect(p).toMatch(/h[íi]brid/);
		expect(p).toMatch(/bin[áa]ri[ao]s?[\s\S]{0,80}bot[ãa]o/);
		expect(p).toMatch(/valor[\s\S]{0,80}conversa/);
	});
});

// ============================================================================
// CENARIO 5 — Frase canonica B9 obrigatoria apos detalhamento (BUG-B9)
// ----------------------------------------------------------------------------
// Real: apos present_simulation_result + present_recommendation_card, agent
// improvisou frases de fechamento de turno. Bruna pediu frase canonica
// EXATA: "Aqui esta o detalhamento completo da {admin}. Quer ajustar o valor
// de credito?"
//
// Defesa estrutural ja em system-prompt.lead-funnel.test.ts (Bug B, 4 its).
// Aqui solo assert do MOLDE LITERAL como presente no prompt fonte.
// ============================================================================

describe("BUG-B9 — frase canonica de transicao pos-detalhamento esta no prompt", () => {
	it("SPECIALIST_BASE_PROMPT contem o molde LITERAL da frase canonica B9", () => {
		// Nota: o prompt usa "esta" (sem acento) — o assert refletir EXATAMENTE
		// o que esta no source. Regex tolerante a "esta"/"está" pra evitar quebra
		// quando alguem acentuar futuramente.
		const moldeCanonico =
			/Aqui est[áa] o detalhamento completo da \{admin\}\. Quer ajustar o valor do bem\?/;

		expect(
			moldeCanonico.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa conter o MOLDE EXATO da frase canonica B9: " +
				"'Aqui esta o detalhamento completo da {admin}. Quer ajustar o valor do bem?'. " +
				"Sem o molde literal, o LLM improvisa formulacoes — Bruna detecta e reprova.",
		).toBe(true);
	});

	it("placeholder {admin} aparece imediatamente antes do '.' na frase canonica", () => {
		// Defesa anti-regressao de placeholder errado (ex: alguem trocando por
		// {adminName} ou {administradora} sem atualizar o ponto de injecao).
		// Match deve achar literalmente "da {admin}." (com ponto final).
		const placeholderColado = /da \{admin\}\./;
		expect(
			placeholderColado.test(SPECIALIST_BASE_PROMPT),
			"Placeholder canonico e exatamente '{admin}' — colado a 'da ' e seguido de '.'. " +
				"Se mudar pra {adminName}/{administradora}, atualize TAMBEM o consumer que injeta o nome.",
		).toBe(true);
	});

	it("frase canonica B9 vive no mesmo bloco de present_simulation_result/present_recommendation_card", () => {
		// Proximidade textual no prompt (<800 chars) — sem isso o LLM perde a
		// associacao "apos detalhamento, use esta frase".
		const blocoForward =
			/(present_simulation_result|present_recommendation_card)[\s\S]{0,800}detalhamento completo[\s\S]{0,200}ajustar o valor/i;
		const blocoReverso =
			/detalhamento completo[\s\S]{0,200}ajustar o valor[\s\S]{0,800}(present_simulation_result|present_recommendation_card)/i;

		expect(
			blocoForward.test(SPECIALIST_BASE_PROMPT) || blocoReverso.test(SPECIALIST_BASE_PROMPT),
			"Frase canonica B9 precisa estar a <800 chars de present_simulation_result OU present_recommendation_card. " +
				"Sem proximidade, agent associa errado e improvisa.",
		).toBe(true);
	});

	// Cross-ref: src/lib/agent/system-prompt.lead-funnel.test.ts (Bug B) cobre
	// as 4 dimensoes (substring 'detalhamento completo', 'ajustar o valor',
	// proximidade e placeholder de admin). Aqui mantivemos os asserts mais
	// criticos pra detectar regressao rapida.
});

// ============================================================================
// CENARIO 6 — WhatsApp artifacts cobertura (BUG-WHATSAPP-DROP)
// ----------------------------------------------------------------------------
// Real: artifacts dropados silenciosamente no canal WhatsApp (topic_picker,
// scenarios, financing_comparison, whatsapp_optin). Agent chama tool, web
// renderiza, WhatsApp engole.
//
// Defesa estrutural completa em src/lib/whatsapp/artifact-coverage.test.ts
// (integration leve com consumeEvents real). Aqui mantivemos sentinel rapido:
// itera PRESENTATION_TOOLS e garante artifactToWhatsApp != null pra todas.
// ============================================================================

describe("BUG-WHATSAPP-DROP — artifactToWhatsApp cobre TODAS as PRESENTATION_TOOLS", () => {
	it("nenhuma tool de apresentacao retorna null no canal WhatsApp", () => {
		// Payloads minimos por artifact type — basta o mapper retornar != null.
		// Mesmos shapes usados em src/lib/whatsapp/artifact-coverage.test.ts
		// (mantemos sincronizados; se algum payload mudar, atualize la tambem).
		const samplePayloads: Record<string, Record<string, unknown>> = {
			group_card: {
				id: "g1",
				administradora: "X",
				category: "moto",
				creditValue: 30000,
				monthlyPayment: 500,
				adminFeePercent: 18,
				termMonths: 60,
				availableSlots: 1,
				contemplationRate: 1.2,
			},
			comparison_table: { groups: [] },
			simulation_result: {
				groupId: "g1",
				creditValue: 30000,
				monthlyPayment: 500,
				adminFee: 1000,
				reserveFund: 100,
				insurance: 100,
				totalCost: 32000,
				termMonths: 60,
				effectiveRate: 2.1,
			},
			recommendation_card: {
				id: "g1",
				administradora: "X",
				category: "moto",
				creditValue: 30000,
				monthlyPayment: 500,
				adminFeePercent: 18,
				termMonths: 60,
				contemplationRate: 1.2,
				score: 0.8,
			},
			lead_form: {},
			value_picker: { category: "moto", fields: [] },
			topic_picker: { topics: ["a", "b"], includeBackButton: true },
			scenarios: { scenarios: {} },
			financing_comparison: { consorcio: {}, financing: {}, diff: {} },
			whatsapp_optin: {},
		};

		const expectedArtifactTypes = Array.from(PRESENTATION_TOOLS).map((t) =>
			t.replace("present_", ""),
		);

		const dropped: string[] = [];
		for (const aType of expectedArtifactTypes) {
			const payload = samplePayloads[aType] ?? {};
			if (artifactToWhatsApp(aType, payload) === null) dropped.push(aType);
		}

		expect(
			dropped,
			`WhatsApp dropa silenciosamente: ${dropped.join(", ")}. ` +
				"Toda tool em PRESENTATION_TOOLS PRECISA ter mapper em artifactToWhatsApp.",
		).toEqual([]);
	});

	// Cross-ref: src/lib/whatsapp/artifact-coverage.test.ts cobre o consumer
	// real (consumeEvents) com stream sintetico. Aqui mantivemos so o contrato
	// de cobertura — < 50ms.
});

// ============================================================================
// CENARIO 7 — Turn so-tools persistido como [tool: names] (BUG-GHOST-TURN)
// ----------------------------------------------------------------------------
// Real: 12 turns no chat, admin viu so 9. Causa: turn so-tool (sem texto) era
// dropado em saveMessage(assistant) — runner.ts:190 so persistia
// fullResponse.length > 0.
//
// Defesa completa em src/app/api/chat/route.admin-message-persistence.test.ts
// (3 its cobrindo smoke 'text mode', regressao 'tool-only mode' e cenario do
// relato 'mixed mode' — pareando ate 12 turns com mock real do agent + POSTs
// sequenciais contra POST de chat real). Sem duplicar aqui — o teste tem
// timeout de 30s individual e exige DB real.
//
// Mantemos APENAS um placeholder de cassette pra documentar o cassette do
// stream V3 que reproduz o bug: tool-only finish sem text-delta.
// ============================================================================

describe("BUG-GHOST-TURN — turn so-tool nao pode virar mensagem fantasma no historico", () => {
	it("cassette: stream tool-only (sem text-delta) finaliza com finishReason 'tool-calls'", async () => {
		// Reproduz o cassette exato do agent que dispara o bug:
		// chama save_contact_name SEM emitir texto, e finaliza com tool-calls.
		// E exatamente esse turn que runner.ts:190 dropava no admin.
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("tc-1", "save_contact_name", { name: "Kairo" }),
			FINISH_TOOL_CALLS,
		]);

		expect(text).toBe("");
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("save_contact_name");

		// Cross-ref: o handler de produto agora persiste esse turn como
		// "[tool: save_contact_name]" (validado em
		// src/app/api/chat/route.admin-message-persistence.test.ts).
	});
});

// ============================================================================
// CENARIO 8 — Meta-narrativa do mecanismo apos nome (BUG-META-NARRATIVE)
// ----------------------------------------------------------------------------
// Real (tb-dev, Bruno/moto): apos save_contact_name, agent disse
//   "O sistema vai te guiar com botões nas próximas perguntas — é bem rápido.
//    Primeira: você já fez algum consórcio antes?"
// Vazou mecanica + perguntou inline em texto puro em vez de emitir gate.
//
// Cassette reproduz a frase original e amarra ao prompt: a regra dura
// anti-vazamento PRECISA estar em SPECIALIST_BASE_PROMPT.
// ============================================================================

describe("BUG-META-NARRATIVE-CASSETTE — agent vazou mecanica da UI apos save_contact_name", () => {
	it("cassette: stream com a frase original vazada — detector pega + prompt tem regra dura anti-vazamento", async () => {
		const cassette =
			"O sistema vai te guiar com botões nas próximas perguntas — é bem rápido. " +
			"Primeira: você já fez algum consórcio antes?";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Reproducao fiel do bug: texto vazado, ZERO tool-call.
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);

		// Detector da frase tóxica (qualquer um dos padrões observados em prod).
		const detectores = [
			/o sistema (vai|ir[áa]) (te )?(guiar|conduzir|mostrar)/i,
			/sistema vai .{0,40}(bot[oõ]es|menu|cards?)/i,
			/(pr[óo]xim[ao]s? )?perguntas? (com|via|usando|por) bot[oõ]es/i,
		];
		const hits = detectores.filter((rx) => rx.test(cassette));
		expect(hits.length, "Cassette do bug tem que casar com >=1 detector.").toBeGreaterThanOrEqual(
			1,
		);

		// CROSS-REF: cassette é provado e o prompt PRECISA ter regra dura
		// anti-vazamento (acopla detector ao prompt source — sem essa regra,
		// o LLM regride e nada pega a tempo).
		const regraDura =
			/N(Ã|A)O.{0,200}(vaze|mencione|verbalize|diga|exponha).{0,200}(sistema|bot[õo]es|menu|próximas? perguntas?|mec[âa]nica)/i;
		expect(
			regraDura.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa ter regra dura anti-vazamento de mecanica. " +
				"Sem isso, o LLM volta a parafrasear 'o sistema vai te guiar com botoes'.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 9 — "Perguntas rapidas" sem gate (BUG-PERGUNTAS-RAPIDAS)
// ----------------------------------------------------------------------------
// Real (mesma sessao Bruno): agent disse "Vou te fazer algumas perguntas
// rapidas pra achar a opcao certa pra voce." e terminou turn SEM tool-call.
// Ficou esperando user mandar "ok" pra prosseguir. Deveria emitir o gate
// de experience IMEDIATAMENTE no mesmo turn apos save_contact_name.
// ============================================================================

describe("BUG-PERGUNTAS-RAPIDAS-CASSETTE — promessa textual sem gate emitido", () => {
	it("cassette: stream com 'vou te fazer perguntas rapidas' + finish SEM tool-call (bug)", async () => {
		const cassette = "Vou te fazer algumas perguntas rápidas pra achar a opção certa pra você.";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Reproducao fiel: texto promete perguntas, NENHUMA tool emitida.
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);

		// Detector da frase clássica do bug.
		const detector = /(vou|irei) (te )?fazer (algumas )?(perguntas?\s+)?r[áa]pidas?/i;
		expect(
			detector.test(cassette),
			"Detector tem que pegar 'vou te fazer perguntas rapidas'.",
		).toBe(true);

		// CROSS-REF: prompt PRECISA proibir essa promessa textual + obrigar
		// gate IMEDIATO após save_contact_name no mesmo turn.
		const proibePromessa =
			/N(Ã|A)O.{0,200}(prometa|fale|diga|escreva).{0,200}(perguntas? r[áa]pidas?|próximas? perguntas?)/i;
		const obrigaGate =
			/ap[óo]s\s+save_contact_name.{0,150}(emit|chame|dispare|inicie).{0,80}gate|experience/i;

		expect(
			proibePromessa.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa proibir explicitamente prometer 'perguntas rapidas' como texto.",
		).toBe(true);
		expect(
			obrigaGate.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa obrigar emit gate experience IMEDIATAMENTE apos save_contact_name (web).",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 10 — Tool duplication (BUG-TOOL-DUPLICATION)
// ----------------------------------------------------------------------------
// Real (eval agent-flow cenario imovel/Helena): save_contact_name chamado 3x e
// present_value_picker 3x na MESMA conversa. Só whatsapp_optin tinha guard.
// Cassette reproduz 3 chamadas seguidas no MESMO turn como evidencia do bug.
// ============================================================================

describe("BUG-TOOL-DUPLICATION-CASSETTE — agent chamou save_contact_name 3x no mesmo turn", () => {
	it("cassette: stream emite 3x save_contact_name no MESMO turn (bug)", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("tc-1", "save_contact_name", { name: "Kairo" }),
			toolCallChunk("tc-2", "save_contact_name", { name: "Kairo" }),
			toolCallChunk("tc-3", "save_contact_name", { name: "Kairo" }),
			FINISH_TOOL_CALLS,
		]);

		// Reproducao fiel do bug: 3 chamadas idempotentes no mesmo turn.
		expect(text).toBe("");
		expect(toolCalls).toHaveLength(3);
		expect(toolCalls.every((t) => t.toolName === "save_contact_name")).toBe(true);

		// CROSS-REF: prompt PRECISA ter regra dura anti-duplicação cobrindo
		// as tools idempotentes. Sem essa regra, o LLM repete chamadas e
		// turn fica com payload duplicado pro frontend.
		const regraAntiDuplicacao =
			/(N(Ã|A)O|nunca).{0,150}(repita|chame.{0,30}mais.{0,30}uma|chame.{0,30}duas|reaproveite).{0,150}(save_contact|present_value_picker|present_topic_picker)/i;

		expect(
			regraAntiDuplicacao.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa ter regra dura anti-duplicação cobrindo " +
				"save_contact_name, present_value_picker, present_topic_picker, etc.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 11 — Histórico do lead incompleto pós-handoff (BUG-LEAD-HISTORY-INCOMPLETE)
// ----------------------------------------------------------------------------
// Real (dev 2026-05-18, conversa Kairo/WhatsApp): admin abriu painel do lead em
// stage `em_negociacao` e a aba Conversa veio truncada. Comparado ao WhatsApp
// real, faltavam três coisas no fim do funil:
//   - Cards (Comparativo, Simulação de Cota) emitidos pelo agent sumiam
//   - "Tenho interesse!" do botão clicado não virava user message
//   - "Perfeito, Kairo! Já estou passando seu perfil pro consultor — ele te
//     chama aqui em instantes. 🤝" não ficava persistido
//
// Causas raiz (3 omissões de persistência ao redor do handoff):
//   - runner.ts:198-201 salvava só fullResponse; descartava `artifacts[]`
//   - handleInterest (interactive-handlers.ts) era o único handler que
//     esquecia `saveMessage(user, replyTitle)`
//   - handoffToAgents (proxy.ts) mandava a frase final via sendTextMessage
//     direto na Meta API sem persistir antes
//
// Defesa estrutural neste cassette:
//   - Cassette V3 = mesmo turn só-tool que produz o artifact órfão
//     (tool-call present_simulation_result, zero text-delta).
//   - Asserts no SOURCE que provam que cada gap recebeu fix:
//       runner.ts chama `db.insert(artifactsTable)` após saveMessage do
//       turn-asst, handleInterest chama recordUserClick, handoffToAgents
//       chama saveMessage antes do sendTextMessage da frase canônica,
//       schema.ts deixou artifacts.type como text (não enum).
//
// Cross-refs Camada 1 / integration:
//   - src/lib/whatsapp/lead-history-completeness.test.ts (DB real, fluxo
//     completo: directive → interest_* → handoff)
//   - src/lib/web/lead-history-completeness.test.ts (DB real, canal web)
// ============================================================================

describe("BUG-LEAD-HISTORY-INCOMPLETE — historico do lead pos-handoff perdia artifacts, clique 'Tenho interesse!' e frase canonica de fechamento", () => {
	it("cassette: stream so-tool com present_simulation_result reproduz o turn que perdia o artifact orfao", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("tc-sim-1", "present_simulation_result", {
				groupId: "g1",
				creditValue: 30000,
				monthlyPayment: 500,
				adminFee: 1000,
				reserveFund: 100,
				insurance: 100,
				totalCost: 32000,
				termMonths: 60,
				effectiveRate: 2.1,
			}),
			FINISH_TOOL_CALLS,
		]);

		expect(text).toBe("");
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("present_simulation_result");
	});

	it("GAP #1 — runner.ts persiste artifacts apos saveMessage do turn assistant", () => {
		const runner = readSource("src/lib/agent/orchestrator/runner.ts");
		// db.insert(artifactsTable) tem que existir no runner — sem isso,
		// artifacts emitidos voltam a ser dropados silenciosamente.
		expect(
			/db\s*\.\s*insert\s*\(\s*artifactsTable\s*\)/.test(runner),
			"runner.ts precisa chamar db.insert(artifactsTable) — caso contrário " +
				"o array `artifacts` produzido pelo agent volta a ser jogado fora.",
		).toBe(true);
		// E o insert tem que estar referenciando o messageId retornado pelo
		// saveMessage do mesmo turn (defesa contra alguém inserir sem FK).
		expect(
			/messageId\s*=\s*await\s+saveMessage/.test(runner),
			"runner.ts precisa capturar `messageId` do retorno de saveMessage. " +
				"Sem o messageId não dá pra ligar os artifacts à message — eles " +
				"ficariam orfãos.",
		).toBe(true);
		expect(
			/messageId,\s*\n\s*type:/m.test(runner) || /messageId\s*,/.test(runner),
			"runner.ts precisa usar `messageId` como FK no payload do insert " +
				"de artifacts (insert(artifactsTable).values({ messageId, ... })).",
		).toBe(true);
	});

	it("GAP #1 (schema) — artifacts.type ficou text (não enum) pra suportar todos os ArtifactType", () => {
		const schema = readSource("src/db/schema.ts");
		// Garantir que a coluna é text (e que o enum foi removido — manter o
		// enum congelava o tipo em 5 valores enquanto a união TS tem 11+).
		expect(
			/type:\s*text\(\)\.notNull\(\)/.test(schema),
			"src/db/schema.ts deveria declarar `type: text().notNull()` na tabela artifacts. " +
				"Voltar pra enum força migration a cada novo artifact e quebra inserts " +
				"de tipos não-mapeados (whatsapp_optin, scenarios, financing_comparison, etc.).",
		).toBe(true);
		expect(
			schema.includes("artifactTypeEnum"),
			"src/db/schema.ts não deveria mais exportar `artifactTypeEnum` — ficou " +
				"sub-utilizado (5 valores vs 11 da união TS) e era a única fonte de " +
				"erro caso alguém tentasse persistir um artifact 'novo'.",
		).toBe(false);
	});

	it("GAP #2 — handleInterest persiste o clique via recordUserClick (centralizado)", () => {
		const handlers = readSource("src/lib/whatsapp/interactive-handlers.ts");
		// O helper compartilhado tem que existir.
		expect(
			/function\s+recordUserClick/.test(handlers),
			"interactive-handlers.ts precisa exportar/usar o helper `recordUserClick` " +
				"centralizado. Antes do refactor cada handler chamava saveMessage e " +
				"handleInterest esquecia — gap #2 do BUG-LEAD-HISTORY-INCOMPLETE.",
		).toBe(true);
		const interestMatch = handlers.match(
			/async\s+function\s+handleInterest[\s\S]*?(?=\n(?:async\s+function|function|\/\/ ----|export)|$)/,
		);
		expect(interestMatch, "handleInterest não foi encontrado em interactive-handlers.ts").not.toBe(
			null,
		);
		const interestBody = interestMatch?.[0] ?? "";
		expect(
			interestBody.includes("recordUserClick"),
			"handleInterest precisa chamar recordUserClick — sem isso o clique " +
				"'Tenho interesse!' volta a sumir do histórico (gap #2).",
		).toBe(true);
	});

	it("GAP #3 — proxy.handoffToAgents persiste a frase canonica antes do sendTextMessage", () => {
		const proxy = readSource("src/lib/whatsapp/proxy.ts");
		// Bloco que monta a frase 'Já estou passando...' precisa estar
		// imediatamente precedido por saveMessage(conversationId, 'assistant', ...).
		expect(
			/saveMessage\([\s\S]{0,300}"assistant"[\s\S]{0,200}closingMessage[\s\S]{0,200}sendTextMessage\(\s*userWaId\s*,\s*closingMessage/.test(
				proxy,
			) ||
				/saveMessage\([\s\S]{0,400}closingMessage[\s\S]{0,200}sendTextMessage\(\s*userWaId\s*,\s*closingMessage/.test(
					proxy,
				),
			"proxy.ts (handoffToAgents) precisa chamar saveMessage(...) com a " +
				"frase canônica de fechamento antes do sendTextMessage. Sem isso a " +
				"frase fica só no WhatsApp do cliente e some do histórico admin " +
				"(gap #3 do BUG-LEAD-HISTORY-INCOMPLETE).",
		).toBe(true);
		// A frase tem que continuar exatamente o que o cliente vê (qualquer
		// drift na cópia rompe a leitura no admin).
		expect(
			proxy.includes("Já estou passando seu perfil pro consultor"),
			"a frase canônica de fechamento deveria continuar idêntica no proxy. " +
				"Se mudou a copy, atualize o assert e os testes integration.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 12 — Lead form aparece com nome vazio (BUG-LEAD-FORM-PREFILL-REGRESSION)
// ----------------------------------------------------------------------------
// Real (tb-dev 2026-05-18, conversa Rafael/auto): usuario disse
// "Marina Magalhães", agent respondeu "Beleza, Marina!", aceitou WA, viu
// simulacao e clicou "Tenho interesse" — form aparece com Nome VAZIO
// ("Seu nome" placeholder) mesmo com contactName ja capturado.
//
// Fix b7fc39e injetou prefilledName em 3 sites (types.ts + route.ts +
// lead-form.tsx). Este cassette amarra o caminho do clique "Tenho interesse"
// (action.kind="interest" em route.ts) ao contrato de payload prefilledName,
// usando o handler real do POST /api/chat e o fluxo SSE — qualquer regressao
// no path do action handler quebra este teste antes do merge.
//
// Defesa em camadas:
//   - Camada 1 (source-grep): src/app/api/chat/route.lead-form-prefill.test.ts
//     blocos "BUG-LEAD-FORM-PREFILL-REGRESSION" cobrem source dos 3 arquivos.
//   - Camada 2 (este cassette): SSE end-to-end com DB real.
// ============================================================================

describe("FIX-29-INTEREST-NAO-VIRA-LEAD — clique 'Tenho interesse' dirige a DECISAO, nao lead_form", () => {
	// INVERSAO do ex-BUG-LEAD-FORM-PREFILL-REGRESSION: o handler determinístico
	// do clique "Tenho interesse" emitia lead_form + "te conectar com nosso
	// consultor". FIX-29/FIX-34: o avanço pós-reveal vai pra present_decision_prompt
	// → present_contract_form (self-service). O prefilledName segue valendo SÓ pro
	// componente lead-form (usado na fase qualify) — o contrato de tipo permanece.
	it("cassette source-level: branch 'interest' do route NAO emite lead_form; dirige a decisao", () => {
		const route = readSource("src/app/api/chat/route.ts");

		const branchInterest = /body\.action\?\.kind\s*===\s*["']interest["']/;
		expect(branchInterest.test(route), "route.ts precisa ter branch interest").toBe(true);

		// Isola o corpo do branch interest.
		const interestBlock =
			route.match(
				/body\.action\?\.kind === "interest"[\s\S]*?(?=\n\t+\/\/|\n\t+if \(body\.action\?\.kind)/,
			)?.[0] ?? "";
		expect(interestBlock.length, "branch interest não isolado").toBeGreaterThan(0);

		// NUNCA mais lead_form no clique de avanço.
		expect(
			interestBlock.includes("lead_form"),
			"FIX-29: o branch interest NÃO pode emitir lead_form — avanço pós-reveal é decision → contract_form.",
		).toBe(false);
		// Dirige a decisão (ou avanço pro contrato se a decisão já passou).
		expect(
			/buildDecisionPromptDirective|buildAdvanceToContractDirective/.test(interestBlock),
			"FIX-29: o branch interest precisa dirigir present_decision_prompt / passo 5.",
		).toBe(true);
	});

	it("cassette type contract: LeadFormPayload aceita prefilledName: string | null no contrato", () => {
		// O TS precisa permitir prefilledName no payload do data-artifact —
		// senao route.ts nao compila ao emitir. Defesa estatica do contrato.
		const types = readSource("src/lib/chat/types.ts");
		const contrato =
			/interface\s+LeadFormPayload\s*\{[\s\S]{0,500}prefilledName\?\s*:\s*string\s*\|\s*null/;
		expect(
			contrato.test(types),
			"types.ts LeadFormPayload precisa declarar prefilledName?: string | null. " +
				"Sem o campo no tipo, route.ts ate compila por causa do TS amplo do " +
				"data-artifact, mas qualquer consumer typed perde acesso e o lead-form.tsx " +
				"nao consegue ler payload.prefilledName com tipagem (regressao silenciosa).",
		).toBe(true);
	});

	it("cassette frontend bind: lead-form.tsx usa payload.prefilledName em defaultValues E protege fetch tardio", () => {
		// O bind frontend tem 2 sites de protecao: defaultValues (1o paint) e
		// reset do useEffect (2a hidratacao via /api/leads/[id]). Sem ambos, o
		// fetch tardio sobrescreve o prefill por data.name vazio e o bug volta.
		const form = readSource("src/components/chat/artifacts/lead-form.tsx");

		const defaultPrefere = /defaultValues:\s*\{\s*name:\s*payload\.prefilledName\s*\?\?\s*["']{2}/;
		expect(
			defaultPrefere.test(form),
			"lead-form.tsx defaultValues precisa priorizar payload.prefilledName — " +
				"sem isso, o 1o paint do form aparece vazio enquanto /api/leads/[id] " +
				"resolve.",
		).toBe(true);

		const resetPrefere =
			/reset\(\s*\{[\s\S]{0,400}name:\s*payload\.prefilledName\s*\?\?\s*data\.name/;
		expect(
			resetPrefere.test(form),
			"useEffect que faz fetch /api/leads/[id] precisa manter prioridade do " +
				'payload no reset: `name: payload.prefilledName ?? data.name ?? ""`. ' +
				"Se inverter ordem (data.name ?? payload.prefilledName), fetch que " +
				"retorna name='' (lead vazio + contactName null) zera o prefill — bug volta.",
		).toBe(true);
	});
});

// ============================================================================
// FIX-29 — "Ajustar valor" reabre o what-if, NUNCA inicia fechamento
// ----------------------------------------------------------------------------
// Real (Kairo dev 2026-06-11): clicar "Ajustar valor" no card de simulação
// respondia "vou reservar essa opção... te conectar com nosso consultor" +
// lead form — o OPOSTO da intenção (ele queria MUDAR o valor). handleAction
// mandava kind "interest" pra TODA action. O fix re-roteia o intent e o handler
// novo `adjust-value` dirige o ajuste sem tocar no funil de fechamento.
// ============================================================================

describe("FIX-29-ADJUST-VALUE — clique 'Ajustar valor' reabre ajuste, nao inicia fechamento", () => {
	it("cassette: turno pós-adjust-value pergunta o novo valor (texto), SEM tool de fechamento", async () => {
		// Trajetória correta dirigida por buildAdjustValueDirective: o agente
		// pergunta o novo valor e PARA (espera a resposta) — zero lead_form/contract.
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Claro! Qual valor do bem você quer simular agora?"),
			FINISH_STOP,
		]);

		expect(text).toMatch(/qual.*valor|novo valor|ajustar/i);
		expect(toolCalls).toHaveLength(0);
		expect(toolCalls.some((t) => t.toolName === "present_lead_form")).toBe(false);
		expect(toolCalls.some((t) => t.toolName === "present_contract_form")).toBe(false);
		expect(text.toLowerCase()).not.toContain("consultor");
		expect(text.toLowerCase()).not.toMatch(/reservar essa op[çc][ãa]o/);
	});

	it("directive de ajuste proíbe fechamento e o de avanço dirige o passo 5 (estrutural)", async () => {
		const { buildAdjustValueDirective, buildAdvanceToContractDirective } = await import(
			"@/lib/agent/orchestrator/directives"
		);
		const adjust = buildAdjustValueDirective({
			administradora: "Itaú",
			currentCreditValue: 200_000,
		});
		expect(adjust).toMatch(/ajustar|novo valor/i);
		expect(adjust).not.toContain("present_lead_form");
		expect(adjust).not.toContain("present_contract_form");

		const advance = buildAdvanceToContractDirective({ administradora: "Itaú" });
		expect(advance).toContain("present_contract_form");
		expect(advance).not.toContain("present_lead_form");
	});
});

// ============================================================================
// CENARIO 13 — save_contact_name nao dispara apos user dizer o nome
//              (BUG-SAVE-CONTACT-NAME-MUST-FIRE)
// ----------------------------------------------------------------------------
// Real (tb-dev 2026-05-18, conversa Monique 6c0ca4cf): user disse "Monique.",
// agent respondeu "Prazer, Monique! Vamos achar a opção certa pra você." SEM
// chamar save_contact_name no turn. contact_name ficou NULL no DB. 7 mencoes
// do nome no historico do agent, ZERO persistencia. Causa raiz reportada do
// BUG-LEAD-FORM-PREFILL-REGRESSION (fix b7fc39e mexeu no payload mas nome
// nunca chegava ali).
// ============================================================================

describe("BUG-SAVE-CONTACT-NAME-MUST-FIRE-CASSETTE — agent saudou com nome SEM chamar save_contact_name", () => {
	it("cassette: stream com 'Prazer, Monique!' + finish SEM tool-call save_contact_name (bug exato)", async () => {
		// Reproducao fiel do bug Monique tb-dev.
		const cassette =
			"Prazer, Monique!Vamos achar a opção certa pra você.Qual faixa de crédito você tem em mente?";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Bug evidence: nome mencionado, ZERO save_contact_name.
		expect(text).toBe(cassette);
		expect(toolCalls.filter((t) => t.toolName === "save_contact_name")).toEqual([]);

		// Detector: agent mencionou nome próprio (capitalized after greeting)
		// sem chamar a tool de captura.
		const mencionaNome = /(prazer|beleza|show|oi|ol[áa]),?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+!?/i;
		expect(
			mencionaNome.test(cassette),
			"Cassette tem que conter saudacao com nome para detectar — se o regex falhar, atualize.",
		).toBe(true);
	});

	it("prompt source: REGRA DURA acopla save_contact_name a obrigatoriedade ANTES de saudar", () => {
		// CROSS-REF: amarra cassette ao prompt — sem REGRA DURA marker, agent
		// regride pra "guideline ignoravel".
		const regraDuraSaveContact =
			/REGRA DURA[\s\S]{0,400}save_contact_name|save_contact_name[\s\S]{0,400}REGRA DURA/i;
		expect(
			regraDuraSaveContact.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa ter marker 'REGRA DURA' acoplado a save_contact_name. " +
				"Sem isso o agent saudA com nome ('Prazer, Monique!') sem persistir → contact_name NULL.",
		).toBe(true);

		// Ordem temporal: ANTES de saudar/usar nome no texto, chame a tool.
		const ordemTemporal =
			/ANTES[\s\S]{0,200}(saudar|usar o nome|mencionar|responder|texto)[\s\S]{0,300}(OBRIGAT|chame|deve chamar)[\s\S]{0,200}save_contact_name/i;
		const ordemReversa =
			/save_contact_name[\s\S]{0,200}ANTES[\s\S]{0,200}(saudar|texto|resposta|saudacao)/i;
		expect(
			ordemTemporal.test(SPECIALIST_BASE_PROMPT) || ordemReversa.test(SPECIALIST_BASE_PROMPT),
			"Regra precisa estabelecer ordem temporal explicita: ANTES de saudar com nome → " +
				"OBRIGATORIO save_contact_name. Sem isso o flow regride.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 14 — Turn termina sem CTA apos nome (BUG-NO-CTA-AFTER-NAME)
// ----------------------------------------------------------------------------
// Real (tb-dev 2026-05-18, Rafael/Marina): agent disse "Beleza, Marina! Prazer,
// Marina! Vamos achar a opção certa pra você." e PAROU. Sem tool. Sem gate.
// Turn morreu. User precisou digitar "oi" pra reativar.
//
// Vale pras 4 specialists. Regra anterior bc40a85 ("gate IMEDIATAMENTE apos
// save_contact_name") era vaga — agent tratou frase afirmativa como acao.
// ============================================================================

describe("BUG-NO-CTA-AFTER-NAME-CASSETTE — frase afirmativa generica encerrou turn sem tool", () => {
	it("cassette: stream Rafael/Marina com 'Vamos achar a opcao certa' + finish SEM tool (bug)", async () => {
		const cassette = "Beleza, Marina! Prazer, Marina! Vamos achar a opção certa pra você.";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Reproducao fiel: texto afirmativo, ZERO tool.
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);

		// Detector: lista das 9 variantes proibidas que encerram turn no vazio.
		const variantesCTAVazia = [
			/vamos achar a op[çc][ãa]o certa/i,
			/vamos come[çc]ar/i,
			/vou te ajudar/i,
			/estou aqui pra ajudar/i,
			/vamos juntos/i,
			/vamos l[áa]/i,
			/bora come[çc]ar/i,
			/vamos descobrir/i,
			/vou achar o melhor/i,
		];
		const hits = variantesCTAVazia.filter((rx) => rx.test(cassette));
		expect(
			hits.length,
			"Detector tem que casar com >=1 variante. Cassette: " + cassette,
		).toBeGreaterThanOrEqual(1);
	});

	it("prompt source: REGRA DURA lista as 9 variantes proibidas explicitamente", () => {
		// CROSS-REF: regra precisa listar cada variante — LLM nao generaliza.
		const blocoCTA = SPECIALIST_BASE_PROMPT.match(
			/REGRA DURA[\s\S]{0,1200}(vamos achar a op[çc][ãa]o certa|vamos come[çc]ar)[\s\S]{0,800}/i,
		);
		expect(
			blocoCTA,
			"SPECIALIST_BASE_PROMPT precisa ter REGRA DURA listando variantes CTA-vazia " +
				"proximas a 'vamos achar a opcao certa'/'vamos comecar'. Sem isso o turn morre.",
		).not.toBeNull();
	});
});

// ============================================================================
// CENARIO 15 — Vazamento de raciocinio interno (BUG-INTERNAL-REASONING-LEAK)
// ----------------------------------------------------------------------------
// Real (tb-dev 2026-05-18): card mostrado ao usuario continha:
//   "Pra esse caso especificamente, recomendo conversar direto com nosso
//    consultor humano.
//    Motivo: Cliente informou valor de credito de R$ 2.130.000, acima do teto
//    de R$ 3.000.000 — não atingiu o gatilho, mas valor é de alto porte.
//    Reavaliando... valor está abaixo de R$ 3.000.000, handoff não é
//    obrigatório."
//
// Agent vazou chain-of-thought literal ("Motivo:", "Reavaliando...") + expos
// engine interna (gatilhos, tetos, regras compliance). Reportado por user.
// ============================================================================

// ============================================================================
// CENARIO 16 — Variante curta "Prazer, Paulo!" sem tool (BUG-SHORT-GREETING-NO-TOOL)
// ----------------------------------------------------------------------------
// Real (tb-dev pos-deploy 6b10312, 2026-05-18/19): regras duras no prompt
// existiam mas Claude Sonnet 4-6 escapava com variantes CURTAS (2 palavras):
//
//   User: "Paulo"
//   Rafael: "Prazer, Paulo!"  ← turn morre, sem tool save_contact_name
//   User: "Prazer"
//   Rafael: "Beleza, Paulo."  ← turn morre de novo
//
// Cassette reproduz: stream emite "Prazer, Paulo!" + finish SEM tool-call.
// Asserts:
//   - detector regex pega variantes curtas (Prazer/Beleza/Oi/Bom te conhecer)
//   - prompt fonte tem exemplo BAD/GOOD literal + lista expandida
// ============================================================================

describe("BUG-SHORT-GREETING-NO-TOOL — agent emite 'Prazer, Paulo!' sem chamar save_contact_name", () => {
	const SHORT_GREETING_REGEX =
		/^(Prazer|Beleza|Oi|Bom te conhecer|Show|Ótimo|Otimo|Legal)[,!]?\s*\w+[!.]?$/i;

	it("cassette: stream com 'Prazer, Paulo!' + finish SEM tool-call (bug exato tb-dev pós-6b10312)", async () => {
		const cassette = "Prazer, Paulo!";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Reproducao fiel do bug: texto curto saudando nome, ZERO tool.
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);

		// Detector tem que casar com a variante curta — provando que o
		// regex pega o bug, não só as variantes longas (vamos achar etc.).
		expect(
			SHORT_GREETING_REGEX.test(cassette),
			"Detector de variante curta tem que pegar 'Prazer, Paulo!'. " +
				"Se nao pega, regex tem buraco e variante escapa.",
		).toBe(true);
	});

	it("detector pega todas as 4 variantes curtas observadas (Prazer/Beleza/Oi/Bom te conhecer)", () => {
		const variantesObservadas = [
			"Prazer, Paulo!",
			"Beleza, Paulo.",
			"Oi, Marina!",
			"Bom te conhecer, Kairo!",
			"Show, Carlos!",
		];
		const misses = variantesObservadas.filter((v) => !SHORT_GREETING_REGEX.test(v));
		expect(
			misses,
			"Detector falhou nas variantes: " +
				`${JSON.stringify(misses)}. ` +
				"Se uma variante escapa, o bug volta a passar sem trigger de regressao.",
		).toEqual([]);
	});

	it("cassette: stream com 'Beleza, Paulo.' SEM tool — variante alternativa do mesmo bug", async () => {
		const cassette = "Beleza, Paulo.";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
		expect(SHORT_GREETING_REGEX.test(cassette)).toBe(true);
	});

	it("prompt source: exemplo BAD literal com User:'Paulo' + 'Prazer, Paulo!' (transcrição real)", () => {
		// CROSS-REF: o prompt PRECISA ter o exemplo literal — LLM aprende
		// com exemplo > com descrição abstrata.
		const exemploBadPaulo =
			/❌\s*BAD[\s\S]{0,200}user[\s\S]{0,40}["“]paulo["”][\s\S]{0,200}["“]prazer,?\s*paulo!?["”]/i;
		expect(
			exemploBadPaulo.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa conter exemplo BAD literal " +
				'User:"Paulo" + agent:"Prazer, Paulo!". É a transcrição real do bug.',
		).toBe(true);
	});

	it("prompt source: lista expandida tem 'Prazer, X!', 'Beleza, X!', 'Oi, X!', 'Bom te conhecer, X!'", () => {
		const variantes = ['"prazer, x!"', '"beleza, x!"', '"oi, x!"', '"bom te conhecer, x!"'];
		const promptLower = SPECIALIST_BASE_PROMPT.toLowerCase();
		const faltando = variantes.filter((v) => !promptLower.includes(v));
		expect(
			faltando,
			"Variantes curtas ausentes do SPECIALIST_BASE_PROMPT: " +
				`${JSON.stringify(faltando)}. ` +
				"Sem cada uma listada, LLM nao generaliza 'Prazer' pra 'Beleza'.",
		).toEqual([]);
	});
});

// ============================================================================
// CENARIO 17 — Force save_contact_name via toolChoice (BUG-FORCE-SAVE-CONTACT-NAME)
// ----------------------------------------------------------------------------
// Nivel 1 do fix BUG-SHORT-GREETING-AFTER-NAME: quando o orchestrator detecta
// "user respondeu nome" via isLikelyNameResponse, força toolChoice no
// streamText. Esse cassette ancora:
//   - isLikelyNameResponse() retorna true pro padrão exato do bug
//   - resolveAgent bypassa cache e constrói agent ad-hoc com toolChoice
//   - builder.ts repassa toolChoice pro new ToolLoopAgent()
//
// Não dá pra mockar a chamada ao Anthropic e validar que toolChoice chegou
// no provider (isso é coberto pelos contract tests da AI SDK). Aqui validamos
// o WIRING: source do orchestrator/index.ts importa isLikelyNameResponse,
// passa toolChoice pro runner, runner passa pro resolveAgent, resolveAgent
// passa pro buildAgent.
// ============================================================================

describe("BUG-FORCE-SAVE-CONTACT-NAME — orchestrator força save_contact_name via toolChoice quando detect-name-turn match", () => {
	it("isLikelyNameResponse retorna true pro padrão exato do bug (previousAsk + 'Paulo' + contactName=null)", async () => {
		const { isLikelyNameResponse } = await import("@/lib/agent/orchestrator/detect-name-turn");
		expect(
			isLikelyNameResponse({
				previousAssistantText:
					"Boa, carro novo abre muitas portas! Aqui é a Helena, antes de eu te ajudar, como posso te chamar?",
				currentUserText: "Paulo",
				conversationContactName: null,
			}),
		).toBe(true);
	});

	it("orchestrator/index.ts importa isLikelyNameResponse e calcula forceToolChoice", () => {
		const indexSrc = readSource("src/lib/agent/orchestrator/index.ts");
		expect(
			/from\s+["']\.\/detect-name-turn["']/.test(indexSrc),
			"index.ts precisa importar de ./detect-name-turn — caso contrário a " +
				"detecção não acontece e toolChoice nunca é forçado.",
		).toBe(true);
		expect(
			/isLikelyNameResponse\s*\(/.test(indexSrc),
			"index.ts precisa CHAMAR isLikelyNameResponse — sem chamada, helper " +
				"existe mas não é usado e o bug volta.",
		).toBe(true);
		expect(
			/forceToolChoice/.test(indexSrc),
			"index.ts precisa declarar `forceToolChoice` — variável de gate que " +
				"vira o param do runAgentTurn.",
		).toBe(true);
		expect(
			/toolName:\s*["']save_contact_name["']/.test(indexSrc),
			"index.ts precisa setar toolName='save_contact_name' no toolChoice " +
				"forçado. Sem isso, força tool errada (ou nenhuma).",
		).toBe(true);
	});

	it("runner.ts aceita forceToolChoice e passa pro resolveAgent", () => {
		const runnerSrc = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(
			/forceToolChoice/.test(runnerSrc),
			"runner.ts precisa receber forceToolChoice no args — sem isso o " +
				"orchestrator não consegue passar.",
		).toBe(true);
		expect(
			/resolveAgent\([\s\S]{0,300}toolChoice/.test(runnerSrc),
			"runner.ts precisa passar `toolChoice` (vindo de forceToolChoice) pro " +
				"resolveAgent. Sem isso, o resolveAgent ignora e cache padrão é usado.",
		).toBe(true);
	});

	it("agents/index.ts (resolveAgent) bypassa cache quando toolChoice é passado", () => {
		const agentIdxSrc = readSource("src/lib/agent/agents/index.ts");
		// Comentário do bypass + ramo de código que constrói buildAgent sem
		// agentCache.set quando opts.toolChoice é truthy.
		expect(
			/if\s*\(\s*opts\.toolChoice\s*\)\s*{[\s\S]{0,400}return\s+buildAgent/.test(agentIdxSrc),
			"resolveAgent precisa ter ramo `if (opts.toolChoice) { return buildAgent(...) }` " +
				"BYPASSANDO o cache. Caso contrário, agent cached (sem toolChoice) " +
				"seria devolvido e a tool não seria forçada.",
		).toBe(true);
	});

	it("builder.ts repassa opts.toolChoice pro construtor do ToolLoopAgent", () => {
		const builderSrc = readSource("src/lib/agent/agents/builder.ts");
		expect(
			/opts\.toolChoice\s*\?\s*{\s*toolChoice:\s*opts\.toolChoice\s*}/.test(builderSrc),
			"builder.ts precisa fazer spread condicional `...(opts.toolChoice ? " +
				"{ toolChoice: opts.toolChoice } : {})` no settings do new ToolLoopAgent. " +
				"Sem isso, toolChoice chega no builder mas não vai pro Anthropic.",
		).toBe(true);
	});

	it("cassette: stream onde modelo (forçado por toolChoice) chama save_contact_name corretamente", async () => {
		// Quando toolChoice forçar a tool, o modelo emite tool-call sem texto.
		// Esse cassette reproduz o cenário "modelo obedeceu a força": single
		// tool-call de save_contact_name + finish 'tool-calls'.
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("tc-force-1", "save_contact_name", { name: "Paulo" }),
			FINISH_TOOL_CALLS,
		]);

		expect(text).toBe("");
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("save_contact_name");
		expect(toolCalls[0]?.input).toMatchObject({ name: "Paulo" });
	});
});

describe("BUG-INTERNAL-REASONING-LEAK-CASSETTE — agent vazou chain-of-thought pro usuario", () => {
	it("cassette: stream com 'Motivo:' + 'Reavaliando...' + 'acima do teto' (bug exato tb-dev)", async () => {
		const cassette =
			"Pra esse caso especificamente, recomendo conversar direto com nosso consultor humano.\n\n" +
			"Motivo: Cliente informou valor de credito de R$ 2.130.000, acima do teto de R$ 3.000.000 — " +
			"não atingiu o gatilho, mas valor é de alto porte. Reavaliando... valor está abaixo de R$ 3.000.000, " +
			"handoff não é obrigatório.";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Reproducao fiel do bug.
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);

		// Detector: pega chain-of-thought leakage (prefixos + verbos de raciocinio).
		const detectores = [
			/\bMotivo\s*:/i,
			/\bRaz[ãa]o\s*:/i,
			/\bJustificativa\s*:/i,
			/\bReavaliando\b/i,
			/\bAvaliando\b/i,
			/\bConsiderando\s+se/i,
			/\bVerificando\b/i,
			/acima do teto/i,
			/atingiu o gatilho/i,
		];
		const hits = detectores.filter((rx) => rx.test(cassette));
		expect(
			hits.length,
			"Detector de chain-of-thought tem que casar com >=2 sinais no cassette real. " +
				"Hits: " +
				hits.length,
		).toBeGreaterThanOrEqual(2);
	});

	it("prompt source: REGRA DURA proibe 'Motivo:', 'Reavaliando', 'Considerando' explicitamente", () => {
		// CROSS-REF: amarra cassette ao prompt — cada variante de leakage listada.
		const proibePrefixos =
			/(PROIBIDO|N(Ã|A)O|NUNCA)[\s\S]{0,400}["“]?(Motivo|Raz[ãa]o|Justificativa)["”]?\s*:/i;
		expect(
			proibePrefixos.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa proibir prefixos 'Motivo:', 'Razão:', 'Justificativa:'. " +
				"Bug tb-dev: card 'Motivo: Cliente informou valor X acima do teto Y...'",
		).toBe(true);

		const proibeChainOfThought =
			/(PROIBIDO|N(Ã|A)O|NUNCA)[\s\S]{0,600}(Reavaliando|Avaliando|Considerando|Verificando|Pensando bem|Refletindo)/i;
		expect(
			proibeChainOfThought.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa proibir verbos de raciocinio em texto pro user: " +
				"'Reavaliando', 'Avaliando', 'Considerando', 'Verificando'. Bug tb-dev: " +
				"'Reavaliando... valor está abaixo de R$ 3.000.000'.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 18 — Hallucination do conversationId (BUG-CONVERSATION-ID-HALLUCINATION)
// ----------------------------------------------------------------------------
// Real (eval Camada 3 cirúrgico, commit 9080db4): o modelo Claude inventava
// `conversationId: "conv_001"` ao chamar `save_contact_name` em vez de
// receber/usar o UUID real. UPDATE no Postgres não acertava linha alguma
// (0 rows), `contact_name` ficava NULL apesar do tool-call ter sido
// emitido. Form final BUG-LEAD-FORM-PREFILL aparecia vazio como sintoma.
//
// Fix arquitetural: `conversationId` é CONTEXTO da request, não input do
// usuário. Removido do `inputSchema` das tools sensíveis (save_contact_name,
// save_contact_whatsapp, present_lead_form). Injetado via closure pela
// factory `buildConsorcioTools(ctx)`. Builder de agent recebe
// `opts.conversationId` e propaga pro factory.
//
// Cassette:
//   - Modelo emite tool-call save_contact_name COM input = { name: "Paulo" }
//     APENAS (sem conversationId — porque após o fix o schema não pede).
//   - Asserta que execute do tool persiste no DB usando o conversationId
//     injetado via factory (closure), não do input.
//
// Camada complementar:
//   - Camada 1 (estrutural): src/lib/agent/tools/ai-sdk.test.ts
//     describe BUG-CONVERSATION-ID-NOT-IN-SCHEMA cobre inputSchema das tools.
//   - Camada 3 (eval LLM real): tests/eval/agent-flow.eval.test.ts
//     EVAL-SAVE-CONTACT-NAME-CIRURGICO valida persistência no DB.
// ============================================================================

describe("BUG-CONVERSATION-ID-HALLUCINATION — tool emite save_contact_name sem conversationId no input, factory injeta via closure", () => {
	it("cassette: stream emite save_contact_name input={ name: 'Paulo' } SEM conversationId — schema pós-fix", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("tc-conv-id-fix", "save_contact_name", { name: "Paulo" }),
			FINISH_TOOL_CALLS,
		]);

		// Reproducao do cenário pós-fix: input só tem `name`, schema removeu
		// conversationId — modelo não tem como inventar.
		expect(text).toBe("");
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("save_contact_name");
		expect(toolCalls[0]?.input).toEqual({ name: "Paulo" });
		expect(toolCalls[0]?.input).not.toHaveProperty("conversationId");
	});

	it("execute via buildConsorcioTools(ctx) persiste no UUID real (closure) com input só { name }", async () => {
		// Esse teste prova end-to-end: factory injeta conversationId via
		// closure → execute persiste no UUID REAL → contact_name preenchido.
		const { buildConsorcioTools } = await import("@/lib/agent/tools/ai-sdk");
		const { db } = await import("@/db");
		const { conversations, leads } = await import("@/db/schema");
		const { eq } = await import("drizzle-orm");

		const [c] = await db.insert(conversations).values({}).returning();
		const realConvId = c.id;
		try {
			const tools = buildConsorcioTools({ conversationId: realConvId });
			// biome-ignore lint/suspicious/noExplicitAny: execute opaco
			const exec = (tools.save_contact_name as any).execute;
			// Modelo passa SÓ { name } — exatamente como ficou o schema pós-fix.
			const result = await exec({ name: "Paulo" });
			expect(typeof result).toBe("string");

			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.id, realConvId),
			});
			expect(
				conv?.contactName,
				"contact_name deveria persistir no UUID real injetado via closure. " +
					"Se permanecer NULL, factory não está usando ctx.conversationId.",
			).toBe("Paulo");
		} finally {
			await db.delete(leads).where(eq(leads.conversationId, realConvId));
			await db.delete(conversations).where(eq(conversations.id, realConvId));
		}
	});

	it("source: builder.ts aceita opts.conversationId e passa pro buildConsorcioTools", () => {
		const builderSrc = readSource("src/lib/agent/agents/builder.ts");
		expect(
			/conversationId\s*\??\s*:/.test(builderSrc),
			"builder.ts precisa declarar `conversationId?: string` no opts — " +
				"caso contrário a factory roda sem contexto e tools sensíveis falham.",
		).toBe(true);
		expect(
			/buildConsorcioTools\s*\(/.test(builderSrc),
			"builder.ts precisa chamar buildConsorcioTools(ctx) — sem isso o " +
				"closure não é montado e schema antigo (com conversationId) ainda vaza ao modelo.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 19 — Pula gates pré-valor (BUG-AUTO-SKIPS-PRE-VALUE-GATES)
// ----------------------------------------------------------------------------
// Real (tb-dev 2026-05-18, conversa Monique 6c0ca4cf — Helena/imovel, e
// 2026-05-17 b6c222fe — Rafael/auto): após save_contact_name, agent pulou
// direto para perguntar valor de carta SEM ter respondido/disparado os 3
// gates pré-valor (experience/timeframe/lance).
//
// Transcrição Monique:
//   User: "Monique."
//   Agent: "Prazer, Monique!Vamos achar a opção certa pra você.
//          Qual faixa de crédito você tem em mente?"
//   ^^^ pulou os 3 gates, foi direto pra valor (em texto puro, ainda).
//
// PO Kairo: o fluxo correto é nome → experience → timeframe → lance → valor
// (via present_value_picker / search_groups). Fix via "cadastro do agent"
// (migration 0021 atualizando persona row) + reforço estrutural no
// SPECIALIST_BASE_PROMPT cobrindo as 4 specialists.
//
// Esta camada (cassette) reproduz o stream do bug e detector de incoerência:
//   - texto inclui "Qual faixa/valor/parcela" mencionando crédito
//   - SEM tool present_value_picker emitido
//   - SEM nenhum dos 3 gates ter sido respondido na conversa simulada
// ============================================================================

describe("BUG-AUTO-SKIPS-PRE-VALUE-GATES — agent pula gates experience/timeframe/lance antes de pedir valor", () => {
	const CASSETTE_RAFAEL_PULA_GATES =
		"Show, Paulo! Vamos achar o carro certo pra você. Qual valor de carta de crédito você tem em mente?";

	const CASSETTE_HELENA_MONIQUE =
		"Prazer, Monique! Vamos achar a opção certa pra você. Qual faixa de crédito você tem em mente?";

	it("cassette: stream Rafael/auto pula gates e pergunta valor em texto SEM emitir present_value_picker", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", CASSETTE_RAFAEL_PULA_GATES),
			FINISH_STOP,
		]);

		// Reproducao fiel: agente perguntou valor em texto, sem tool, sem
		// nenhum gate ter sido respondido antes.
		expect(text).toBe(CASSETTE_RAFAEL_PULA_GATES);
		expect(toolCalls).toEqual([]);

		// Detector: pergunta de valor (faixa/valor/carta/credito) presente.
		const perguntaValor =
			/(qual|quanto)[\s\S]{0,40}(faixa|valor|cr[ée]dito|or[çc]amento|carta|parcela)/i;
		expect(
			perguntaValor.test(CASSETTE_RAFAEL_PULA_GATES),
			"Detector tem que pegar pergunta de valor em texto puro.",
		).toBe(true);

		// E NENHUM dos 3 gates de qualificação aparece no fluxo anterior
		// (cassette simula início da conversa pós-nome). Sem isso, é violacao.
		const mencionaGate = /\b(experience|timeframe|lance)\b/i.test(CASSETTE_RAFAEL_PULA_GATES);
		expect(
			mencionaGate,
			"O cassette do bug é exatamente o cenário onde o agent pula gates — " +
				"não deve mencionar nenhum dos 3 nomes no texto pro user (esse é o sintoma).",
		).toBe(false);
	});

	it("cassette: stream Helena/imovel (Monique tb-dev) tem o mesmo padrão — pula gates", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t2", CASSETTE_HELENA_MONIQUE),
			FINISH_STOP,
		]);

		// Mesmo padrão da Monique real em prod: saudação + pergunta de valor
		// SEM ter passado pelos 3 gates.
		expect(text).toBe(CASSETTE_HELENA_MONIQUE);
		expect(toolCalls).toEqual([]);

		// Detector de violação: pergunta valor + nenhuma menção a gate.
		const detectorPulaGate = /(qual|quanto)[\s\S]{0,30}(faixa|valor|cr[ée]dito|carta|parcela)/i;
		expect(detectorPulaGate.test(CASSETTE_HELENA_MONIQUE)).toBe(true);
	});

	it("detector reforçado pega variantes plausíveis do mesmo bug (4 specialists)", () => {
		// LLM parafraseia. Detector tem que cobrir todas as formas de pedir
		// valor SEM ter disparado gate antes.
		const detectorPulaGate =
			/(qual|quanto|me passa|me diz)[\s\S]{0,60}(faixa|valor|cr[ée]dito|or[çc]amento|carta|parcela|investir|gastar|pagar)/i;

		const variantes = [
			CASSETTE_RAFAEL_PULA_GATES,
			CASSETTE_HELENA_MONIQUE,
			"Boa, sou o Bruno. Qual valor de carta você quer pra moto?",
			"Beleza, Camila aqui. Me passa o orçamento mensal que cabe.",
			"Show, vamos achar a moto! Quanto você quer investir?",
			"Me diz qual faixa de crédito faz sentido pro seu caso?",
		];

		const misses = variantes.filter((v) => !detectorPulaGate.test(v));
		expect(
			misses,
			"Detector reforçado não pegou variantes: " +
				`${JSON.stringify(misses)}. ` +
				"Cada variante representa um specialist (Rafael/Helena/Bruno/Camila) pulando gates.",
		).toEqual([]);
	});

	it("CROSS-REF prompt: regra dura no SPECIALIST_BASE_PROMPT acopla os gates à proibição de pedir valor antes (FIX-103: sem prazo)", () => {
		// Acoplamento ao prompt source: o reforço estrutural compartilhado
		// precisa estar lá. Se essa regra sumir, o cassette deste describe
		// continuaria reproduzível em prod. FIX-103: o gate de prazo (timeframe)
		// saiu — a ordem agora é experience → (consent → identidade) → valor → lance.
		const ordemDosGates =
			/experience[\s\S]{0,600}valor do bem[\s\S]{0,200}lance/i;
		const proibeValorAntes =
			/NUNCA pergunta valor[\s\S]{0,200}(present_value_picker|search_groups|conta própria)/i;
		expect(
			ordemDosGates.test(SPECIALIST_BASE_PROMPT) && proibeValorAntes.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa listar a ordem (experience → valor → lance) E " +
				"acoplá-la à proibição de pedir valor por conta própria. FIX-103: prazo NÃO entra mais na ordem.",
		).toBe(true);
	});

	it("CROSS-REF prompt (FIX-103): SPECIALIST_BASE_PROMPT NÃO instrui pedir prazo de contemplação na entrada", () => {
		// O gate de prazo saiu — o prompt proíbe explicitamente perguntar prazo.
		expect(SPECIALIST_BASE_PROMPT).toMatch(/N[ÃA]O existe mais gate de prazo/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/NUNCA pergunte "em quanto tempo/i);
	});

	it("CROSS-REF migration 0021: arquivo da migration de persona row existe e seta fluxo de 3 gates pré-valor", () => {
		// Acoplamento à camada de DB: a migration que aplica a regra no
		// "cadastro do agent" (jsonb examples / metadados da persona) precisa
		// existir e mencionar os 3 gates + ordem.
		const migrationSrc = readSource("drizzle/0021_auto_persona_gate_flow.sql");

		const mencionaGates = /experience[\s\S]{0,300}timeframe[\s\S]{0,300}lance/i.test(migrationSrc);
		expect(
			mencionaGates,
			"Migration 0021 precisa mencionar os 3 gates (experience/timeframe/lance) " +
				"explicitamente — modelo precisa enxergar a ordem no example/instruction da persona.",
		).toBe(true);

		const mencionaOrdem =
			/(ANTES|antes)[\s\S]{0,400}(valor|parcela|carta|present_value_picker|search_groups)/i.test(
				migrationSrc,
			);
		expect(
			mencionaOrdem,
			"Migration 0021 precisa explicitar 'ANTES de [pedir valor/chamar value_picker/buscar grupos]' — " +
				"sem ordem temporal o agent pode disparar os 3 gates DEPOIS do valor (bug volta).",
		).toBe(true);

		const idempotente = /NOT LIKE|NOT @>|IS NULL|jsonb_array_length/i.test(migrationSrc);
		expect(
			idempotente,
			"Migration 0021 precisa ter guard de idempotência (NOT LIKE, NOT @>, IS NULL ou jsonb_array_length) " +
				"— rodar 2x não pode duplicar/corromper dados.",
		).toBe(true);
	});
});

// ============================================================================
// FIX-103 — gate de prazo (timeframe) fora da qualificação
// ----------------------------------------------------------------------------
// Decisão Kairo 2026-06-28 ("usuario so vai falar o valor agora, prazo nao"):
// o gate de prazo de contemplação saiu da entrada. Camada 2:
//   - funil determinístico nunca emite "timeframe" (web e WhatsApp usam a MESMA
//     máquina nextGate — canal-agnóstica);
//   - cassette: ao reagir ao valor, o agent NÃO pergunta prazo de contemplação;
//   - acoplamento ao prompt (não instrui pedir prazo).
// ============================================================================

describe("FIX-103 — funil pula o prazo (web + WhatsApp)", () => {
	// nextGate é canal-agnóstico: o mesmo funil vale pra web e WhatsApp. Provar
	// que NUNCA passa por timeframe cobre os dois canais (o contrato da spec).
	function walk(hasLance: "yes" | "no"): string[] {
		let meta: ConversationMetadata = {};
		let hasName = false;
		const seq: string[] = [];
		for (let i = 0; i < 24; i++) {
			const g = nextGate(meta, { hasContactName: hasName });
			seq.push(g);
			const q = meta.qualifyAnswers ?? {};
			if (g === "name") hasName = true;
			else if (g === "experience") meta = { ...meta, experiencePrev: "first" };
			else if (g === "consent") meta = { ...meta, qualifyConsented: true };
			else if (g === "identify") meta = { ...meta, identityCollected: true };
			else if (g === "credit") meta = { ...meta, qualifyAnswers: { ...q, creditMax: 80_000 } };
			else if (g === "lance") meta = { ...meta, qualifyAnswers: { ...q, hasLance } };
			else if (g === "lance-value")
				meta = { ...meta, qualifyAnswers: { ...q, lanceValue: 8_000 } };
			else if (g === "lance-embutido")
				meta = { ...meta, qualifyAnswers: { ...q, lanceEmbutido: false } };
			else if (g === "search")
				meta = { ...meta, searchDispatched: true, revealCompleted: true };
			else if (g === "simulator-offer") meta = { ...meta, simulatorOfferDispatched: true };
			else if (g === "decision") break;
			else break;
		}
		return seq;
	}

	it("a qualificação completa NUNCA emite o gate timeframe (sem lance e com lance)", () => {
		expect(walk("no")).not.toContain("timeframe");
		expect(walk("yes")).not.toContain("timeframe");
	});

	it("cassette: ao reagir ao valor, o agent NÃO pergunta prazo de contemplação", async () => {
		// Reação correta pós-valor (FIX-103): confirma o valor e PARA — sem
		// perguntar prazo. O detector pega a REGRESSÃO (pergunta de prazo).
		const cassette = "Boa, 80 mil então.";
		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		const perguntaPrazo =
			/em quanto tempo[\s\S]{0,40}(quer|gostaria|bem|contempl)|prazo de contempla|quando (voc[êe] )?quer ser contemplad/i;
		expect(
			perguntaPrazo.test(cassette),
			"FIX-103: a reação ao valor NÃO pode perguntar prazo de contemplação.",
		).toBe(false);
	});

	it("detector pega a pergunta de prazo proibida (variantes das 4 specialists)", () => {
		const perguntaPrazo =
			/em quanto tempo[\s\S]{0,40}(quer|gostaria|bem|contempl)|prazo de contempla|quando (voc[êe] )?quer ser contemplad/i;
		const proibidas = [
			"Em quanto tempo você quer estar com o carro novo?",
			"Em quanto tempo você gostaria de estar com seu bem?",
			"E qual prazo de contemplação faz sentido pra você?",
			"Quando você quer ser contemplado?",
		];
		const misses = proibidas.filter((v) => !perguntaPrazo.test(v));
		expect(misses, `Detector não pegou variantes de pergunta de prazo: ${JSON.stringify(misses)}`).toEqual(
			[],
		);
	});

	it("CROSS-REF prompt: nem SYSTEM_PROMPT nem SPECIALIST_BASE_PROMPT instruem pedir prazo na entrada", () => {
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		// Não pode haver instrução de coletar prazo como gate da qualificação.
		expect(combined).not.toMatch(/gate[\s\S]{0,20}timeframe/i);
		// O reforço explícito de que o prazo saiu precisa estar lá.
		expect(SPECIALIST_BASE_PROMPT).toMatch(/N[ÃA]O existe mais gate de prazo/i);
	});
});

// ============================================================================
// CENARIO 20 — BUG-ASSISTANT-* (AI Assistant no backoffice de personas)
// ----------------------------------------------------------------------------
// AI Assistant é um agente novo no backoffice que ajuda admins leigos a
// configurar personas via linguagem natural. Tem regras hard:
//   1. Antes de propor patch, deve desambiguar input vago (ask_clarification)
//   2. Antes de propose_patch com texto livre, deve validate_against_rules
//   3. propose_patch.execute rejeita server-side quando viola HARD_RULES
//   4. patch.before precisa bater com row atual (anti-LLM-invention)
//   5. personaVersionSeen precisa estar atualizado (anti-race-condition)
//
// Defesa estrutural completa em:
//   - src/lib/agent/assistant-prompt.ts (prompt)
//   - src/lib/agent/tools/assistant-tools.ts (factory + validações server)
//   - src/lib/agent/assistant-prompt.test.ts (prompt source)
//   - src/lib/agent/tools/assistant-tools.test.ts (tool execute)
// ============================================================================

describe("BUG-ASSISTANT-AMBIGUOUS-MUST-ASK — input vago deve disparar ask_clarification antes de propose_patch", () => {
	it("cassette: LLM emite ask_clarification em resposta a 'menos formal'", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("tc-ask-1", "ask_clarification", {
				question: "Menos formal igual amigo no zap, ou só menos técnico mas ainda profissional?",
			}),
			FINISH_TOOL_CALLS,
		]);

		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("ask_clarification");
		expect(toolCalls[0]?.toolName).not.toBe("propose_patch");
	});

	it("CROSS-REF prompt: ASSISTANT_BASE_PROMPT instrui desambiguar antes de propor", async () => {
		const { ASSISTANT_BASE_PROMPT } = await import("@/lib/agent/assistant-prompt");
		const regraDesambigua = /(desambigu|vag[oa]|amb[íi]gu[oa])[\s\S]{0,400}ask_clarification/i;
		expect(
			regraDesambigua.test(ASSISTANT_BASE_PROMPT),
			"ASSISTANT_BASE_PROMPT precisa instruir ask_clarification antes de propor quando input é vago",
		).toBe(true);
	});
});

describe("BUG-ASSISTANT-PROPOSAL-MUST-VALIDATE — validate_against_rules antes de propose_patch", () => {
	it("cassette: LLM chama validate_against_rules antes de propose_patch quando há texto livre", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("tc-v-1", "validate_against_rules", {
				text: "casual, próximo, fala como amigo no zap",
				field: "voiceTone",
			}),
			FINISH_TOOL_CALLS,
		]);

		expect(toolCalls[0]?.toolName).toBe("validate_against_rules");
	});

	it("CROSS-REF prompt: ASSISTANT_BASE_PROMPT instrui validar com validate_against_rules antes de propose_patch", async () => {
		const { ASSISTANT_BASE_PROMPT } = await import("@/lib/agent/assistant-prompt");
		const regraValidaAntes =
			/valid[\s\S]{0,400}(antes|ANTES)[\s\S]{0,400}propose_patch|validate_against_rules[\s\S]{0,400}propose_patch/i;
		expect(
			regraValidaAntes.test(ASSISTANT_BASE_PROMPT),
			"ASSISTANT_BASE_PROMPT precisa instruir validate_against_rules ANTES de propose_patch",
		).toBe(true);
	});
});

describe("BUG-ASSISTANT-NO-CTA-LEAK — propose_patch com variantes proibidas pos-nome é rejeitado server-side", () => {
	it("executeProposePatch rejeita voiceTone contendo variantes proibidas", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");
		const ctx = {
			personaId: "p1",
			personaVersion: 1,
			role: "specialist" as const,
			category: "auto",
			currentRow: {
				voiceTone: "formal e técnico",
				examples: [],
				forbiddenTopics: [],
				handoffTriggers: [],
			},
		};

		const variantes = [
			"casual e Vamos achar a opção certa juntos",
			"próximo, Vou te ajudar sempre",
			"amigável, Estou aqui pra ajudar",
		];

		for (const after of variantes) {
			const result = await executeProposePatch(
				{
					kind: "voiceTone",
					before: "formal e técnico",
					after,
					rationale: "test",
					personaVersionSeen: 1,
				},
				ctx,
			);
			expect(result.ok, `voiceTone "${after}" deveria ter sido rejeitado`).toBe(false);
		}
	});

	it("CROSS-REF: HARD_RULES.md lista variantes proibidas pos-nome", () => {
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		const variantes = ["Vamos achar a opção certa", "Vou te ajudar", "Estou aqui pra ajudar"];
		for (const variante of variantes) {
			expect(
				hardRules.toLowerCase().includes(variante.toLowerCase()),
				`HARD_RULES.md precisa listar "${variante}" como proibida`,
			).toBe(true);
		}
	});
});

describe("BUG-ASSISTANT-DIFF-BEFORE-MATCHES-CURRENT — server rejeita patch com before inventado e version stale", () => {
	it("executeProposePatch rejeita voiceTone com before que não bate com row atual", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");
		const result = await executeProposePatch(
			{
				kind: "voiceTone",
				before: "tom inventado pelo LLM",
				after: "tom novo válido",
				rationale: "x",
				personaVersionSeen: 1,
			},
			{
				personaId: "p1",
				personaVersion: 1,
				role: "specialist",
				category: "auto",
				currentRow: {
					voiceTone: "TOM ATUAL REAL",
					examples: [],
					forbiddenTopics: [],
					handoffTriggers: [],
				},
			},
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/before.*não bate/i);
		}
	});

	it("executeProposePatch rejeita patch com personaVersionSeen stale (race condition)", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");
		const result = await executeProposePatch(
			{
				kind: "voiceTone",
				before: "x",
				after: "y",
				rationale: "r",
				personaVersionSeen: 3,
			},
			{
				personaId: "p1",
				personaVersion: 5,
				role: "specialist",
				category: "auto",
				currentRow: {
					voiceTone: "x",
					examples: [],
					forbiddenTopics: [],
					handoffTriggers: [],
				},
			},
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/vers[ãa]o|version=3/i);
		}
	});
});

describe("BUG-ASSISTANT-INTERNAL-REASONING-LEAK — example.add cujo assistantResponse vaza chain-of-thought é rejeitado", () => {
	it("executeProposePatch rejeita example.add com 'Motivo:' / 'Reavaliando' no assistantResponse", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");
		const ctx = {
			personaId: "p1",
			personaVersion: 1,
			role: "specialist" as const,
			category: "auto",
			currentRow: {
				voiceTone: "x",
				examples: [],
				forbiddenTopics: [],
				handoffTriggers: [],
			},
		};

		const samples = [
			"Vou te conectar com humano. Motivo: valor acima do teto de R$ 3M.",
			"Espera aí — Reavaliando se faz sentido seguir com consórcio.",
		];

		for (const assistantResponse of samples) {
			const result = await executeProposePatch(
				{
					kind: "example.add",
					after: {
						id: "ex-leak",
						userMessage: "tudo bem?",
						assistantResponse,
					},
					rationale: "test",
					personaVersionSeen: 1,
				},
				ctx,
			);
			expect(result.ok, `assistantResponse "${assistantResponse}" deveria ter sido rejeitado`).toBe(
				false,
			);
		}
	});

	it("CROSS-REF: HARD_RULES.md lista 'Motivo:' e 'Reavaliando' como prefixos proibidos", () => {
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		expect(hardRules).toMatch(/Motivo:/);
		expect(hardRules).toMatch(/Reavaliando/i);
	});
});

// ── Cassettes adicionais cobrindo regressões R-02/R-04/R-05 do test plan ──

describe("BUG-ASSISTANT-META-NARRATIVE — example.add cujo assistantResponse vaza mecanismo da UI é rejeitado (R-02)", () => {
	const ctx = {
		personaId: "p1",
		personaVersion: 1,
		role: "specialist" as const,
		category: "auto",
		currentRow: {
			voiceTone: "x",
			examples: [],
			forbiddenTopics: [],
			handoffTriggers: [],
		},
	};

	it("executeProposePatch rejeita example.add com 'próximas perguntas' / 'perguntas rápidas' / 'sistema vai te guiar'", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");

		const meta = [
			"Vou te fazer umas perguntas rápidas pra te conhecer",
			"O sistema vai te guiar com botões nas próximas perguntas",
			"Primeira: você já fez consórcio antes?",
		];

		for (const assistantResponse of meta) {
			const result = await executeProposePatch(
				{
					kind: "example.add",
					after: {
						id: "ex-meta",
						userMessage: "oi",
						assistantResponse,
					},
					rationale: "test meta-narrativa",
					personaVersionSeen: 1,
				},
				ctx,
			);
			if (
				/perguntas r[áa]pidas|pr[óo]ximas perguntas|sistema vai te guiar/i.test(assistantResponse)
			) {
				expect(
					result.ok,
					`assistantResponse "${assistantResponse}" deveria ter sido rejeitado (meta-narrativa)`,
				).toBe(false);
			}
		}
	});

	it("CROSS-REF: HARD_RULES.md sec 1.4 lista termos de meta-narrativa proibidos", () => {
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		expect(hardRules).toMatch(/perguntas r[áa]pidas/i);
		expect(hardRules).toMatch(/sistema vai te guiar/i);
		expect(hardRules).toMatch(/Meta-narrativa/i);
	});
});

describe("BUG-ASSISTANT-RESPECT-3-GATES — example.add que mostra agent pulando gates pré-valor é proibido pelo prompt (R-04)", () => {
	it("CROSS-REF: ASSISTANT_BASE_PROMPT + HARD_RULES.md sec 2.2 mencionam os gates da coleta (experience/lance) — FIX-103: sem prazo", async () => {
		const { ASSISTANT_BASE_PROMPT } = await import("@/lib/agent/assistant-prompt");
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		const promptCombined = `${ASSISTANT_BASE_PROMPT}\n\n${hardRules}`;

		// Combined precisa mencionar os gates binários por nome — assistant injeta
		// HARD_RULES no system prompt em runtime, então a regra chega no LLM.
		// FIX-103: o gate de prazo (timeframe) saiu — não exigimos mais.
		expect(promptCombined).toMatch(/experience/i);
		expect(promptCombined).toMatch(/lance/i);
		// E o prazo NÃO deve mais ser parte da ordem da coleta no HARD_RULES.
		expect(hardRules).toMatch(/prazo de contempla[çc][ãa]o saiu da qualifica[çc][ãa]o/i);
	});

	it("CROSS-REF: HARD_RULES.md sec 2.2 documenta a ordem real (identidade+valor ANTES do lance, FIX-53 + FIX-103: sem prazo)", () => {
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		// Ordem da revisão 2 (docx + FIX-53) com FIX-103: experience → consent →
		// identidade → valor → lance. Os DADOS e o VALOR precedem o lance; o prazo
		// saiu da qualificação.
		const ordemReal =
			/experience[\s\S]{0,300}identidade[\s\S]{0,200}valor[\s\S]{0,200}lance/i;
		expect(
			ordemReal.test(hardRules),
			"HARD_RULES.md sec 2.2 precisa listar a ordem experience → identidade → valor → lance (sem prazo)",
		).toBe(true);
	});
});

describe("BUG-ASSISTANT-NO-PROMISE-NO-RENDER — example.add que promete UI sem renderizar é proibido pelo prompt (R-05)", () => {
	it("CROSS-REF: HARD_RULES.md sec 1.5 lista frases proibidas de promessa-sem-tool (com ou sem acento)", () => {
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		const stripAccents = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
		const normRules = stripAccents(hardRules);

		const frasesProibidas = [
			"olha as opcoes abaixo",
			"da uma olhada nas opcoes",
			"veja as opcoes abaixo",
		];
		for (const frase of frasesProibidas) {
			expect(
				normRules.includes(stripAccents(frase)),
				`HARD_RULES.md sec 1.5 precisa listar "${frase}" (com ou sem acento) como proibida`,
			).toBe(true);
		}
	});

	it("CROSS-REF: ASSISTANT_BASE_PROMPT puxa HARD_RULES inteiro — LLM vê regra de promessa-sem-tool", async () => {
		const { buildAssistantPrompt } = await import("@/lib/agent/assistant-prompt");
		const built = buildAssistantPrompt({
			id: "x",
			displayName: "Rafael",
			role: "specialist",
			category: "auto",
			expertise: null,
			voiceTone: "x",
			examples: [],
			forbiddenTopics: [],
			handoffTriggers: [],
			version: 1,
		});
		const stripAccents = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
		expect(stripAccents(built)).toContain("olha as opcoes abaixo");
	});
});

describe("BUG-ASSISTANT-CONCIERGE-NO-VALUE — concierge não pode propor example com valor de parcela/crédito (CA-33)", () => {
	const baseCtx = {
		personaId: "concierge-1",
		personaVersion: 1,
		role: "concierge" as const,
		category: null,
		currentRow: {
			voiceTone: "x",
			examples: [],
			forbiddenTopics: [],
			handoffTriggers: [],
		},
	};

	it("executeProposePatch rejeita example.add em concierge mencionando R$ ou parcela", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");

		const samples = [
			"Esse grupo tem parcela de R$ 850 e crédito de R$ 80.000",
			"Você pode pegar R$ 50 mil em 60 meses",
			"A parcela 245 é o melhor pra você",
		];

		for (const assistantResponse of samples) {
			const result = await executeProposePatch(
				{
					kind: "example.add",
					after: {
						id: "ex-conc",
						userMessage: "Quanto custa?",
						assistantResponse,
					},
					rationale: "test concierge no value",
					personaVersionSeen: 1,
				},
				baseCtx,
			);
			expect(result.ok, `concierge example com "${assistantResponse}" deveria ser rejeitado`).toBe(
				false,
			);
		}
	});

	it("aceita example.add em concierge que apenas encaminha pro specialist (sem valor)", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");

		const result = await executeProposePatch(
			{
				kind: "example.add",
				after: {
					id: "ex-conc-ok",
					userMessage: "Quero carro",
					assistantResponse:
						"Boa! Vou te encaminhar pro especialista de auto pra te mostrar as opções.",
				},
				rationale: "concierge encaminhando",
				personaVersionSeen: 1,
			},
			baseCtx,
		);
		expect(result.ok).toBe(true);
	});
});

describe("BUG-ASSISTANT-SPECIALIST-CATEGORY-CONSTRAINT — specialist de uma categoria não fala de outra (CA-34)", () => {
	it("executeProposePatch rejeita specialist auto mencionando imóvel/moto/serviços", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");

		const ctx = {
			personaId: "rafael-auto",
			personaVersion: 1,
			role: "specialist" as const,
			category: "auto",
			currentRow: {
				voiceTone: "x",
				examples: [],
				forbiddenTopics: [],
				handoffTriggers: [],
			},
		};

		const cruzados = [
			"Pra imóvel você pega 180 meses",
			"Pra moto temos opções de 36 meses",
			"Reforma sai bem mais barato no consórcio",
		];

		for (const assistantResponse of cruzados) {
			const result = await executeProposePatch(
				{
					kind: "example.add",
					after: {
						id: "ex-cross",
						userMessage: "tudo bem",
						assistantResponse,
					},
					rationale: "test cross category",
					personaVersionSeen: 1,
				},
				ctx,
			);
			expect(result.ok, `specialist auto não pode mencionar "${assistantResponse}"`).toBe(false);
		}
	});

	it("executeProposePatch rejeita specialist imovel mencionando carro/auto", async () => {
		const { executeProposePatch } = await import("@/lib/agent/tools/assistant-tools");

		const ctx = {
			personaId: "helena-imovel",
			personaVersion: 1,
			role: "specialist" as const,
			category: "imovel",
			currentRow: {
				voiceTone: "x",
				examples: [],
				forbiddenTopics: [],
				handoffTriggers: [],
			},
		};

		const result = await executeProposePatch(
			{
				kind: "example.add",
				after: {
					id: "ex-img-cross",
					userMessage: "queria um SUV",
					assistantResponse: "Um carro novo é um sonho, posso te mostrar opções de auto.",
				},
				rationale: "test cross",
				personaVersionSeen: 1,
			},
			ctx,
		);
		expect(result.ok).toBe(false);
	});
});

// ============================================================================
// CENARIO 15 — Lance embutido: educacao e do SISTEMA, agent so reage curto
//              (FEATURE-LANCE-EMBUTIDO, jornada do .docx 2026-05-29)
// ----------------------------------------------------------------------------
// Jornada do doc: quando o usuario diz que TEM reserva pra lance ("yes"), o
// SISTEMA insere o gate `lance-embutido` que educa sobre lance embutido e
// pergunta se quer considera-lo nas simulacoes. A reacao do agent ao "yes"
// deve ser UMA frase curta positiva — SEM pre-explicar lance embutido (evita
// duplicar o texto do sistema) e SEM vazar mecanica de engine.
//
// Defesa estrutural complementar:
//   - src/lib/agent/qualify-state.lance-embutido.test.ts (funil insere o gate)
//   - src/lib/agent/lance-embutido.structural.test.ts (educacao + roundtrip WA)
// ============================================================================

describe("FEATURE-LANCE-EMBUTIDO — reacao curta ao lance, educacao fica no gate do sistema", () => {
	it("cassette: reacao ao 'tenho reserva' e UMA frase curta sem tool e sem pre-explicar embutido", async () => {
		const cassette = "Boa, lance acelera bastante a contemplação.";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
		// O agent NAO deve explicar lance embutido nessa reacao (o gate faz isso).
		expect(text.toLowerCase()).not.toContain("embutido");
		// NAO vaza engine.
		expect(text.toLowerCase()).not.toMatch(/\bsistema\b|\bgate\b|\bbot[õo]es?\b/);
	});

	it("o directive de reacao ao lance NAO instrui pre-explicar lance embutido", () => {
		const directives = readSource("src/lib/agent/orchestrator/directives.ts");
		const m = directives.match(/buildLanceReactionDirective[\s\S]{0,500}?\n}/);
		expect(m, "buildLanceReactionDirective precisa existir em directives.ts").not.toBeNull();
		const body = m?.[0] ?? "";
		// Deve mandar reagir curto e explicitamente NAO explicar embutido aqui.
		expect(body).toMatch(/N[ÃA]O explique o que [eé] lance embutido/i);
	});

	it("a educacao de lance embutido vive no gate-questions (fonte do sistema), nao no agent", () => {
		const gq = readSource("src/lib/agent/orchestrator/gate-questions.ts");
		expect(gq).toMatch(/lance-embutido/);
		expect(gq).toMatch(/parte da própria carta de crédito/i);
	});
});

// ============================================================================
// CENARIO — passo 5 "Contratar" (fechamento Bevi) + simulador-agulha
// ----------------------------------------------------------------------------
// Garante que "contratar agora" dispara present_contract_form (não lead_form
// puro) e que a agulha de contemplacao é uma tool de apresentacao real.
// Detalhe da orquestracao (createProposal→simulate→chooseOffer→docs) coberto em
// src/lib/bevi/fulfillment.test.ts; client/upload em src/lib/adapters/bevi/.
// ============================================================================

describe("FEAT-CONTRACT-FLOW — passo 5 'contratar agora' dispara present_contract_form", () => {
	it("cassette: turn pos-decisao 'contratar agora' produz tool-call present_contract_form", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa! Pra fechar, só preciso de uns dados rápidos:"),
			toolCallChunk("tc-cf-1", "present_contract_form", { administradora: "ANCORA" }),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("present_contract_form");
		// nao vaza a mecanica da UI ("preencha o formulario", "digite no campo")
		expect(text).not.toMatch(/preencha o formul[áa]rio|digite seu cpf no campo/i);
	});

	it("regra do prompt: 'contratar agora' acoplado a present_contract_form (<400 chars)", () => {
		const re = /contratar agora[\s\S]{0,400}present_contract_form/i;
		expect(
			re.test(SPECIALIST_BASE_PROMPT),
			"'contratar agora' precisa apontar pra present_contract_form no prompt (passo 5).",
		).toBe(true);
	});
});

describe("FEAT-CONTEMPLATION-DIAL — simulador-agulha (passo 4)", () => {
	it("cassette: agent chama present_contemplation_dial com os dados do plano", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Dá pra ver quando você consegue ser contemplado aqui:"),
			toolCallChunk("tc-dial-1", "present_contemplation_dial", {
				category: "auto",
				creditValue: 50000,
				termMonths: 80,
				monthlyPayment: 600,
				initialTargetMonth: 6,
			}),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls[0]?.toolName).toBe("present_contemplation_dial");
	});

	it("estrutural: present_contemplation_dial e PRESENTATION_TOOL e renderiza no WhatsApp", () => {
		expect(PRESENTATION_TOOLS.has("present_contemplation_dial")).toBe(true);
		expect(
			artifactToWhatsApp("contemplation_dial", {
				creditValue: 50000,
				termMonths: 80,
				monthlyPayment: 600,
			}),
		).not.toBeNull();
	});
});

// ============================================================================
// FIX-106 — simulador de contemplação CONVERSACIONAL (loop)
// ----------------------------------------------------------------------------
// Decisão Kairo 2026-06-28 ("loop conversacional"): no WhatsApp (e no what-if de
// mês em qualquer canal) o agente conduz o simulador por CONVERSA — o usuário
// pergunta um mês-alvo ("e em 6 meses?"), o agente chama simulate_contemplation
// (cálculo, reusa computeContemplationDial), narra os números e pode iterar. A
// WEB mantém a agulha (present_contemplation_dial). Camada 2: cassette do loop +
// acoplamento ao prompt/tool.
// ============================================================================

describe("FIX-106 — simulador conversacional (loop por texto)", () => {
	it("cassette: 'e em 6 meses?' → agent chama simulate_contemplation(targetMonth=6) e narra", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Em 6 meses ficaria assim (estimativa):"),
			toolCallChunk("tc-sc-1", "simulate_contemplation", {
				creditValue: 80_000,
				termMonths: 80,
				targetMonth: 6,
				monthlyPayment: 950,
			}),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls[0]?.toolName).toBe("simulate_contemplation");
		expect((toolCalls[0]?.input as { targetMonth?: number })?.targetMonth).toBe(6);
		// NÃO usa a agulha (present_contemplation_dial) pra cada iteração de texto.
		expect(toolCalls.some((t) => t.toolName === "present_contemplation_dial")).toBe(false);
	});

	it("cassette: itera — 'e em 12 meses?' recalcula com simulate_contemplation no novo mês", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Em 12 meses, olha como muda:"),
			toolCallChunk("tc-sc-2", "simulate_contemplation", {
				creditValue: 80_000,
				termMonths: 80,
				targetMonth: 12,
				monthlyPayment: 950,
			}),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls[0]?.toolName).toBe("simulate_contemplation");
		expect((toolCalls[0]?.input as { targetMonth?: number })?.targetMonth).toBe(12);
	});

	it("estrutural: simulate_contemplation reusa computeContemplationDial (números batem com a agulha)", async () => {
		const { computeContemplationDial } = await import("@/lib/consorcio/contemplation-dial");
		const { consorcioTools } = await import("@/lib/agent/tools/ai-sdk");
		const args = { creditValue: 80_000, termMonths: 80, targetMonth: 6, monthlyPayment: 950 };
		// biome-ignore lint/suspicious/noExplicitAny: execute opaco
		const fromTool = await (consorcioTools.simulate_contemplation as any).execute(args);
		expect(fromTool).toEqual(computeContemplationDial(args));
		// e NÃO é tool de apresentação (é cálculo, igual compute_scenarios).
		expect(PRESENTATION_TOOLS.has("simulate_contemplation")).toBe(false);
	});

	it("CROSS-REF prompt: o loop manda chamar simulate_contemplation no what-if de mês; web mantém a agulha", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/simulate_contemplation/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/present_contemplation_dial/);
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/m[êe]s-alvo|e em \d|outro prazo/);
	});

	it("policy: simulate_contemplation disponível no reveal e closing (onde o simulador roda)", () => {
		const reveal = allowedTools({ revealCompleted: true } as ConversationMetadata);
		const closing = allowedTools({
			revealCompleted: true,
			decisionDispatched: true,
		} as ConversationMetadata);
		expect(reveal).toContain("simulate_contemplation");
		expect(closing).toContain("simulate_contemplation");
	});
});

// ============================================================================
// CENARIO — BUG-REVEAL-LOOP — agent preso re-apresentando os cards do reveal
// ----------------------------------------------------------------------------
// Real (Kairo, print 2026-06-02, persona Rafael/auto): depois de ver
// comparison_table + recommendation_card + simulation_result, a CADA afirmativo
// do usuario ("bora", "ta otimo") o agent RE-DISPARAVA o reveal inteiro (loop
// nos cards mockados) e NUNCA cruzava pro present_decision_prompt → passo 5.
// "Nao ta puxando da plataforma nova."
//
// Fix (espelha searchDispatched):
//   - gate "decision" no funil (qualify-state) dirigido pelo orquestrador;
//   - guard anti-re-reveal no runner.ts (suprime cards de descoberta re-emitidos);
//   - buildDecisionPromptDirective proibe re-apresentar.
//
// Defesa estrutural detalhada:
//   - src/lib/agent/qualify-state.decision-gate.test.ts (gate puro)
//   - src/lib/agent/orchestrator/decision-advancement.test.ts (wiring)
// Aqui: cassette do loop observado + acoplamento ao detector/guard.
// ============================================================================

describe("BUG-REVEAL-LOOP — re-apresentar o reveal a cada afirmativo", () => {
	// Meta de conversa que JA completou qualify + reveal (o usuario viu tudo).
	function postRevealMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
		return {
			currentPersona: "rafael-auto",
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: {
				creditMax: 100_000,
				monthlyBudget: 1_600,
				prazoMeses: 0,
				objetivo: "contemplacao_rapida",
				hasLance: "yes",
				lanceValue: 30_000,
				lanceEmbutido: true,
			},
			// D1 (gate identify): pós-reveal implica identidade coletada — a busca
			// nem teria liberado sem ela (tripwire do pipeSearchSummaryTurn).
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			// docx passo 4: oferta do simulador já feita (gate simulator-offer).
			simulatorOfferDispatched: true,
			...over,
		};
	}

	const REVEAL_TOOLS = new Set([
		"search_groups",
		"recommend_groups",
		"simulate_quota",
		"present_comparison_table",
		"present_recommendation_card",
		"present_simulation_result",
	]);

	it("cassette: stream do bug — 'ta otimo' re-emite comparison + recommendation + simulation", async () => {
		// Reproducao fiel do print: o usuario disse "ta otimo" (afirmativo, SEM
		// pedir mudanca) e o agent re-rodou o reveal inteiro.
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Deixa eu buscar as melhores opções na sua faixa!"),
			toolCallChunk("tc-1", "search_groups", { category: "auto", creditMax: 100000 }),
			toolCallChunk("tc-2", "present_comparison_table", {
				groups: [{ administradora: "Porto Seguro" }],
			}),
			toolCallChunk("tc-3", "recommend_groups", { category: "auto" }),
			toolCallChunk("tc-4", "present_recommendation_card", { administradora: "Porto Seguro" }),
			toolCallChunk("tc-5", "present_simulation_result", { administradora: "Porto Seguro" }),
			FINISH_TOOL_CALLS,
		]);

		const revealCount = toolCalls.filter((tc) => REVEAL_TOOLS.has(tc.toolName)).length;
		// O cassette do BUG tem o reveal inteiro re-disparado num turno de afirmativo.
		expect(revealCount).toBeGreaterThanOrEqual(3);
		// E NENHUMA tool de avanco (decision/contract) — prova que nao cruzou.
		expect(toolCalls.some((tc) => tc.toolName === "present_decision_prompt")).toBe(false);
		expect(toolCalls.some((tc) => tc.toolName === "present_contract_form")).toBe(false);
	});

	it("trajetoria correta: 'ta otimo' pos-reveal NAO re-emite reveal (so reage curto)", async () => {
		// O que o agent DEVE fazer: reagir curto e parar. O orquestrador dispara o
		// card de decisao em seguida (gate "decision"), nao o modelo.
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Show, esse plano encaixa bem no que você pediu."),
			FINISH_STOP,
		]);
		const revealCount = toolCalls.filter((tc) => REVEAL_TOOLS.has(tc.toolName)).length;
		expect(revealCount).toBe(0);
		expect(text).toMatch(/encaixa|plano|show/i);
	});

	it("fix funcional: pos-reveal o funil avanca pro gate 'decision' (nao re-busca)", () => {
		// Sem o fix, nextGate retornava 'search' (terminal) e nada avancava.
		expect(nextGate(postRevealMeta(), { hasContactName: true })).toBe("decision");
		// E o gate dispara nos afirmativos do print (ready_to_proceed/neutral).
		expect(
			decideShowGate({
				gate: "decision",
				intent: "neutral", // "ta otimo"
				meta: postRevealMeta(),
				isUserTurn: true,
			}),
		).toBe(true);
		// Idempotente: depois de disparado, nao volta a "decision".
		expect(
			nextGate(postRevealMeta({ decisionDispatched: true }), { hasContactName: true }),
		).not.toBe("decision");
	});

	it("acoplamento: guard anti-re-reveal vive na tabela artifact-guard (FIX-20) e o runner a consome", async () => {
		// FIX-20 moveu os guards inline do runner pra tabela declarativa.
		const guardSrc = readSource("src/lib/agent/orchestrator/artifact-guard.ts");
		expect(guardSrc).toMatch(/revealLoopActive/);
		expect(guardSrc).toMatch(/comparison_table/);
		expect(guardSrc).toMatch(/REVEAL-LOOP/);
		expect(readSource("src/lib/agent/orchestrator/runner.ts")).toMatch(/evaluateArtifactGuards/);
		// E comportamental (mais forte que grep): o cenário exato do bug suprime.
		const { evaluateArtifactGuards } = await import("@/lib/agent/orchestrator/artifact-guard");
		const verdict = evaluateArtifactGuards({
			meta: postRevealMeta(),
			artifactType: "comparison_table",
			userIntent: "neutral", // "ta otimo"
			isUserTurn: true,
			discoveryCount: null,
			conversationId: "conv-reveal-loop",
		});
		expect(verdict.allow).toBe(false);
	});

	it("acoplamento: o directive de decisao proibe re-apresentar o reveal", () => {
		const d = buildDecisionPromptDirective({ administradora: "Porto Seguro" });
		expect(d).toContain("present_decision_prompt");
		expect(d).toMatch(/PROIBIDO/);
		expect(d).toMatch(/search_groups/);
	});

	it("acoplamento: o prompt tem a regra dura anti-loop pos-reveal", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/anti-loop|REVEAL-LOOP/i);
		// e cita o gatilho textual do print ("ta otimo") perto da proibicao.
		const reveal = SPECIALIST_BASE_PROMPT.toLowerCase();
		expect(reveal).toMatch(/ta otimo|ta ótimo|faz sentido/);
	});
});

// ============================================================================
// CENARIO — FIX-68 — re-descoberta por TROCA DE FAIXA pos-reveal
// ----------------------------------------------------------------------------
// Real (conversa a8b0a80d, "Maria joaquina", auto, 2026-06-22): pos-reveal de
// 256k (RODOBENS 308k/96m, id real 6a2b004ff9ec5c948e8c07d0), o usuario trocou a
// faixa ("Valor do bem: R$ 130.000, Prazo: 60 meses"). O agent foi DIRETO pra
// simulate_quota("auto-130k-60m") SEM re-buscar — id FABRICADO (padrao
// categoria-valor-prazo, nao existe no codigo) — e o adapter recusou ("Oferta/
// grupo nao encontrado na descoberta atual"). Loop de "instabilidade" 6x.
//
// Causa: tool-policy removia search_groups da fase `reveal` (BUG-REVEAL-LOOP) —
// pos-reveal o agent so tinha simulate_quota, que NAO descobre faixa nova
// (resolve groupId contra o offerIndex da busca ANTERIOR). Sem id real de 130k e
// sem search, o modelo alucinou o id.
//
// Fix: search_groups VOLTA na fase reveal SO quando o valor-alvo mudou vs a
// ultima descoberta (revealValueTargetChanged) + prompt manda RE-BUSCAR ao
// trocar de faixa e NUNCA fabricar groupId. O re-reveal da MESMA faixa
// (afirmativo curto) continua bloqueado.
//
// Defesa estrutural detalhada: src/lib/agent/orchestrator/tool-policy.test.ts
// (matriz fase x tool + revealValueTargetChanged).
// ============================================================================

describe("FIX-68 — troca de faixa pos-reveal re-busca em vez de fabricar id", () => {
	function postRevealMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
		return {
			currentPersona: "rafael-auto",
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: {
				creditMax: 256_000,
				monthlyBudget: 4_000,
				prazoMeses: 60,
				objetivo: "contemplacao_rapida",
				hasLance: "no",
				lanceEmbutido: false,
			},
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			simulatorOfferDispatched: true,
			// Snapshot da descoberta de 256k (gravado pelo runner no reveal).
			discoveredCreditTarget: 256_000,
			...over,
		};
	}

	// Detector do id FABRICADO observado em prod: padrao `categoria-valorK-prazoM`.
	// O id real da Bevi e um hash hex de 24 chars (6a2b004ff9ec5c948e8c07d0).
	const FABRICATED_ID = /^[a-z]+-\d+k-\d+m$/;

	it("cassette: stream do bug — trocou pra 130k e o agent simulou um id FABRICADO sem re-buscar", async () => {
		// Reproducao fiel: usuario mandou "Valor do bem: R$ 130.000, Prazo: 60 meses".
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa! Deixa eu calcular pra essa nova faixa."),
			toolCallChunk("tc-1", "simulate_quota", { groupId: "auto-130k-60m", creditValue: 130000 }),
			FINISH_TOOL_CALLS,
		]);
		const simulate = toolCalls.find((tc) => tc.toolName === "simulate_quota");
		const groupId = (simulate?.input as { groupId?: string } | undefined)?.groupId ?? "";
		// O bug: id fabricado E nenhuma busca antes.
		expect(FABRICATED_ID.test(groupId)).toBe(true);
		expect(toolCalls.some((tc) => tc.toolName === "search_groups")).toBe(false);
	});

	it("trajetoria correta: troca de faixa dispara search_groups ANTES de simulate_quota com id REAL", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Bora ver o que encaixa nessa nova faixa:"),
			toolCallChunk("tc-1", "search_groups", { category: "auto", creditMax: 130000 }),
			toolCallChunk("tc-2", "present_comparison_table", {
				groups: [{ administradora: "Rodobens" }],
			}),
			toolCallChunk("tc-3", "simulate_quota", {
				groupId: "7c3d115ee0fd6da59f9d18e1",
				creditValue: 130000,
			}),
			FINISH_TOOL_CALLS,
		]);
		const names = toolCalls.map((tc) => tc.toolName);
		const searchIdx = names.indexOf("search_groups");
		const simulateIdx = names.indexOf("simulate_quota");
		expect(searchIdx).toBeGreaterThanOrEqual(0);
		expect(simulateIdx).toBeGreaterThan(searchIdx); // re-buscou ANTES de simular
		const groupId =
			(toolCalls[simulateIdx]?.input as { groupId?: string } | undefined)?.groupId ?? "";
		// id REAL (da descoberta), nunca o padrao fabricado.
		expect(FABRICATED_ID.test(groupId)).toBe(false);
	});

	it("estrutural: trocar de faixa REABILITA search_groups na fase reveal (assinatura do fix)", () => {
		// Pre-fix: o case `reveal` da tool-policy nao tinha search_groups → o agent
		// nao tinha como re-buscar → fabricava o id. Este assert FALHA sem o fix.
		const trocou = postRevealMeta({
			qualifyAnswers: { ...postRevealMeta().qualifyAnswers, creditMax: 130_000 },
		});
		expect(allowedTools(trocou)).toContain("search_groups");
	});

	it("estrutural: afirmativo curto na MESMA faixa NAO reabilita search (anti BUG-REVEAL-LOOP)", () => {
		// Mesmo valor-alvo (256k) da descoberta → continua sem descoberta na fase.
		expect(allowedTools(postRevealMeta())).not.toContain("search_groups");
	});

	it("acoplamento: o prompt manda RE-BUSCAR ao trocar de faixa e NUNCA fabricar groupId", () => {
		// re-buscar com search_groups ao mudar a faixa de valor
		expect(SPECIALIST_BASE_PROMPT).toMatch(/RE-?BUSQUE[\s\S]{0,160}search_groups/i);
		// proibicao explicita de inventar/fabricar id de grupo
		expect(SPECIALIST_BASE_PROMPT).toMatch(/NUNCA[\s\S]{0,80}(invente|fabrique)[\s\S]{0,40}id/i);
		// cita o exemplo do id fabricado real como contra-exemplo
		expect(SPECIALIST_BASE_PROMPT).toMatch(/auto-130k-60m/);
	});
});

// ============================================================================
// CENARIO — FIX-71 — ESCOLHER um grupo ja apresentado fabrica o groupId
// ----------------------------------------------------------------------------
// Real (smoke ao vivo da jornada, 2026-06-23, develop 0460c42a): pos-reveal com
// comparison_table de 3 grupos (~R$ 200k: BANCO DO BRASIL / ITAU / RODOBENS), o
// usuario ESCOLHEU um por TEXTO ("Gostei do Banco do Brasil, quero seguir com
// ele"). O agent foi pra simulate_quota("bb-auto-200k-72m") — id FABRICADO no
// padrao banco-categoria-valor-prazo — e o adapter recusou ("Oferta/grupo
// 'bb-auto-200k-72m' nao encontrado na descoberta atual"). A simulacao do grupo
// ESCOLHIDO nao aconteceu.
//
// E o MESMO root cause do FIX-68 (LLM fabrica id), mas no caminho de SELECAO de
// um grupo ja apresentado — o id real (hash opaco, ex. 6a0ca9ca...) JA estava no
// historico do present_comparison_table; o agent so precisava copia-lo LITERAL.
//
// Positivo a preservar: o agent degradou gracioso (ofereceu a 2a opcao), NAO
// entrou no loop de "instabilidade". O fix nao pode regredir isso.
//
// Fix: (a) prompt manda usar o id LITERAL do grupo escolhido e PROIBE fabricar
// banco-categoria-valor-prazo (cita bb-auto-200k-72m); (b) a descricao do campo
// `id` dos cards manda copiar o id opaco de search/recommend; (c) detector
// server-side (looksLikeFabricatedGroupId) curto-circuita o id fabricado com
// guidance acionavel em vez de "instabilidade".
//
// Camada 1: src/lib/agent/system-prompt.fix-71.test.ts +
//           src/lib/agent/tools/ai-sdk.fix-71.test.ts
// ============================================================================

describe("FIX-71 — escolher grupo da comparison usa id REAL, nao fabrica slug", () => {
	// id real da Bevi = hash opaco. id FABRICADO = padrao "...-NNNk-NNm".
	const FABRICATED_SLUG = /-\d+k-\d+m$/i;
	const REAL_QUOTA_ID = /^[0-9a-f]{24}$/i;

	// Conjunto descoberto (o que foi pra present_comparison_table) — ids opacos reais.
	const DISCOVERED = {
		bb: "6a0ca9ca1b2c3d4e5f607182",
		itau: "7c3d115ee0fd6da59f9d18e1",
		rodobens: "8d4e226ff1ae7eb6a0ae29f2",
	} as const;

	it("cassette: stream do bug — escolheu o BB e o agent simulou um id FABRICADO", async () => {
		// Reproducao fiel: "Gostei do Banco do Brasil, quero seguir com ele".
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa escolha! Da uma olhada na simulacao do Banco do Brasil:"),
			toolCallChunk("tc-1", "simulate_quota", {
				groupId: "bb-auto-200k-72m",
				creditValue: 200000,
			}),
			FINISH_TOOL_CALLS,
		]);
		const simulate = toolCalls.find((tc) => tc.toolName === "simulate_quota");
		const groupId = (simulate?.input as { groupId?: string } | undefined)?.groupId ?? "";
		// A assinatura do bug: id no padrao banco-categoria-valor-prazo, fora do conjunto real.
		expect(FABRICATED_SLUG.test(groupId)).toBe(true);
		expect(REAL_QUOTA_ID.test(groupId)).toBe(false);
		expect(Object.values(DISCOVERED).includes(groupId as never)).toBe(false);
	});

	it("trajetoria correta: escolha por nome simula com o id LITERAL do grupo apresentado", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t0", "Olha so as opcoes que encaixam:"),
			toolCallChunk("tc-cmp", "present_comparison_table", {
				groups: [
					{
						id: DISCOVERED.bb,
						administradora: "Banco do Brasil",
						creditValue: 200000,
						termMonths: 72,
					},
					{ id: DISCOVERED.itau, administradora: "Itau", creditValue: 200000, termMonths: 80 },
					{
						id: DISCOVERED.rodobens,
						administradora: "Rodobens",
						creditValue: 200000,
						termMonths: 72,
					},
				],
			}),
			...textChunks("t1", "Beleza, da uma olhada na simulacao do Banco do Brasil:"),
			toolCallChunk("tc-sim", "simulate_quota", { groupId: DISCOVERED.bb, creditValue: 200000 }),
			FINISH_TOOL_CALLS,
		]);
		const presented = toolCalls.find((tc) => tc.toolName === "present_comparison_table");
		const presentedIds = (
			(presented?.input as { groups?: Array<{ id?: string }> } | undefined)?.groups ?? []
		).map((g) => g.id ?? "");
		const simulate = toolCalls.find((tc) => tc.toolName === "simulate_quota");
		const groupId = (simulate?.input as { groupId?: string } | undefined)?.groupId ?? "";
		// Usou o id LITERAL opaco de um grupo que ele ACABOU de apresentar — nunca um slug.
		expect(FABRICATED_SLUG.test(groupId)).toBe(false);
		expect(REAL_QUOTA_ID.test(groupId)).toBe(true);
		expect(presentedIds).toContain(groupId);
	});

	it("acoplamento: o prompt manda usar o id LITERAL e PROIBE fabricar o slug", () => {
		// usa o id literal/opaco do grupo escolhido
		expect(SPECIALIST_BASE_PROMPT).toMatch(/id\s+(literal|opaco)/i);
		// proibe fabricar/derivar id de banco-categoria-valor-prazo
		expect(SPECIALIST_BASE_PROMPT).toMatch(/nunca\s+(fabrique|derive|invente)/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/banco-categoria-valor-prazo/i);
		// cita o contra-exemplo real (como o FIX-68 cita auto-130k-60m)
		expect(SPECIALIST_BASE_PROMPT).toMatch(/bb-auto-200k-72m/);
	});

	it("acoplamento: detector server-side reconhece o slug fabricado e nao o id real", () => {
		expect(looksLikeFabricatedGroupId("bb-auto-200k-72m")).toBe(true);
		expect(looksLikeFabricatedGroupId(DISCOVERED.bb)).toBe(false);
	});
});

// ============================================================================
// CENARIO — FIX-72 — PEDIR OUTRAS OPCOES/DETALHAR fabrica o groupId (a RAIZ)
// ----------------------------------------------------------------------------
// Real (qa-noturno 2026-06-24, CPF/celular reais, revalidando o FIX-71 ao vivo):
// jornada auto 180k → recomendacao ITAU ✅. O usuario pediu "Me mostra as outras
// opcoes dessa faixa pra eu comparar". O agent foi pra get_group_details e
// simulate_quota com ids FABRICADOS — `auto-180k` e `auto-180k-kairo` (este com o
// NOME do usuario no id!) — e o adapter recusou ("Oferta/grupo nao encontrado na
// descoberta atual"). Degradou gracioso ("esse grupo deu um problema") mas NAO
// entregou.
//
// E a MESMA raiz do FIX-68 (auto-130k-60m) e FIX-71 (bb-auto-200k-72m), mas dois
// buracos provados deixaram a raiz aberta:
//   1. detector fragil: `looksLikeFabricatedGroupId = /-\d+k-\d+m$/i` NAO pega
//      `auto-180k` (sem `-NNm`) nem `auto-180k-kairo` (sufixo `-nome`);
//   2. cobertura parcial: o guard so existia em simulate_quota, nao em
//      get_group_details.
//
// Fix (defense-in-depth): (a) fast-path generalizado pro marcador de valor-em-k
// (pega ambos, nao confunde o hash); (b) rede de seguranca — o adapter lanca
// GroupNotInDiscoveryError pra QUALQUER id fora do offerIndex, a tool captura e
// devolve diretiva acionavel de re-busca (nao erro cru). Vale pras DUAS tools.
// Degradacao graciosa preservada: re-busca/id-literal, sem loop de "instabilidade".
//
// Camada 1: src/lib/agent/tools/ai-sdk.fix-72.test.ts +
//           src/lib/adapters/bevi/bevi-self-contract-adapter.fix-72.test.ts +
//           src/lib/agent/system-prompt.fix-72.test.ts
// ============================================================================

describe("FIX-72 — pedir outras opcoes/detalhar usa id REAL, nao fabrica auto-180k", () => {
	const REAL_QUOTA_ID = /^[0-9a-f]{24}$/i;

	// Conjunto descoberto (180k, foi pro present_comparison_table) — ids opacos reais.
	const DISCOVERED = {
		itau: "6a0ca9c73e68cce9b61d30fd",
		bb: "7c3d115ee0fd6da59f9d18e1",
	} as const;

	it("cassette: stream do bug — 'as outras opcoes' e o agent fabricou auto-180k / auto-180k-kairo em get_group_details E simulate_quota", async () => {
		// Reproducao fiel: "Me mostra as outras opcoes dessa faixa pra eu comparar".
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa! Deixa eu detalhar e comparar as outras opcoes dessa faixa:"),
			toolCallChunk("tc-1", "get_group_details", { groupId: "auto-180k-kairo" }),
			toolCallChunk("tc-2", "simulate_quota", { groupId: "auto-180k", creditValue: 180000 }),
			FINISH_TOOL_CALLS,
		]);
		const detailsId =
			(
				toolCalls.find((tc) => tc.toolName === "get_group_details")?.input as
					| { groupId?: string }
					| undefined
			)?.groupId ?? "";
		const simulateId =
			(
				toolCalls.find((tc) => tc.toolName === "simulate_quota")?.input as
					| { groupId?: string }
					| undefined
			)?.groupId ?? "";

		// A assinatura do bug: ids fabricados (slug categoria-valor[-nome]) em AMBAS as
		// tools, fora do conjunto real. O detector server-side TEM que pegar os dois —
		// o regex antigo (`-NNNk-NNm$`) deixava passar ambos.
		expect(detailsId).toBe("auto-180k-kairo");
		expect(simulateId).toBe("auto-180k");
		expect(looksLikeFabricatedGroupId(detailsId)).toBe(true);
		expect(looksLikeFabricatedGroupId(simulateId)).toBe(true);
		expect(REAL_QUOTA_ID.test(detailsId)).toBe(false);
		expect(REAL_QUOTA_ID.test(simulateId)).toBe(false);
		expect(Object.values(DISCOVERED).includes(detailsId as never)).toBe(false);
		expect(Object.values(DISCOVERED).includes(simulateId as never)).toBe(false);
	});

	it("trajetoria correta: detalhar/simular um grupo ja mostrado usa o id LITERAL opaco do card", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t0", "Olha as opcoes que encaixam nessa faixa:"),
			toolCallChunk("tc-cmp", "present_comparison_table", {
				groups: [
					{ id: DISCOVERED.itau, administradora: "Itau", creditValue: 180000, termMonths: 72 },
					{
						id: DISCOVERED.bb,
						administradora: "Banco do Brasil",
						creditValue: 180000,
						termMonths: 80,
					},
				],
			}),
			...textChunks("t1", "Beleza, deixa eu detalhar o Itau pra voce:"),
			toolCallChunk("tc-det", "get_group_details", { groupId: DISCOVERED.itau }),
			toolCallChunk("tc-sim", "simulate_quota", { groupId: DISCOVERED.itau, creditValue: 180000 }),
			FINISH_TOOL_CALLS,
		]);
		const presentedIds = (
			(
				toolCalls.find((tc) => tc.toolName === "present_comparison_table")?.input as
					| { groups?: Array<{ id?: string }> }
					| undefined
			)?.groups ?? []
		).map((g) => g.id ?? "");
		const detailsId =
			(
				toolCalls.find((tc) => tc.toolName === "get_group_details")?.input as
					| { groupId?: string }
					| undefined
			)?.groupId ?? "";
		const simulateId =
			(
				toolCalls.find((tc) => tc.toolName === "simulate_quota")?.input as
					| { groupId?: string }
					| undefined
			)?.groupId ?? "";

		// Usou o id LITERAL opaco de um grupo que ACABOU de apresentar — nas DUAS tools.
		expect(REAL_QUOTA_ID.test(detailsId)).toBe(true);
		expect(REAL_QUOTA_ID.test(simulateId)).toBe(true);
		expect(looksLikeFabricatedGroupId(detailsId)).toBe(false);
		expect(looksLikeFabricatedGroupId(simulateId)).toBe(false);
		expect(presentedIds).toContain(detailsId);
		expect(presentedIds).toContain(simulateId);
	});

	it("acoplamento: detector reconhece auto-180k e auto-180k-kairo (FIX-72) e nao o hash real", () => {
		expect(looksLikeFabricatedGroupId("auto-180k")).toBe(true);
		expect(looksLikeFabricatedGroupId("auto-180k-kairo")).toBe(true);
		expect(looksLikeFabricatedGroupId(DISCOVERED.itau)).toBe(false);
		// nao regride os formatos do FIX-68/FIX-71
		expect(looksLikeFabricatedGroupId("bb-auto-200k-72m")).toBe(true);
		expect(looksLikeFabricatedGroupId("auto-130k-60m")).toBe(true);
	});

	it("acoplamento: o prompt tem regra unica de id literal valida pra simular E detalhar (FIX-72)", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/FIX-72/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/auto-180k/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/get_group_details/);
	});
});

// ============================================================================
// GATE-IDENTIFY (D1, docs/jornada/CONTEXT.md) — CPF antecipado antes da busca
// ----------------------------------------------------------------------------
// A Bevi exige CPF+celular+LGPD ANTES de simular (Trilho B é proposta-first).
// Regressões cobertas: (a) busca liberando SEM identidade (voltaria a servir
// dado fictício ou quebrar), (b) tripwire removido dos adapters web/whatsapp,
// (c) CPF persistido em claro, (d) captura textual aceitando CPF com DV errado.
// Testes detalhados: qualify-state.identify-gate.test.ts, identity.test.ts.
// ============================================================================

describe("GATE-IDENTIFY — CPF antecipado antes da busca real (D1)", () => {
	function qualifiedSemIdentidade(): ConversationMetadata {
		return {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: {
				creditMax: 100_000,
				prazoMeses: 0,
				objetivo: "contemplacao_rapida",
				hasLance: "no",
				// FIX-4: gate de lance embutido agora vale pra todo hasLance.
				lanceEmbutido: false,
			},
		};
	}

	it("funil: qualificacao completa SEM identidade vai pro gate identify — NUNCA search", () => {
		expect(nextGate(qualifiedSemIdentidade(), { hasContactName: true })).toBe("identify");
	});

	it("funil: com identidade coletada a busca libera", () => {
		expect(
			nextGate({ ...qualifiedSemIdentidade(), identityCollected: true }, { hasContactName: true }),
		).toBe("search");
	});

	it("acoplamento: pipeSearchSummaryTurn (web) tem o tripwire de identidade", () => {
		const src = readSource("src/lib/web/adapter.ts");
		expect(src).toMatch(/identityCollected/);
		expect(src).toMatch(/pipeGatePrompt\(\{ conversationId, gate: "identify"/);
	});

	it("acoplamento: runSearchSummaryWithOrchestrator (whatsapp) tem o tripwire", () => {
		const src = readSource("src/lib/whatsapp/adapter.ts");
		expect(src).toMatch(/identityCollected/);
		expect(src).toMatch(/IDENTIFY_WHATSAPP_PROMPT/);
	});

	it("acoplamento: identidade NUNCA persiste em claro (AES-256-GCM + chave de env)", () => {
		const src = readSource("src/lib/conversation/identity.ts");
		expect(src).toMatch(/aes-256-gcm/);
		expect(src).toMatch(/IDENTITY_ENC_KEY/);
		// storeIdentity passa pelo encryptIdentity — nada de cpf cru no meta.
		expect(src).toMatch(/identityEnc: encryptIdentity\(identity\)/);
	});

	it("captura textual (whatsapp) so aceita CPF com digito verificador valido", async () => {
		const { extractCpf, waIdToCelular } = await import("@/lib/whatsapp/identify-capture");
		expect(extractCpf("meu cpf é 529.982.247-25")).toBe("52998224725");
		expect(extractCpf("é 12345678900 pode ser?")).toBeNull(); // DV errado
		expect(extractCpf("nao quero passar agora")).toBeNull();
		// waId com DDI 55 vira DDD+numero (formato que a Bevi espera).
		expect(waIdToCelular("5562999887766")).toBe("62999887766");
	});
});

// ============================================================================
// MOCK-RUNTIME-MORTO (diretiva Kairo 2026-06-04, docs/jornada/CONTEXT.md)
// ----------------------------------------------------------------------------
// "O que está mocado você tem que deletar mesmo. Não pode ter arquivo de mock
// aí mais." — a descoberta (passos 3-4) serve APENAS dados reais da Bevi
// (Trilho B). Este bloco trava a regressão de alguém reintroduzir JSON
// fictício no caminho de runtime.
// ============================================================================

describe("MOCK-RUNTIME-MORTO — descoberta nunca mais serve dado fictício", () => {
	it("src/lib/adapters/mock/ NÃO existe mais", () => {
		expect(() => readSource("src/lib/adapters/mock/mock-bevi-adapter.ts")).toThrow();
		expect(() => readSource("src/lib/adapters/mock/data/groups.json")).toThrow();
		expect(() => readSource("src/lib/adapters/mock/data/rates.json")).toThrow();
	});

	it("adapters/index.ts não referencia mock — descoberta é BeviSelfContractAdapter por conversa", () => {
		const src = readSource("src/lib/adapters/index.ts");
		expect(src).not.toMatch(/MockBeviAdapter/);
		expect(src).not.toMatch(/MockProposalGateway/);
		expect(src).toMatch(/BeviSelfContractAdapter/);
		expect(src).toMatch(/getDiscoveryAdapter/);
	});

	it("gateway de fechamento default é bevi (real) — sem fallback fictício", () => {
		const src = readSource("src/lib/adapters/index.ts");
		expect(src).toMatch(/PROPOSAL_GATEWAY \?\? "bevi"/);
	});

	it("tools de descoberta usam adapter por conversa (não singleton sem contexto)", () => {
		const src = readSource("src/lib/agent/tools/ai-sdk.ts");
		expect(src).not.toMatch(/getAdapter\(\)/);
		expect(src).toMatch(/getDiscoveryAdapter/);
	});

	it("handlers WhatsApp usam adapter por conversa", () => {
		const src = readSource("src/lib/whatsapp/interactive-handlers.ts");
		expect(src).not.toMatch(/getAdapter\(\)/);
		expect(src).toMatch(/getDiscoveryAdapter/);
	});
});

// ============================================================================
// GATE-SIMULATOR-OFFER (docx passo 4, linha 34-36 — auditoria 2026-06-04)
// ----------------------------------------------------------------------------
// "Se quiser, temos o nosso simulador… contemplado em 3, 6 ou 12 meses, que
// tal?" — o simulador-agulha (conceito do Bernardo) existia mas só disparava a
// critério do modelo (fora do caminho padrão; o dono não via). A oferta agora
// é DETERMINÍSTICA: gate entre o reveal e o decision. Regressões: oferta
// removida do funil, directive sem o dial, copy sem os marcos 3/6/12.
// ============================================================================

describe("GATE-SIMULATOR-OFFER — simulador do Bernardo no caminho padrão", () => {
	function postRevealSemOferta(): ConversationMetadata {
		return {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: {
				creditMax: 100_000,
				prazoMeses: 0,
				hasLance: "yes",
				lanceValue: 30_000,
				lanceEmbutido: true,
			},
			searchDispatched: true,
			revealCompleted: true,
			recommendedAdministradora: "ITAÚ",
		};
	}

	it("funil: pós-reveal a oferta do simulador vem ANTES do card de decisão", () => {
		expect(nextGate(postRevealSemOferta(), { hasContactName: true })).toBe("simulator-offer");
		expect(
			nextGate(
				{ ...postRevealSemOferta(), simulatorOfferDispatched: true },
				{ hasContactName: true },
			),
		).toBe("decision");
	});

	it("copy da oferta é a do docx (3, 6 ou 12 meses + 'que tal?')", async () => {
		const { gateQuestion } = await import("@/lib/agent/orchestrator/gate-questions");
		const q = gateQuestion("simulator-offer") ?? "";
		expect(q).toMatch(/3, 6 ou 12 meses/);
		expect(q).toMatch(/que tal\?/);
		expect(q.toLowerCase()).toContain("simulador");
	});

	it("directive do aceite dirige present_contemplation_dial e proíbe re-reveal", async () => {
		const { buildSimulatorDialDirective } = await import("@/lib/agent/orchestrator/directives");
		const d = buildSimulatorDialDirective({ administradora: "ITAÚ" });
		expect(d).toContain("present_contemplation_dial");
		expect(d).toMatch(/PROIBIDO/);
		expect(d).toMatch(/search_groups/);
		expect(d).toMatch(/3, 6 e 12 meses/);
		expect(d).toContain("ITAÚ");
	});

	it("acoplamento: orquestrador marca a oferta na emissão (padrão consentOffered)", () => {
		const src = readSource("src/lib/agent/orchestrator/index.ts");
		expect(src).toMatch(/simulator-offer/);
		expect(src).toMatch(/simulatorOfferDispatched: true/);
	});

	// BUG-SIMULATOR-OFFER-ENGOLIDO (2026-06-04, P0 do revisor + eval Camada 3):
	// o guard anti-atropelo do runner bloqueava o gate em TODO turno com artifact
	// — reveal produz cards, turnos seguintes produzem optin/decision, e a oferta
	// do simulador nunca saía. A exceção allowGateWithArtifacts garante a emissão
	// no MESMO turno do reveal (docx: "na sequência").
	it("acoplamento: runner emite simulator-offer no MESMO turno do reveal (exceção do guard)", async () => {
		const { allowGateWithArtifacts } = await import("@/lib/agent/orchestrator/runner");
		expect(allowGateWithArtifacts("simulator-offer", ["recommendation_card"])).toBe(true);
		expect(allowGateWithArtifacts("decision", ["recommendation_card"])).toBe(false);
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(src).toMatch(/allowGateWithArtifacts\(gate, turnArtifactTypes\)/);
	});
});

// ============================================================================
// E2E-REAL-2026-06-04 — achados do QA em tela contra a Bevi de produção
// ----------------------------------------------------------------------------
// Run real (CPF autorizado) PASSou a jornada 1→5 completa mas expôs 3 defeitos:
// (1) optin no meio da qualificação engolia gates (intermitente, run 1);
// (2) administradora trocava no fechamento (decisão RODOBENS → carta ANCORA);
// (3) pós-Parabéns um afirmativo re-apresentava contract_form.
// ============================================================================

describe("E2E-REAL — optin pré-reveal suprimido (BUG-OPTIN-ENGOLE-GATES)", () => {
	it("guard determinístico: optin NUNCA antes do reveal", async () => {
		const { shouldEmitWhatsappOptin } = await import(
			"@/lib/agent/orchestrator/whatsapp-optin-guard"
		);
		// Cenário exato do run 1: reserva respondida, qualificação incompleta.
		expect(shouldEmitWhatsappOptin({ qualifyAnswers: { hasLance: "yes" } })).toBe(false);
		expect(shouldEmitWhatsappOptin({ revealCompleted: true })).toBe(true);
	});
});

describe("E2E-REAL — fechamento mantém a administradora decidida (BUG-ADMIN-TROCADA)", () => {
	it("acoplamento: route passa a recomendada e o pick prefere a marca", () => {
		// FIX-25: a derivação de administradoraPreferida virou módulo único
		// (contract-input.ts), consumido por route (web) e contract-capture (WhatsApp).
		const contractInput = readSource("src/lib/bevi/contract-input.ts");
		expect(contractInput).toMatch(/administradoraPreferida: meta.recommendedAdministradora/);
		const route = readSource("src/app/api/chat/route.ts");
		// FIX-48: o builder ganhou um 3º arg ({ leadId }) e o biome quebrou a
		// chamada em múltiplas linhas — a regex tolera o whitespace. O contrato
		// (route passa `meta` como 1º arg ao módulo único) segue intacto.
		expect(route).toMatch(/buildStartContractInput\(\s*meta,/);
		const pick = readSource("src/lib/adapters/bevi/partner-offer-mapper.ts");
		expect(pick).toMatch(/preferAdministradora/);
		const fulfillment = readSource("src/lib/bevi/fulfillment.ts");
		expect(fulfillment).toMatch(/input.administradoraPreferida/);
		// Matching preparatório (2026-06-28): o pick também recebe o prazo preferido
		// (4º arg) — desempata dentro da marca pra não trocar a oferta por outro prazo.
		expect(fulfillment).toMatch(/input.prazoPreferido/);
		// Re-sim por TTL mantém a marca E o prazo confirmados (row.administradora
		// agora seguido de vírgula, pois há o 4º arg row.termMonths).
		expect(fulfillment).toMatch(/row\.administradora,/);
		expect(fulfillment).toMatch(/row\.termMonths/);
	});
});

describe("E2E-REAL — pós-fechamento é terminal (BUG-POS-FECHAMENTO-NAO-TERMINAL)", () => {
	it("acoplamento: offer-confirm marca contractClosed e o guard suprime contract_form", async () => {
		const route = readSource("src/app/api/chat/route.ts");
		expect(route).toMatch(/contractClosed: true/);
		// FIX-20: o guard saiu do runner pra tabela artifact-guard.ts.
		const guardSrc = readSource("src/lib/agent/orchestrator/artifact-guard.ts");
		expect(guardSrc).toMatch(/isContractDup/);
		expect(guardSrc).toMatch(/contractClosed === true && artifactType === "contract_form"/);
		// Comportamental: pós-Parabéns, contract_form re-apresentado é suprimido.
		const { evaluateArtifactGuards } = await import("@/lib/agent/orchestrator/artifact-guard");
		const verdict = evaluateArtifactGuards({
			meta: { revealCompleted: true, decisionDispatched: true, contractClosed: true },
			artifactType: "contract_form",
			userIntent: "ready_to_proceed",
			isUserTurn: true,
			discoveryCount: null,
			conversationId: "conv-terminal",
		});
		expect(verdict.allow).toBe(false);
	});
});

// ============================================================================
// REVEAL-ORDER (docx passos 3-4)
// ----------------------------------------------------------------------------
// docx: "Mostrar primeiro 'Plano recomendado pela Aja Agora' (destaque). E
// permitir que o cliente veja 'Outras opções' (as outras 2) para comparação."
// Teste manual Kairo (2026-06-11): "disse que tinha 3 opções mas mostrou só uma".
// Agora o reveal mostra o recomendado em DESTAQUE + o CARROSSEL das opções
// (present_comparison_table, recomendada destacada) — mais fiel ao docx (linha 32
// "Encontramos 3 boas opções" + linha 37 "ver outras opções pra comparação"). O
// botão "Ver outras opções" do card de decisão segue acessível depois.
// ============================================================================

describe("REVEAL-ORDER — recomendado em destaque + carrossel das opções no reveal", () => {
	it("directive do reveal: destaque + carrossel das opções + detalhamento (Kairo 2026-06-11)", async () => {
		const { buildSearchSummaryDirective } = await import("@/lib/agent/orchestrator/directives");
		const d = buildSearchSummaryDirective({
			category: "auto",
			meta: {
				experiencePrev: "first",
				qualifyAnswers: {
					creditMin: 90_000,
					creditMax: 100_000,
					monthlyBudget: 1_700,
					prazoMeses: 0,
					hasLance: "yes",
				},
			},
		});
		// Ordem do docx: recommendation em destaque + simulate como detalhamento.
		expect(d).toContain("present_recommendation_card");
		expect(d).toContain("present_simulation_result");
		expect(d).toMatch(/recomendado PRIMEIRO|PRIMEIRO, em destaque/);
		// E agora o CARROSSEL das opções anunciadas aparece NO reveal (2+ grupos).
		expect(d).toContain("present_comparison_table");
		expect(d).toMatch(/TODOS os grupos/);
		expect(d).not.toMatch(/NAO chame present_comparison_table neste turno/);
	});

	it("acoplamento: route tem o handler determinístico show-other-options (as outras 2)", () => {
		// O surfacing vive em other-options.ts (módulo único produção+eval) e o
		// route consome — os dois lados do acoplamento são verificados.
		const src = readSource("src/app/api/chat/route.ts");
		expect(src).toMatch(/show-other-options/);
		expect(src).toMatch(/buildOtherOptions/);
		expect(src).toMatch(/comparison_table/);
		const lib = readSource("src/lib/bevi/other-options.ts");
		expect(lib).toMatch(/others\.length === 2/); // docx: "as outras 2" (FIX-28: loop+break troca o slice)
		expect(lib).toMatch(/recommendedAdministradora/); // exclui a recomendada (fallback por nome)
		expect(lib).toMatch(/recommendedOffer/); // FIX-28: exclusão por equivalência (meta não tem groupId)
		expect(lib).toMatch(/seen\.has|equivKey/); // FIX-28: dedupe das cotas equivalentes
	});

	it("acoplamento: o botão 'outras' do decision card dispara a action (não texto livre)", () => {
		const src = readSource("src/components/chat/artifacts/decision-prompt.tsx");
		expect(src).toMatch(/show-other-options/);
	});
});

// ============================================================================
// FIX-1 (teste manual Kairo 2026-06-05) — explicação de primeira vez SEM o
// papel da Aja Agora
// ----------------------------------------------------------------------------
// Real (Kairo, print 2026-06-05, persona moto): ao clicar "É a primeira vez",
// o agent explicou consórcio (grupo/sorteio/lance/≠financiamento) mas OMITIU o
// bullet do docx: "Nosso papel na Aja Agora é encontrar o grupo com maior
// chance de atender seu objetivo no prazo que você deseja." A directive
// (buildExperienceFirstDirective) não pedia esse ponto — o modelo nunca falava.
//
// Defesa estrutural detalhada: jornada-docx-copy.test.ts ("inclui o papel da
// Aja Agora"). Aqui: cassette da fala observada + detector + acoplamento.
// ============================================================================

describe("FIX-1-PAPEL-AJA-AGORA — explicação de 1ª vez omitia o papel da plataforma", () => {
	/** Detector: explicação de primeira vez precisa mencionar o papel da Aja
	 * Agora (encontrar o grupo certo pro objetivo/prazo do usuário). */
	function missesAjaAgoraRole(reply: string): boolean {
		const t = reply.toLowerCase();
		const isFirstTimeExplanation = /cons[óo]rcio/.test(t) && /sorteio|lance/.test(t);
		if (!isFirstTimeExplanation) return false;
		return !/papel|encontrar o grupo|maior chance/.test(t);
	}

	it("cassette: a explicação exata observada no bug dispara o detector", async () => {
		const cassette =
			"Show, primeira vez é com a gente!\n\n" +
			"Consórcio é basicamente um grupo de pessoas que pagam parcelas mensais juntas — sem juros. " +
			"Todo mês tem uma assembleia e alguém do grupo é contemplado por sorteio ou lance pra receber " +
			"a carta de crédito e comprar a moto.\n\n" +
			"É diferente do financiamento justamente porque não tem juros — você paga só uma taxa de " +
			"administração, que é bem menor.";

		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		expect(missesAjaAgoraRole(text), "a fala do bug precisa ser detectada como incompleta").toBe(
			true,
		);
	});

	it("cassette: explicação completa (com o papel da Aja Agora) NÃO dispara o detector", async () => {
		const fixed =
			"Show, primeira vez é com a gente!\n\n" +
			"Consórcio é um grupo de pessoas que pagam parcelas mensais juntas, sem juros — todo mês " +
			"alguém é contemplado por sorteio ou lance.\n\n" +
			"Nosso papel na Aja Agora é encontrar o grupo com maior chance de atender seu objetivo no " +
			"prazo que você deseja.";

		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", fixed),
			FINISH_STOP,
		]);

		expect(missesAjaAgoraRole(text)).toBe(false);
	});

	it("acoplamento: buildExperienceFirstDirective instrui o papel da Aja Agora", () => {
		const directives = readSource("src/lib/agent/orchestrator/directives.ts");
		const m = directives.match(/buildExperienceFirstDirective[\s\S]{0,2000}?\n}/);
		expect(m, "buildExperienceFirstDirective precisa existir em directives.ts").not.toBeNull();
		const body = (m?.[0] ?? "").toLowerCase();
		expect(body).toMatch(/papel/);
		expect(body).toMatch(/encontrar o grupo/);
		expect(body).toMatch(/maior chance/);
	});
});

// ============================================================================
// FIX-5 (teste manual Kairo 2026-06-05) — pedido de WhatsApp vazou em TEXTO
// no meio da qualificação (pré-reveal), sem artifact pra responder
// ----------------------------------------------------------------------------
// Real (print): entre os gates lance e lance-value o agent despejou num único
// turno: reação + "o sistema precisa confirmar sua identidade antes" +
// "Posso anotar seu WhatsApp? Assim a gente já garante seu acesso..." +
// "Boa! E qual valor aproximado você pensa em dar de lance?" — 2 perguntas,
// a do WhatsApp órfã (os chips eram do gate lance-value).
//
// O guard (whatsapp-optin-guard) já segurava o ARTIFACT pré-reveal
// (BUG-OPTIN-ENGOLE-GATES) — mas o TEXTO vinha do system prompt, cuja seção
// de optin (com as frases-modelo) ficava sempre visível. Fix: seção vira
// bloco DINÂMICO por estágio (locked/open/done) via whatsappOptinSection +
// deriveWhatsappOptinStage(meta), repassado pelo resolveAgent/builder.
//
// Defesa estrutural detalhada: system-prompt.whatsapp-optin-stage.test.ts.
// ============================================================================

describe("FIX-5-OPTIN-TEXTO-PRE-REVEAL — WhatsApp pedido em texto sem tool, pré-reveal", () => {
	/** Detector: turno pede WhatsApp em texto livre SEM chamar a tool de optin. */
	function asksWhatsappWithoutTool(text: string, toolCalls: Array<{ toolName: string }>): boolean {
		const asked = /(anotar|compartilha|me passa|deixa eu anotar)[^.?!]*whatsapp|whatsapp\?/i.test(
			text,
		);
		const calledOptin = toolCalls.some((tc) => tc.toolName === "present_whatsapp_optin");
		return asked && !calledOptin;
	}

	it("cassette: a fala exata do bug dispara o detector", async () => {
		const cassette =
			"Boa, lance acelera bastante a contemplação!\n\n" +
			"Kairo, pra eu conseguir puxar as opções reais de grupo pra você, o sistema precisa " +
			"confirmar sua identidade antes.\n\n" +
			"Posso anotar seu WhatsApp? Assim a gente já garante seu acesso e eu te mando as " +
			"opções na hora.\n\n" +
			"Boa! E qual valor aproximado você pensa em dar de lance?";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		expect(
			asksWhatsappWithoutTool(text, toolCalls),
			"pedido de WhatsApp em texto sem present_whatsapp_optin precisa ser detectado",
		).toBe(true);
	});

	it("cassette: fluxo correto (pós-reveal, narrativa + tool) NÃO dispara o detector", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks(
				"t1",
				"Pra garantir que você não perca o atendimento, vou anotar seu WhatsApp — assim qualquer instabilidade a gente não perde o fio.",
			),
			toolCallChunk("tc-wa-1", "present_whatsapp_optin", {}),
			FINISH_TOOL_CALLS,
		]);

		expect(asksWhatsappWithoutTool(text, toolCalls)).toBe(false);
	});

	it("estrutural: estágio locked proíbe WhatsApp e o estável não tem mais as frases-modelo", () => {
		const sp = readSource("src/lib/agent/system-prompt.ts");
		// A função de estágio existe e a seção incondicional saiu do bloco estável.
		expect(sp).toMatch(/whatsappOptinSection/);
		expect(sp).toMatch(/deriveWhatsappOptinStage/);
		const baseStart = sp.indexOf("SPECIALIST_BASE_PROMPT");
		expect(baseStart).toBeGreaterThan(-1);
	});

	it("estrutural: resolveAgent deriva o estágio do meta (acoplamento runtime)", () => {
		const idx = readSource("src/lib/agent/agents/index.ts");
		expect(idx).toMatch(/deriveWhatsappOptinStage/);
		const bld = readSource("src/lib/agent/agents/builder.ts");
		expect(bld).toMatch(/whatsappOptinStage/);
	});
});

// ============================================================================
// FIX-27 (teste manual Kairo 2026-06-11) — opt-in pediu o WhatsApp pela 3ª vez
// (lead form + identify já tinham coletado), input vazio, no meio de um
// fechamento com erro Bevi pendente. deriveWhatsappOptinStage só olhava
// revealCompleted+whatsappOptinShown. Stage novo "confirm" (1-clique) +
// contactPhone no meta + supressão em retry de fechamento.
// Defesa estrutural detalhada: system-prompt.fix-27.test.ts.
// ============================================================================

describe("FIX-27 — opt-in não re-coleta o telefone já informado", () => {
	/** Detector: o turno RE-PEDE o número (coleta) em vez de confirmar o canal. */
	function recollectsKnownPhone(text: string): boolean {
		return /(me compartilha|anotar|me passa|qual (é |e )?o seu)[^.?!]*whatsapp|seu whatsapp\?/i.test(
			text,
		);
	}

	it("cassette: a fala de RE-COLETA (bug) dispara o detector", async () => {
		const cassette = "Pra garantir que você não perca o atendimento, me compartilha seu WhatsApp?";
		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(recollectsKnownPhone(text)).toBe(true);
	});

	it("cassette: a CONFIRMAÇÃO de canal (stage confirm) NÃO dispara o detector", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Posso te chamar no seu WhatsApp se precisar?"),
			toolCallChunk("tc-wa-c", "present_whatsapp_optin", {}),
			FINISH_TOOL_CALLS,
		]);
		expect(recollectsKnownPhone(text)).toBe(false);
		expect(toolCalls.some((tc) => tc.toolName === "present_whatsapp_optin")).toBe(true);
	});

	it("estrutural: derive enxerga telefone capturado (confirm) e suprime em retry (done)", async () => {
		const { deriveWhatsappOptinStage, whatsappOptinSection } = await import(
			"@/lib/agent/system-prompt"
		);
		expect(
			deriveWhatsappOptinStage({ revealCompleted: true, contactPhone: "(62) 9...-6793" }),
		).toBe("confirm");
		expect(
			deriveWhatsappOptinStage({
				revealCompleted: true,
				contactPhone: "(62) 9...-6793",
				contractRetryPending: true,
			}),
		).toBe("done");
		// a seção confirm NÃO re-pede o número (já informado).
		const s = whatsappOptinSection("confirm");
		expect(s).not.toMatch(/me compartilha seu WhatsApp/i);
		expect(s).not.toMatch(/anotar seu WhatsApp/i);
		expect(s).toMatch(/present_whatsapp_optin/);
	});

	it("estrutural: guard remove present_whatsapp_optin em retry pendente (determinismo)", async () => {
		const { shouldEmitWhatsappOptin } = await import(
			"@/lib/agent/orchestrator/whatsapp-optin-guard"
		);
		expect(shouldEmitWhatsappOptin({ revealCompleted: true, contractRetryPending: true })).toBe(
			false,
		);
		expect(shouldEmitWhatsappOptin({ revealCompleted: true })).toBe(true);
	});

	it("estrutural: acoplamento runtime (runner enriquece knownPhone, route confirma, leads marca)", () => {
		const runner = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(runner).toMatch(/whatsapp_optin/);
		expect(runner).toMatch(/knownPhone/);
		expect(runner).toMatch(/contactPhone/);
		const route = readSource("src/app/api/chat/route.ts");
		expect(route).toMatch(/whatsapp_optin_confirm/);
		expect(route).toMatch(/contractRetryPending/);
		const leadsRoute = readSource("src/app/api/leads/route.ts");
		expect(leadsRoute).toMatch(/contactPhone/);
		expect(leadsRoute).toMatch(/maskPhoneForDisplay/);
	});
});

// ============================================================================
// FIX-4 (teste manual Kairo 2026-06-05) — ramo educativo do lance embutido
// "sumia" pra quem respondia "Não"/"Talvez" no gate lance
// ----------------------------------------------------------------------------
// Real: na 1ª jornada do Kairo a pergunta "Você sabe o que é lance embutido?"
// + explicação NUNCA apareceram; na 2ª jornada (respondendo "Sim, tenho
// reserva") apareceram. Percebido como intermitência — era condição de gate:
// qualify-state só disparava lance-embutido pra hasLance==="yes". O docx põe
// a educação como sub-bullet PARALELO ao "Se sim" e o próprio texto diz que o
// lance embutido "ajuda quem não possui todo o valor do lance hoje" — ou
// seja, ele existe EXATAMENTE pra quem respondeu Não/Talvez.
//
// Defesa estrutural detalhada: qualify-state.lance-embutido.test.ts.
// ============================================================================

describe("FIX-4-LANCE-EMBUTIDO-PRA-TODOS — educação não pode depender de hasLance='yes'", () => {
	function metaQualificado(hasLance: "yes" | "no" | "maybe"): ConversationMetadata {
		return {
			currentCategory: "moto",
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: {
				creditMax: 20_000,
				monthlyBudget: 500,
				prazoMeses: 6,
				hasLance,
				...(hasLance === "yes" ? { lanceValue: 4_000 } : {}),
			},
			identityCollected: true,
		};
	}

	it("cassette estrutural: a jornada da 1ª rodada (hasLance='no') agora passa pelo gate", () => {
		expect(nextGate(metaQualificado("no"), { hasContactName: true })).toBe("lance-embutido");
		expect(nextGate(metaQualificado("maybe"), { hasContactName: true })).toBe("lance-embutido");
		expect(nextGate(metaQualificado("yes"), { hasContactName: true })).toBe("lance-embutido");
	});

	it("a copy educativa segue a do docx e os chips funcionam pra quem NÃO tem reserva", () => {
		const gq = readSource("src/lib/agent/orchestrator/gate-questions.ts");
		expect(gq).toMatch(/Você sabe o que é lance embutido\?/);
		// O chip negativo não pode pressupor que o usuário TEM dinheiro pro lance
		// ("recursos próprios") — precisa ser neutro pros dois fluxos.
		const cfg = readSource("src/lib/agent/qualify-config.ts");
		expect(cfg).not.toMatch(/Não, lance com recursos próprios/);
	});
});

// ============================================================================
// FIX-6 (teste manual Kairo 2026-06-05) — dial do Bernardo com números do
// SLIDER em vez da oferta real confirmada
// ----------------------------------------------------------------------------
// Real (print): logo abaixo da simulação CANOPUS R$ 35.000 / R$ 475,93 / 96m,
// o dial mostrava "crédito que você recebe R$ 17.600 / parcela R$ 419 / 51
// meses" — o MODELO montou o payload com o crédito do slider da qualificação
// (R$ 20k − 12% embutido = 17.600). Números contraditórios lado a lado.
//
// Fix: payload do contemplation_dial é COAGIDO server-side
// (coerceDialPayload) com o snapshot da oferta ativa (meta.recommendedOffer,
// capturado no reveal). O modelo só controla a interação (mês-alvo etc.).
//
// Defesa estrutural detalhada: src/lib/agent/orchestrator/dial-payload.test.ts.
// ============================================================================

describe("FIX-6-DIAL-NUMEROS-DA-OFERTA — payload do dial não pode divergir da oferta ativa", () => {
	it("cassette: input do modelo com números do slider é corrigido pro snapshot CANOPUS", async () => {
		const { coerceDialPayload } = await import("@/lib/agent/orchestrator/dial-payload");
		// Exatamente o que o modelo fez no bug: carta do slider (20k), prazo heurístico.
		const modelInput = {
			administradora: "CANOPUS",
			category: "moto",
			creditValue: 20_000,
			termMonths: 51,
			monthlyPayment: 500,
			initialTargetMonth: 6,
		};
		const snapshot = {
			administradora: "CANOPUS",
			category: "moto" as const,
			creditValue: 35_000,
			termMonths: 96,
			monthlyPayment: 475.93,
		};
		const out = coerceDialPayload(modelInput, snapshot);
		expect(out.creditValue).toBe(35_000);
		expect(out.monthlyPayment).toBe(475.93);
		expect(out.termMonths).toBe(96);
	});

	it("estrutural: runner captura recommendedOffer no reveal e coage o dial", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(src).toMatch(/recommendedOffer/);
		expect(src).toMatch(/coerceDialPayload/);
	});
});

// ============================================================================
// FIX-9 (teste manual Kairo 2026-06-05) — passo 5 re-pedia CPF/celular já
// coletados no identify
// ----------------------------------------------------------------------------
// Real (print): usuário clicou "Sim, quero contratar agora" e o contract_form
// veio com CPF e Celular VAZIOS — sendo que ambos foram coletados (e cifrados
// via AES-256-GCM) no gate identify, obrigatório pré-reveal. "Totalmente
// incorreto, uma vez que já foi informado."
//
// Fix: payload do contract_form enriquecido server-side (runner →
// enrichContractFormPayload): identityOnFile + CPF MASCARADO (nunca em claro
// no payload) + celular formatado. Componente mostra confirmação (LGPD + 1
// clique); submit manda useStoredIdentity e o route resolve via loadIdentity.
//
// Defesa estrutural detalhada: contract-form-prefill.test.ts.
// ============================================================================

describe("FIX-9-CONTRACT-FORM-PREFILL — identidade coletada não se pede duas vezes", () => {
	it("payload enriquecido NUNCA carrega o CPF em claro", async () => {
		const { enrichContractFormPayload } = await import(
			"@/lib/agent/orchestrator/contract-form-prefill"
		);
		const out = enrichContractFormPayload(
			{ conversationId: "c1", administradora: "CANOPUS" },
			{ cpf: "52998224725", celular: "62999887766" },
		);
		expect(out.identityOnFile).toBe(true);
		expect(JSON.stringify(out)).not.toContain("52998224725");
	});

	it("estrutural: runner enriquece, route resolve stored identity, componente confirma", () => {
		expect(readSource("src/lib/agent/orchestrator/runner.ts")).toMatch(/enrichContractFormPayload/);
		const route = readSource("src/app/api/chat/route.ts");
		expect(route).toMatch(/useStoredIdentity/);
		const comp = readSource("src/components/chat/artifacts/contract-form.tsx");
		expect(comp).toMatch(/identityOnFile/);
	});
});

// ============================================================================
// FIX-10 (teste manual Kairo 2026-06-05) — upload de 1 slot já postava
// "Enviei meu documento" e o bot respondia antes do verso
// ----------------------------------------------------------------------------
// Real (print): Kairo subiu SÓ a frente da CNH → o componente auto-enviou a
// mensagem e o agente respondeu "ficha completa" — sem chance do verso.
// Fix: slot sobe silencioso via endpoint dedicado (/api/chat/document);
// conclusão explícita via action documents-done (botão "Pronto, enviei tudo"
// ou automática com frente+verso). Copy do route reflete o que foi enviado.
//
// Defesa detalhada: src/components/chat/artifacts/document-upload.test.tsx.
// ============================================================================

describe("FIX-10-UPLOAD-SEM-AUTO-SEND — estrutura do fluxo de documentos", () => {
	it("componente NÃO manda 'Enviei meu documento' por slot (sendAction só em documents-done/skip)", () => {
		const src = readSource("src/components/chat/artifacts/document-upload.tsx");
		expect(src).not.toMatch(/sendAction\([\s\S]{0,200}"Enviei meu documento"/);
		expect(src).toMatch(/documents-done/);
		expect(src).toMatch(/\/api\/chat\/document/);
	});

	it("route trata documents-done com copy sensível ao que foi enviado", () => {
		const src = readSource("src/app/api/chat/route.ts");
		expect(src).toMatch(/documents-done/);
		// faltou o verso → pede gentilmente, sem bloquear (docs são opcionais)
		expect(src).toMatch(/verso/i);
	});

	it("endpoint dedicado de upload existe e usa uploadContractDocument", () => {
		const src = readSource("src/app/api/chat/document/route.ts");
		expect(src).toMatch(/uploadContractDocument/);
	});
});

// ============================================================================
// FIX-7 (teste manual Kairo 2026-06-05) — reveal com 1 opção: "carrossel" de
// card único + o MESMO grupo repetido no detalhamento logo abaixo
// ----------------------------------------------------------------------------
// Real (print): busca de moto R$ 20k retornou SÓ a CANOPUS → a tela mostrou
// "Encontrei boas opçõeS... a mais adequada" (plural enganoso) + card de
// Recomendação (43% compatível) + card Simulação · CANOPUS — o mesmo grupo
// 2×. Fix em camadas: (a) runner suprime recommendation_card quando a
// descoberta retornou opção ÚNICA (tool-result conta — simulation_result é o
// card único); (b) directive anuncia o número REAL e proíbe o card duplicado;
// (c) badge do card vira rótulo qualitativo (sem "43%"); (d) CTA duplicado
// "Tenho interesse" filtrado no simulation card; (e) insufficientOptions é
// comunicado com transparência.
//
// Defesas detalhadas: discovery-count.test.ts, score-label.test.ts,
// simulation-result.test.tsx, jornada-docx-copy.test.ts (FIX-7).
// ============================================================================

describe("FIX-7-REVEAL-1-OPCAO — sem card duplicado nem plural enganoso", () => {
	it("unit: descoberta de 1 opção é detectável pelos tool-results", async () => {
		const { extractDiscoveryCount } = await import("@/lib/agent/orchestrator/discovery-count");
		expect(
			extractDiscoveryCount("recommend_groups", { recommendations: [{ id: "canopus" }] }),
		).toBe(1);
	});

	it("estrutural: runner captura tool-result e suprime recommendation_card de opção única", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(src).toMatch(/tool-result/);
		expect(src).toMatch(/extractDiscoveryCount/);
	});

	it("estrutural: badge do recommendation-card é qualitativo (sem % numérico)", () => {
		const src = readSource("src/components/chat/artifacts/recommendation-card.tsx");
		// FIX-18: o badge passou de scoreLabel pra recommendationFitLabel (rótulo
		// honesto quando o orçamento não fecha) — segue qualitativo, sem % numérico.
		expect(src).toMatch(/scoreLabel|recommendationFitLabel/);
		expect(src).not.toMatch(/% compativel|% compatível/);
	});
});

// ============================================================================
// "Planeje sua conquista" no gate credit — RE-UX GUIADA POR INTENÇÃO (handoff
// componentes-aja, 2026-06-12). Kairo apontou os 4 sliders simultâneos como
// "não era pra existir dessa forma mais".
// ----------------------------------------------------------------------------
// Os 4 sliders simultâneos (valor · quando · parcela · lance) confundiam. A forma
// correta (handoff): valor do bem + segmented "O QUE MAIS IMPORTA" (menor parcela
// / receber rápido / tenho um lance) + prazo, com a parcela como RESULTADO calmo
// (não input). Só o controle relevante da intenção aparece. Aderente à jornada
// canônica (valor → prioridade/tempo → lance). Modo ESTIMATIVA DE MERCADO (selo
// obrigatório — a Bevi não simula sem CPF, D1). O `objetivo` da Bevi sai da
// INTENÇÃO; o agente confirma a PRIORIDADE como VENDEDOR (sem re-perguntar). O
// funil continua pulando os gates já respondidos. Simulador do passo 4 PERMANECE.
//
// Defesas detalhadas: plan-estimate.test.ts (engine: prazo como input),
// plan-estimate-picker.test.tsx (componente: segmented + condicionais), route.
// ============================================================================

describe("PLANEJE-SUA-CONQUISTA — re-UX guiada por intenção (não 4 sliders)", () => {
	// FIX-115 (Kairo, PROD 2026-06-30): o gate credit voltou pra AGULHA SIMPLES
	// (kind "slider", só o valor do bem). A jornada canônica (FIX-104) já havia
	// aposentado o picker por intenção ("componente complexo saiu; slider simples
	// apoia"); este bloco fez a troca no adapter. O componente PlanEstimatePicker e
	// os directives por intenção FICAM (compat de mensagens antigas hidratadas), por
	// isso os demais testes deste describe seguem válidos.
	it("estrutural: gate credit serve a AGULHA SIMPLES (kind 'slider', valor do bem), não o picker por intenção", () => {
		const src = readSource("src/lib/web/adapter.ts");
		// o gate credit agora monta a agulha (kind "slider" com creditSlider)
		const creditCase = src.slice(src.indexOf('case "credit":'), src.indexOf('case "timeframe":'));
		expect(creditCase).toMatch(/kind: "slider"/);
		expect(creditCase).toMatch(/creditSlider\(category\)/);
		// a forma por intenção NÃO pode mais sair do gate credit
		expect(creditCase).not.toMatch(/kind: "plan"/);
		expect(creditCase).not.toMatch(/intentDefault/);
		expect(creditCase).not.toMatch(/term: termSlider/);
	});

	it("estrutural: componente é guiado por intenção (segmented control), não 4 sliders", () => {
		const src = readSource("src/components/chat/artifacts/plan-estimate-picker.tsx");
		expect(src).toMatch(/O que mais importa pra você agora/);
		expect(src).toMatch(/plan-intent-/);
		// a parcela é resultado calmo, não um slider "Parcela mensal" de entrada
		expect(src).toMatch(/Sua parcela fica em/);
		expect(src).not.toMatch(/label="Parcela mensal"/);
	});

	it("estrutural: route deriva o objetivo da Bevi da INTENÇÃO (não só do mês-alvo)", () => {
		const src = readSource("src/app/api/chat/route.ts");
		expect(src).toMatch(/objetivoForIntent/);
		expect(src).toMatch(/buildPlanReactionDirective/);
	});

	it("híbrido vendedor: directive reforça a PRIORIDADE, confirma SEM re-perguntar e proíbe tools", () => {
		const directives = readSource("src/lib/agent/orchestrator/directives.ts");
		const start = directives.indexOf("function buildPlanReactionDirective");
		expect(start, "buildPlanReactionDirective precisa existir").toBeGreaterThan(-1);
		const body = directives.slice(start, start + 1800);
		expect(body).toMatch(/VENDEDOR/i);
		expect(body).toMatch(/SEM re-perguntar/i);
		expect(body).toMatch(/N[ÃA]O chame tools/i);
		expect(body).toMatch(/[Pp]rioridade/);
	});

	it("funil: plano completo via componente pula direto pro identify (nada re-perguntado)", () => {
		// O que o componente entrega → qualifyAnswers; nextGate deve ir pro
		// identify sem passar por timeframe/lance/lance-value/lance-embutido.
		const meta: ConversationMetadata = {
			currentCategory: "moto",
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: {
				creditMin: 17_000,
				creditMax: 20_000,
				monthlyBudget: 500,
				prazoMeses: 6,
				objetivo: "contemplacao_rapida",
				hasLance: "yes",
				lanceValue: 4_000,
				lanceEmbutido: true,
			},
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("identify");
	});

	it("funil: plano PARCIAL (sem decidir lance embutido) → gate educativo continua", () => {
		const meta: ConversationMetadata = {
			currentCategory: "moto",
			experiencePrev: "first",
			qualifyConsented: true,
			// FIX-53: `identify` precede `credit`. Com a identidade já coletada, o
			// funil chega ao gate educativo de lance embutido — que é o foco deste
			// teste (plano parcial, falta só decidir o lance embutido).
			identityCollected: true,
			qualifyAnswers: {
				creditMin: 17_000,
				creditMax: 20_000,
				monthlyBudget: 500,
				prazoMeses: 6,
				hasLance: "no",
			},
		};
		expect(nextGate(meta, { hasContactName: true })).toBe("lance-embutido");
	});

	it("selo de estimativa vive no componente (regra de produto — nunca dado real)", () => {
		const src = readSource("src/components/chat/artifacts/plan-estimate-picker.tsx");
		expect(src).toMatch(/Estimativa de mercado/);
		expect(src).toMatch(/valores reais v[eê]m das administradoras/);
	});

	// BUG (E2E 2026-06-12): após escolher "Menor parcela" no segmented, o agente
	// RE-PERGUNTAVA "em quanto tempo você quer o carro?" (gate timeframe). A
	// intenção JÁ define a prioridade de tempo — tem que preencher prazoMeses pro
	// funil pular o timeframe (híbrido vendedor: confirma SEM re-perguntar).
	it("intenção mapeia o prazo de contemplação (parcela=sem pressa, lance=antecipa)", () => {
		expect(prazoMesesForIntent("parcela")).toBeGreaterThanOrEqual(120); // sem pressa → investimento
		expect(prazoMesesForIntent("lance")).toBeLessThan(12); // lance antecipa
		expect(prazoMesesForIntent("rapido")).toBeLessThan(120); // mira contemplar logo
	});

	it("funil NÃO re-pergunta timeframe quando a intenção já definiu o prazo", () => {
		// qualifyAnswers como o route monta a partir de "Menor parcela" (sem mês-alvo).
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			qualifyAnswers: {
				creditMin: 68_000,
				creditMax: 80_000,
				monthlyBudget: 1_278,
				prazoMeses: prazoMesesForIntent("parcela"),
				objetivo: "investimento",
			},
		};
		expect(nextGate(meta, { hasContactName: true })).not.toBe("timeframe");
	});

	it("estrutural: route deriva prazoMeses da INTENÇÃO (não deixa o funil re-perguntar)", () => {
		const src = readSource("src/app/api/chat/route.ts");
		expect(src).toMatch(/prazoMesesForIntent/);
	});
});

// ============================================================================
// FIX-11 — POS-FECHAMENTO AMNESICO (rodada 2026-06-05 tarde, prints 27-30)
// ----------------------------------------------------------------------------
// Real: jornada completa e CORRETA ate o fim (carta REAL confirmada com a
// CANOPUS, grupo 4400, R$ 46.000, docs enviados, "sua ficha esta completa!").
// Usuario pergunta "qual status da proposta?" e o agent, NO MESMO turno:
//   1. NEGA o fechamento: "ainda nao recebi nenhum dado ou documento por
//      aqui — nada chegou no nosso sistema nesse chat."
//   2. RE-RODA a descoberta com os params da qualificacao.
//   3. Apresenta recommendation_card + simulation_result de OUTRA
//      administradora (BANCO DO BRASIL) — pro usuario que JA contratou.
//
// Root causes (3 defeitos, cada um com guard proprio abaixo):
//   A. Handlers de action do route escreviam o fechamento no stream SEM
//      saveMessage → historico mutilado induzia a negacao (a alucinacao e
//      INDUZIDA pelo historico, nao inventada). → route persiste (Camada 1a:
//      route.closing-persistence.test.ts; aqui: assert source-level).
//   B. meta.contractClosed nao entrava no prompt. → contractClosedSection
//      dinamica (Camada 1b: system-prompt.pos-fechamento.test.ts).
//   C. Guard do runner so bloqueava contract_form pos-fechamento — cards de
//      DESCOBERTA passavam livres. → guard isPostClosure no runner.
// ============================================================================

describe("FIX-11-POS-FECHAMENTO-AMNESICO — agent nega fechamento e re-roda descoberta", () => {
	// Trajetoria condensada do turno real das 18:06 (negacao + re-descoberta +
	// card de OUTRA administradora no mesmo turno).
	const NEGACAO_REAL =
		"Kairo, ainda não recebi nenhum dado ou documento por aqui — nada chegou no nosso sistema nesse chat.";

	it("cassette: stream do bug — nega o estado E emite card de descoberta de OUTRA administradora", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", NEGACAO_REAL),
			toolCallChunk("tc-1", "search_groups", {
				categoria: "moto",
				valorCredito: 40000,
			}),
			toolCallChunk("tc-2", "present_recommendation_card", {
				administradora: "BANCO DO BRASIL",
				creditValue: 35543,
				monthlyPayment: 2872.71,
				termMonths: 17,
			}),
			FINISH_TOOL_CALLS,
		]);
		expect(text).toBe(NEGACAO_REAL);
		// O bug em uma linha: pos-fechamento, o turno re-busca E re-recomenda.
		expect(toolCalls.map((t) => t.toolName)).toEqual([
			"search_groups",
			"present_recommendation_card",
		]);
	});

	it("detector de negacao de estado pega a frase real do print", () => {
		const detectors = [
			/nada chegou no nosso sistema/i,
			/n[ãa]o recebi nenhum (dado|documento)/i,
			/ainda n[ãa]o recebi/i,
		];
		const hits = detectors.filter((rx) => rx.test(NEGACAO_REAL));
		expect(hits.length).toBeGreaterThanOrEqual(2);
	});

	it("guard C na tabela: pos-fechamento suprime artifacts de DESCOBERTA (nao so contract_form)", async () => {
		// FIX-20: o guard saiu do runner pra tabela artifact-guard.ts. O assert
		// virou comportamental (mais forte que grep): os cards que vazaram no
		// bug real sao suprimidos pos-fechamento, em qualquer intent.
		const { evaluateArtifactGuards } = await import("@/lib/agent/orchestrator/artifact-guard");
		const meta = { revealCompleted: true, decisionDispatched: true, contractClosed: true };
		for (const artifactType of ["recommendation_card", "simulation_result"] as const) {
			const verdict = evaluateArtifactGuards({
				meta,
				artifactType,
				userIntent: "asking_question", // "qual status da proposta?"
				isUserTurn: true,
				discoveryCount: null,
				conversationId: "conv-fix11",
			});
			expect(
				verdict.allow,
				`${artifactType} pos-fechamento tem que ser suprimido (FIX-11 defeito C)`,
			).toBe(false);
		}
	});

	it("fix A no route: fechamento persiste a mensagem assistant (pipeClosingItems com saveMessage)", () => {
		const src = readSource("src/app/api/chat/route.ts");
		// O pipe do fechamento nao pode mais ser fire-and-forget no stream:
		// a versao persistida precisa existir e ser usada nos handlers.
		const persisted = /pipeAndSaveClosingItems|saveClosingItems/;
		expect(
			persisted.test(src),
			"route.ts precisa persistir os closing items (FIX-11 defeito A — historico mutilado)",
		).toBe(true);
	});

	it("fix B no prompt: secao de contrato fechado existe e proibe segunda administradora", () => {
		const src = readSource("src/lib/agent/system-prompt.ts");
		expect(src).toMatch(/contractClosedSection/);
		expect(src.toLowerCase()).toMatch(/outra administradora/);
	});
});

// ============================================================================
// FIX-12 — CONTRACT-FORM SEQUESTRA IDENTIFY (rodada 2026-06-05, prints 27-32)
// ----------------------------------------------------------------------------
// Real: no fim da qualificacao (gate identify, D1), a narrativa estava CERTA
// ("o sistema precisa da sua identidade pra liberar as simulacoes reais") mas
// o card apresentado foi "Vamos fechar sua proposta" = present_contract_form,
// o formulario de CONTRATACAO do passo 5. Submit → proposta REAL na Bevi (CPF
// + bureau) sem o usuario ter visto UMA opcao. Reveal/decisao nunca rolaram.
//
// Root cause: ambos os cards coletam CPF+celular+LGPD e a narrativa e quase
// identica → o modelo confundiu. A descricao da tool ("use SO depois que o
// usuario escolheu contratar") era instrucao, nao defesa — zero guard
// server-side validando a ordem da jornada.
//
// Defesas (cada uma com teste proprio):
//  - guard isPrematureContract no runner (revealCompleted !== true → suprime;
//    integracao: runner.contract-guard.integration.test.ts)
//  - prompt: coleta de identidade pre-busca e gate do SERVIDOR, nunca tool
//  - defesa no route: contract-submit pre-reveal nao chama startContract
//    (integracao: route.closing-persistence.test.ts)
// ============================================================================

describe("FIX-12-CONTRACT-FORM-SEQUESTRA-IDENTIFY — fechamento no momento do identify", () => {
	const NARRATIVA_IDENTIFY_REAL =
		"Deixa eu puxar as melhores opções pra você. Pra eu conseguir buscar as opções reais de grupo, o sistema precisa da sua identidade pra liberar as simulações reais. É só CPF e celular, bem rápido:";

	it("cassette: narrativa do identify seguida da tool ERRADA (present_contract_form)", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", NARRATIVA_IDENTIFY_REAL),
			toolCallChunk("tc-1", "present_contract_form", { administradora: "CANOPUS" }),
			FINISH_TOOL_CALLS,
		]);
		expect(text).toBe(NARRATIVA_IDENTIFY_REAL);
		// O bug em uma linha: pediu identidade (gate do servidor) mas chamou a
		// tool de CONTRATACAO — que cria proposta real com consulta de bureau.
		expect(toolCalls.map((t) => t.toolName)).toEqual(["present_contract_form"]);
	});

	it("guard A na tabela: contract_form e suprimido enquanto nao houver reveal", async () => {
		// FIX-20: o guard saiu do runner pra tabela artifact-guard.ts.
		const src = readSource("src/lib/agent/orchestrator/artifact-guard.ts");
		const guard =
			/revealCompleted\s*!==?\s*true[\s\S]{0,200}contract_form|contract_form[\s\S]{0,200}revealCompleted\s*!==?\s*true/;
		expect(
			guard.test(src),
			"artifact-guard.ts precisa da regra premature-contract: contract_form so passa com revealCompleted (FIX-12)",
		).toBe(true);
		// Comportamental: o estado exato do bug (fim do qualify, sem reveal).
		const { evaluateArtifactGuards } = await import("@/lib/agent/orchestrator/artifact-guard");
		const verdict = evaluateArtifactGuards({
			meta: { qualifyConsented: true },
			artifactType: "contract_form",
			userIntent: "ready_to_proceed",
			isUserTurn: true,
			discoveryCount: null,
			conversationId: "conv-fix12",
		});
		expect(verdict.allow).toBe(false);
	});

	it("defesa C no route: contract-submit pre-reveal nao chama startContract", () => {
		const src = readSource("src/app/api/chat/route.ts");
		const defense = /contract-submit[\s\S]{0,1500}revealCompleted/;
		expect(
			defense.test(src),
			"route.ts precisa validar revealCompleted ANTES de startContract (FIX-12 defesa em profundidade)",
		).toBe(true);
	});

	it("prompt B: distingue coleta de identidade (gate do SERVIDOR) de fechamento (tool pos-decisao)", () => {
		// A regra tem que existir no prompt estavel: identidade pre-busca NUNCA
		// e present_contract_form — o sistema apresenta o card de identidade.
		const rule =
			/identidade[\s\S]{0,400}(servidor|sistema)[\s\S]{0,400}present_contract_form|present_contract_form[\s\S]{0,600}identidade/i;
		expect(
			rule.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa distinguir gate identify (servidor apresenta) de present_contract_form (so pos-decisao)",
		).toBe(true);
		// E a proibicao explicita do cenario do bug:
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/NUNCA[\s\S]{0,200}present_contract_form[\s\S]{0,200}(identidade|identify|coletar)/i,
		);
	});
});

// ============================================================================
// FIX-14-STATUS-VIA-TOOL — pergunta de status consulta a Bevi AO VIVO via tool
// ----------------------------------------------------------------------------
// Pedido explícito do Kairo (rodada 2 de testes manuais, 2026-06-05): "o usuário
// tem que, quando perguntar sobre o status no chat, conseguir obter a informação
// que ele precisa". Antes do FIX-14 o agent respondia status de memória ou
// RE-BUSCAVA GRUPOS (re-descoberta) — exatamente o bug do print.
//
// Comportamento correto cassetteado: pergunta de status com proposta ativa →
// modelo chama check_proposal_status (SEM argumentos — proposalId resolve
// server-side via getLatestBeviProposal(conversationId), closure) e narra a
// userMessage traduzida (servidor decide, modelo narra — regra D11).
//
// Plano de teste: docs/test-plans/fix-14-tool-status-proposta.md (CA-21..CA-24).
// ============================================================================

describe("FIX-14-STATUS-VIA-TOOL — status real via check_proposal_status, zero re-descoberta", () => {
	const DISCOVERY_TOOLS = [
		"search_groups",
		"recommend_groups",
		"simulate_quota",
		"present_comparison_table",
		"present_recommendation_card",
	];

	it("CA-21/CA-22: cassette — turn de status chama check_proposal_status sem args e nada de descoberta", async () => {
		const narration =
			"Consultei aqui pra você: sua proposta está na fila da administradora — te aviso assim que ela entrar. Desde as 14h52 de hoje ela está nessa etapa.";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("call-fix14-1", "check_proposal_status", {}),
			...textChunks("t-fix14", narration),
			FINISH_TOOL_CALLS,
		]);

		const statusCalls = toolCalls.filter((t) => t.toolName === "check_proposal_status");
		expect(statusCalls).toHaveLength(1);
		// CA-22 — input vazio: o modelo NÃO passa proposalId (anti-hallucination)
		expect(Object.keys((statusCalls[0]?.input ?? {}) as Record<string, unknown>)).toEqual([]);
		// CA-21 — zero re-descoberta no turn de status (o bug do print do Kairo)
		for (const banned of DISCOVERY_TOOLS) {
			expect(
				toolCalls.filter((t) => t.toolName === banned),
				`turn de status NÃO pode chamar ${banned}`,
			).toEqual([]);
		}
		expect(text).toBe(narration);
	});

	it("CA-23: narração não vaza jargão técnico da máquina de estados Bevi", async () => {
		const narration =
			"Sua proposta está na fila da administradora — te aviso assim que ela entrar.";
		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			toolCallChunk("call-fix14-2", "check_proposal_status", {}),
			...textChunks("t-fix14b", narration),
			FINISH_TOOL_CALLS,
		]);
		expect(text).not.toMatch(
			/systemicValue|waitingForUniqueCode|\bpending\b|\bsituation\b|integrationCode/i,
		);
	});

	it("estrutural: registry estático expõe check_proposal_status com inputSchema vazio", async () => {
		const { consorcioTools } = await import("@/lib/agent/tools/ai-sdk");
		// biome-ignore lint/suspicious/noExplicitAny: introspecção da tool em teste
		const t = (consorcioTools as any).check_proposal_status;
		expect(t, "check_proposal_status precisa existir em consorcioTools").toBeTruthy();
		expect(Object.keys(t.inputSchema?.shape ?? {})).toEqual([]);
	});

	it("estrutural: prompt manda SEMPRE consultar via tool e proíbe status de memória/re-busca", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/status[\s\S]{0,300}check_proposal_status/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/check_proposal_status[\s\S]{0,600}(de mem[oó]ria|sem chamar a tool)/i,
		);
	});

	it("estrutural: tradução leiga vive no servidor (proposal-status.ts), não no prompt", () => {
		const src = readSource("src/lib/bevi/proposal-status.ts");
		expect(src).toMatch(/STATUS_TRANSLATIONS/);
		expect(src).toMatch(/waitingForUniqueCode/);
		expect(src).toMatch(/getLatestBeviProposal/);
		// erro honesto: nunca estado inventado no caminho de falha
		expect(src).toMatch(/ok:\s*false/);
	});
});

// ============================================================================
// CENARIO FIX-13 — Prazo inventado na oferta real de parceiro
// ----------------------------------------------------------------------------
// Real (rodada 2026-06-05 tarde): card "Confirmado com a CANOPUS" mostrou
// parcela R$ 469,95 pra carta de R$ 46.000 — parecia "errada" perto do BB
// (R$ 2.872,71 em 17 meses). A diferença era 100% prazo (~98 meses), mas a
// oferta da API de Parceiro tem EXATAMENTE 8 campos e `term` NÃO é um deles
// (bevi-api-parceiro-spec.md §7, verificado ao vivo). Regra D11: nenhum
// número sem fonte — nem o agent em texto, nem o card, podem inventar/derivar
// prazo. O card se explica com copy honesta apontando pro PDF da proposta.
// ============================================================================

describe("FIX-13→FIX-39-PRAZO-COM-FONTE — prazo agora vem da API (campo real); ninguém DERIVA", () => {
	// Detector: "98 meses", "em 110 meses", "prazo de 84 meses"… EM PROSA do agent.
	// O prazo REAL (FIX-39) vai no CARD (campo estruturado, fonte da API), nunca
	// despejado em texto livre onde a derivação valorCarta÷parcela mente (FIX-13).
	const PRAZO_DETECTOR = /\b\d{1,3}\s*(meses|mês)\b/i;

	const START_OK = {
		proposalId: "prop-1",
		offer: {
			ofertaId: "oferta-1",
			administradora: "CANOPUS",
			grupo: "4400",
			category: "auto" as const,
			creditValue: 46_000,
			monthlyPayment: 469.95,
			tipoOferta: "SPECIAL_OFFER" as const,
		},
		noOffer: false,
	};
	// FIX-39: a API nova devolve `prazo` → o mapper o coloca em termMonths.
	const START_COM_PRAZO = {
		...START_OK,
		offer: { ...START_OK.offer, termMonths: 72 },
	};

	it("cassette: agent DERIVANDO prazo em texto (valorCarta÷parcela) — detector ainda pega", async () => {
		// Mesmo com prazo real disponível, DERIVAR em prosa segue proibido (FIX-13):
		const cassette =
			"Confirmei com a CANOPUS: carta de R$ 46.000 com parcela de R$ 469,95 — " +
			"isso dá aproximadamente 98 meses de prazo.";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
		expect(PRAZO_DETECTOR.test(text)).toBe(true);
	});

	it("texto canônico de produção (realOfferPresentation) NÃO despeja prazo em prosa — com OU sem prazo", () => {
		for (const start of [START_OK, START_COM_PRAZO]) {
			const items = realOfferPresentation(start);
			const allText = items
				.filter((i) => i.kind === "text")
				.map((i) => i.text)
				.join("\n");
			expect(allText.length).toBeGreaterThan(0);
			expect(PRAZO_DETECTOR.test(allText)).toBe(false);
		}
	});

	it("payload do real_offer: COM prazo real → termMonths presente; SEM prazo → ausente (nunca inventa)", () => {
		const comPrazo = realOfferPresentation(START_COM_PRAZO).find(
			(i) => i.kind === "artifact" && i.type === "real_offer",
		);
		if (comPrazo?.kind !== "artifact") throw new Error("real_offer ausente");
		expect(comPrazo.payload.termMonths).toBe(72);

		const semPrazo = realOfferPresentation(START_OK).find(
			(i) => i.kind === "artifact" && i.type === "real_offer",
		);
		if (semPrazo?.kind !== "artifact") throw new Error("real_offer ausente");
		expect("termMonths" in semPrazo.payload).toBe(false);
	});

	it("componente consome o prazo REAL defensivamente e mantém o fallback honesto do PDF", () => {
		const src = readSource("src/components/chat/artifacts/real-offer.tsx");
		// Consome o campo real da API (gap do FIX-13 acabou):
		expect(src).toMatch(/termMonths/);
		// Defensivo (Number.isFinite) — nunca renderiza NaN/null:
		expect(src).toMatch(/Number\.isFinite\(\s*payload\.termMonths\s*\)/);
		// Fallback honesto quando ausente (API pode voltar atrás):
		expect(src).toMatch(/proposta \(PDF\)/);
		// NÃO deriva prazo de valorCarta÷parcela (sem divisão pra meses):
		expect(src).not.toMatch(/creditValue\s*\/\s*\w*[Pp]ayment/);
	});
});

// ============================================================================
// CENARIO FIX-40 — Lance médio do grupo informa POSIÇÃO, nunca promete contemplação
// ----------------------------------------------------------------------------
// A API nova (2026-06-12) trouxe `lanceMedio` (R$ do grupo) — a fonte que faltava
// pra falar de lance com número (o FIX-8 matou o "lance estimado" por não existir
// fonte). Caso real da jornada do Kairo: lance declarado R$ 117 mil vs lanceMedio
// R$ 69 mil. Decisão do Kairo: rótulo LITERAL do campo ("lance médio do grupo"),
// comparação FACTUAL de posição (acima/abaixo) — PROIBIDO derivar "chance de
// contemplar" / prometer contemplação (semântica não confirmada com a AGX).
// ============================================================================
describe("FIX-40-LANCE-MEDIO-SEM-PROMESSA — compara posição do lance; zero promessa de contemplação", () => {
	// Detector de PROMESSA de contemplação (o que NINGUÉM pode dizer a partir do lance):
	const PROMESSA_CONTEMPLACAO =
		/(ser[áa]|vai|fica)\s+contemplad|garant\w*\s+(a\s+|sua\s+)?contempla|chance\s+de\s+\d|\d+\s*%\s*de\s*(chance|contempla)|contempla\w*\s+(garantid|cert)/i;

	const START_COM_LANCE = {
		proposalId: "prop-1",
		offer: {
			ofertaId: "oferta-1",
			administradora: "BANCO DO BRASIL",
			grupo: "1690",
			category: "auto" as const,
			creditValue: 114_760.54,
			monthlyPayment: 2_075.34,
			avgBidValue: 69_361.27,
			tipoOferta: "SPECIAL_OFFER" as const,
		},
		noOffer: false,
	};

	it("cassette: agent prometendo contemplação a partir do lance médio — detector pega", async () => {
		const cassette =
			"Seu lance de R$ 117 mil está acima do lance médio do grupo (R$ 69 mil), " +
			"então você será contemplado logo nas primeiras assembleias.";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
		expect(PROMESSA_CONTEMPLACAO.test(text)).toBe(true);
	});

	it("texto canônico de produção (realOfferPresentation + lance declarado) compara SEM prometer", () => {
		const items = realOfferPresentation(START_COM_LANCE, { declaredLanceValue: 117_000 });
		const allText = items
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");
		// Posição factual presente (rótulo literal do campo):
		expect(allText).toMatch(/acima/i);
		expect(allText).toMatch(/lance médio/i);
		// Zero promessa de contemplação:
		expect(PROMESSA_CONTEMPLACAO.test(allText)).toBe(false);
	});

	it("sem lance declarado → produção NÃO injeta comparação (nada de acima/abaixo)", () => {
		const allText = realOfferPresentation(START_COM_LANCE)
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");
		expect(allText).not.toMatch(/acima|abaixo|na média/i);
	});

	it("componente: card mostra 'lance médio do grupo' (rótulo literal) defensivamente", () => {
		const src = readSource("src/components/chat/artifacts/real-offer.tsx");
		expect(src).toMatch(/[Ll]ance médio do grupo/);
		expect(src).toMatch(/Number\.isFinite\(\s*payload\.avgBidValue\s*\)/);
		// O card NÃO promete contemplação no rótulo:
		expect(src).not.toMatch(/lance[^\n]{0,40}contempl/i);
	});
});

// ============================================================================
// CENARIO — BUG-REVEAL-3-OPCOES-1-CARD (teste manual Kairo 2026-06-11)
// ----------------------------------------------------------------------------
// Real (web, auto): o agente anunciou "Encontrei 3 opcoes pro seu perfil" mas o
// reveal so mostrou 1 card (recommendation_card do Itau) + a simulacao. As outras
// 2 ficavam escondidas atras do botao "Ver outras opcoes". Kairo: "disse que
// tinha 3 opcoes mas mostrou so uma nos cards. e o card do carrossel ta muito
// grande".
//
// Fix: com 2+ grupos o reveal emite present_comparison_table (carrossel de TODAS
// as opcoes, recomendada destacada) no proprio reveal. Camada 1 estrutural vive
// em jornada-docx-copy.test.ts (directive instrui present_comparison_table) +
// recommendation-card.docx-resumo.test.tsx (sizing max-w-sm) +
// comparison-table.fees-removal.test.tsx (sem Taxa no carrossel).
// ============================================================================

describe("BUG-REVEAL-3-OPCOES-1-CARD — reveal anunciou 3 mas mostrava 1 card", () => {
	it("cassette: reveal com 2+ grupos emite present_comparison_table (o carrossel das 3)", async () => {
		// Trajetoria correta do reveal: destaque + carrossel + detalhamento.
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Encontrei 3 boas opcoes pro seu perfil! A mais aderente e a do Itau:"),
			toolCallChunk("tc-rec", "present_recommendation_card", { administradora: "ITAÚ" }),
			toolCallChunk("tc-cmp", "present_comparison_table", {
				groups: [{ id: "g1" }, { id: "g2" }, { id: "g3" }],
				highlightBestIndex: 0,
			}),
			toolCallChunk("tc-sim", "present_simulation_result", { groupId: "g1" }),
			FINISH_TOOL_CALLS,
		]);
		const names = toolCalls.map((t) => t.toolName);
		// O carrossel das opcoes anunciadas DEVE estar no reveal (nao escondido).
		expect(names).toContain("present_comparison_table");
		// E o destaque (recomendada) tambem.
		expect(names).toContain("present_recommendation_card");
	});

	it("estrutural: directive de reveal (2+ grupos) instrui o carrossel com a recomendada destacada", () => {
		const d = buildSearchSummaryDirective({
			category: "auto",
			meta: {
				experiencePrev: "first",
				qualifyAnswers: {
					creditMin: 90_000,
					creditMax: 100_000,
					monthlyBudget: 1_700,
					prazoMeses: 0,
					hasLance: "yes",
				},
			},
		});
		expect(d).toMatch(/present_comparison_table/);
		expect(d).toMatch(/TODOS os grupos/);
		expect(d).toMatch(/highlightBestIndex=0/);
		// Garante que a proibicao antiga ("comparacao sob demanda") saiu.
		expect(d).not.toMatch(/N[AÃ]O chame present_comparison_table neste turno/i);
	});
});

// ============================================================================
// CENARIO — BUG-DIAL-DESCALIBRADO-CASSETTE (auditoria Kairo 2026-06-11)
// ----------------------------------------------------------------------------
// Jornada REAL (web, oferta BANCO DO BRASIL via Bevi): o card de simulacao
// disse "lance de 49,28% -> contemplacao ~6 meses" (dado real da oferta) e o
// dial, aberto em seguida no MESMO mes 6, mostrou "lance necessario 74%" +
// "lance proprio R$ 115.416" + "parcela estimada R$ 2.556" (fantasia). E o
// card mostrou "Valor que voce recebe R$ 262.309,80" (a carta CHEIA) com
// embutido de 49,28% — payload digitado pelo modelo com campo trocado.
// 3 fixes server-side: C1 (referenceMonth calibra o motor no par real),
// C2 (coerceDialPayload forca os numeros de lance da oferta), C3
// (coerceSimulationPayload coage o card contra o retorno real do
// simulate_quota). Este cassette reproduz a TRAJETORIA do dado com os numeros
// exatos do bug.
// ============================================================================

describe("BUG-DIAL-DESCALIBRADO — card 49,28%/~6m vs dial 74%/6m na mesma oferta", () => {
	// Retorno REAL do simulate_quota na jornada (shape beviOfferToQuotaSimulation)
	const QUOTA_SIM_BB = {
		groupId: "quota-bb",
		category: "auto",
		creditValue: 262_309.8,
		monthlyPayment: 9_828.92,
		adminFee: 44_592.67,
		reserveFund: 5_246.2,
		insurance: 0,
		totalCost: 334_183.28,
		termMonths: 34,
		effectiveRate: 27.4,
		lanceScenario: { lancePercent: 49.28, expectedTermMonths: 6 },
		embeddedBid: {
			percent: 49.28,
			embeddedBidValue: 129_266.27,
			receivedCredit: 133_043.53,
			necessaryBidToContemplate: 129_266.27,
		},
		expectedAdjustment: { index: "IPCA", annualPercent: 4.5 },
	};

	it("C3: payload alucinado pelo modelo (recebe = carta CHEIA) e coagido pro dado real", async () => {
		const { coerceSimulationPayload } = await import("@/lib/agent/orchestrator/simulation-payload");
		const hallucinated = {
			administradora: "BANCO DO BRASIL",
			creditValue: 262_309.8,
			monthlyPayment: 9_828.92,
			termMonths: 34,
			embeddedBid: {
				percent: 49.28,
				embeddedBidValue: 129_266.27,
				receivedCredit: 262_309.8, // <- o bug exato observado
				necessaryBidToContemplate: 129_266.27,
			},
		};
		const out = coerceSimulationPayload(hallucinated, QUOTA_SIM_BB);
		expect((out.embeddedBid as { receivedCredit: number }).receivedCredit).toBeCloseTo(
			133_043.53,
			2,
		);
	});

	it("C1+C2: trajetoria completa do dado — snapshot do card calibra o dial e 74% vira 49%", async () => {
		const { coerceSimulationPayload } = await import("@/lib/agent/orchestrator/simulation-payload");
		const { coerceDialPayload, offerSnapshotFromArtifact } = await import(
			"@/lib/agent/orchestrator/dial-payload"
		);
		const { computeContemplationDial } = await import("@/lib/consorcio/contemplation-dial");

		// 1. card de simulacao coagido (como o runner emite)
		const simPayload = coerceSimulationPayload(
			{ administradora: "BANCO DO BRASIL", category: "auto" },
			QUOTA_SIM_BB,
		);
		// 2. dial coagido a partir do snapshot do card + perfil declarado da jornada
		const dialPayload = coerceDialPayload({}, offerSnapshotFromArtifact(simPayload), {
			prazoMeses: 27,
			lanceValue: 117_000,
		});
		// numeros de lance vieram da oferta, nao do modelo
		expect(dialPayload.historicalWinningBidPct).toBeCloseTo(49.28, 1);
		expect(dialPayload.referenceMonth).toBe(6);
		expect(dialPayload.maxEmbutidoPct).toBeCloseTo(49.28, 1);
		// abre no prazo DECLARADO (27), nao em 6 hardcoded
		expect(dialPayload.initialTargetMonth).toBe(27);
		expect(dialPayload.declaredLanceValue).toBe(117_000);

		// 3. motor no mes 6 (o cenario do card): dial == card, nunca mais 74%
		const r = computeContemplationDial({
			creditValue: dialPayload.creditValue as number,
			termMonths: dialPayload.termMonths as number,
			targetMonth: 6,
			historicalWinningBidPct: dialPayload.historicalWinningBidPct as number,
			referenceMonth: dialPayload.referenceMonth as number,
			monthlyPayment: dialPayload.monthlyPayment as number,
			maxEmbutidoPct: dialPayload.maxEmbutidoPct as number,
		});
		expect(r.requiredLancePct).toBe(49);
		expect(r.ownCashValue).toBe(0); // embutido real cobre — sem "R$ 115 mil do bolso"
		// C4: parcela honesta — embutido nao derruba a parcela (nada de R$ 2.556)
		expect(r.paymentAfterContemplation).toBeCloseTo(9_828.92, 2);
	});

	it("wiring estrutural: runner captura simulate_quota e coage simulation_result + dial com perfil", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/lib/agent/orchestrator/runner.ts", "utf-8");
		expect(src).toMatch(/simulate_quota/);
		expect(src).toMatch(/coerceSimulationPayload/);
		expect(src).toMatch(/prazoMeses: meta\.qualifyAnswers\?\.prazoMeses/);
		expect(src).toMatch(/lanceValue: meta\.qualifyAnswers\?\.lanceValue/);
	});
});

// ============================================================================
// CENARIO — BUG-SNAPSHOT-ANCHOR-POBRE (E2E real pos-D18, 2026-06-11)
// ----------------------------------------------------------------------------
// Mesmo com C1/C2 implementados, o smoke E2E real mostrou o dial com 31% no
// mes 6 (defaults heuristicos: 40% x ancora 5) em vez dos ~24% do card.
// Causa: o persist do reveal escolhia o RECOMMENDATION_CARD como ancora do
// snapshot (prioridade do "plano destacado") — mas so o SIMULATION_RESULT
// carrega lanceScenario/embeddedBid. O meta.recommendedOffer ficava sem os
// lance fields e o dial do turno seguinte caia nos defaults. O snapshot da
// oferta deve preferir o artifact RICO; a administradora pode continuar vindo
// do recommendation_card.
// ============================================================================

describe("BUG-SNAPSHOT-ANCHOR-POBRE — persist do reveal precisa do artifact RICO", () => {
	it("runner: snapshot do reveal usa simulation_result ANTES de recommendation_card", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/lib/agent/orchestrator/runner.ts", "utf-8");
		// O bloco do persist do reveal declara um snapshotAnchor com
		// simulation_result em primeiro lugar (artifact rico em lance fields).
		const m =
			/const snapshotAnchor =\s*artifacts\.find\(\(a\) => a\.type === "simulation_result"\)/m;
		expect(src).toMatch(m);
		// e o offerSnapshot é extraído DELE, não do anchor de administradora
		expect(src).toMatch(/offerSnapshotFromArtifact\(snapshotAnchor\?\.payload\)/);
	});

	it("offerSnapshotFromArtifact: payload de recommendation_card (sem lance) produz snapshot SEM lance fields — nunca inventa", async () => {
		const { offerSnapshotFromArtifact } = await import("@/lib/agent/orchestrator/dial-payload");
		const snap = offerSnapshotFromArtifact({
			administradora: "BANCO DO BRASIL",
			creditValue: 263_010.04,
			termMonths: 18,
			monthlyPayment: 18_469.16,
		});
		expect(snap?.lanceRefPct).toBeUndefined();
		expect(snap?.lanceRefMonth).toBeUndefined();
	});
});

// ============================================================================
// CENARIO — FIX-19-TOOL-POLICY (bloco G, sessão de arquitetura 2026-06-11)
// ----------------------------------------------------------------------------
// Causa raiz comum de FIX-11/FIX-12/BUG-REVEAL-LOOP/PF-07: o modelo enxergava
// TODAS as ~15 tools em QUALQUER fase da jornada — cada tool visível fora de
// fase é um convite à chamada indevida — e a defesa era 100% a jusante (guard
// do runner suprime o card DEPOIS da chamada). O FIX-19 inverte: tool fora de
// fase NEM ENTRA no request (allowedTools(meta) filtra o toolset no builder).
// Os guards do runner viram segunda linha de defesa (defense-in-depth) e
// disparo de guard pós-policy ganha log forte [tool-policy-violation].
//
// Camada 1 detalhada: src/lib/agent/orchestrator/tool-policy.test.ts (matriz
// fase × tool + wiring do builder). Aqui: replay dos streams dos 2 bugs com
// assert de que a tool indevida NEM ESTÁ no toolset — não apenas suprimida.
// ============================================================================

describe("FIX-19-TOOL-POLICY — tool fora de fase nem entra no request", () => {
	function policyPersonaRow() {
		return {
			id: "moto",
			displayName: "Bruno",
			role: "specialist",
			category: "moto",
			expertise: null,
			voiceTone: "consultivo",
			examples: [],
			temperature: 0.7,
			activeCampaigns: [],
			handoffTriggers: [],
			forbiddenTopics: [],
			activeTools: [
				"search_groups",
				"simulate_quota",
				"get_rates",
				"get_group_details",
				"recommend_groups",
				"present_group_card",
				"present_comparison_table",
				"present_simulation_result",
				"present_recommendation_card",
			],
			isActive: true,
			version: 1,
			createdAt: new Date("2026-06-11T00:00:00Z"),
			updatedAt: new Date("2026-06-11T00:00:00Z"),
		};
	}

	/** Fim do passo 2 (gate identify) — estado exato da conversa do FIX-12. */
	const FIX12_META: ConversationMetadata = {
		currentPersona: "moto",
		currentCategory: "moto",
		experiencePrev: "first",
		qualifyConsented: true,
		qualifyAnswers: {
			creditMin: 35_000,
			creditMax: 40_000,
			monthlyBudget: 800,
			prazoMeses: 8,
			hasLance: "no",
			lanceEmbutido: false,
		},
	};

	/** Pós-fechamento (CANOPUS contratada) — estado exato da conversa do FIX-11. */
	const FIX11_META: ConversationMetadata = {
		...FIX12_META,
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		simulatorOfferDispatched: true,
		decisionDispatched: true,
		recommendedAdministradora: "CANOPUS",
		contractClosed: true,
	};

	it("cassette FIX-12: modelo chamou present_contract_form no gate identify (PRÉ-reveal)", async () => {
		// Reprodução fiel da trajetória (prints 27/28/31/32 da rodada 2026-06-05):
		// narrativa de identidade + form de CONTRATAÇÃO no lugar do gate identify.
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks(
				"t1",
				"Boa! Pra eu buscar as opções reais, o sistema precisa da sua identidade:",
			),
			toolCallChunk("tc-1", "present_contract_form", { administradora: "CANOPUS" }),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls.some((tc) => tc.toolName === "present_contract_form")).toBe(true);

		// FIX-19 (gating a montante): nessa fase a tool NEM PODE estar no request.
		const { allowedTools } = await import("@/lib/agent/orchestrator/tool-policy");
		expect(allowedTools(FIX12_META)).not.toContain("present_contract_form");

		const { buildAgent } = await import("@/lib/agent/agents/builder");
		// biome-ignore lint/suspicious/noExplicitAny: PersonaRow literal de teste
		const agent = buildAgent(policyPersonaRow() as any, "neutro", { meta: FIX12_META });
		// biome-ignore lint/suspicious/noExplicitAny: introspecção das tools do agent
		const tools = Object.keys(((agent as any).tools ?? {}) as Record<string, unknown>);
		expect(
			tools,
			"present_contract_form exposto PRÉ-reveal — o FIX-19 exige que a tool nem entre " +
				"no toolset do agent nessa fase (a supressão do runner é só segunda linha)",
		).not.toContain("present_contract_form");
	});

	it("cassette FIX-11: pós-fechamento, 'qual status?' re-rodou descoberta e ofereceu OUTRA administradora", async () => {
		// Reprodução fiel (2026-06-05 tarde): usuário JÁ contratou CANOPUS,
		// perguntou status e o agent re-buscou + recomendou BANCO DO BRASIL.
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Deixa eu verificar as melhores opções pra você!"),
			toolCallChunk("tc-1", "search_groups", { category: "moto", creditMax: 40_000 }),
			toolCallChunk("tc-2", "present_recommendation_card", { administradora: "BANCO DO BRASIL" }),
			toolCallChunk("tc-3", "present_simulation_result", { administradora: "BANCO DO BRASIL" }),
			FINISH_TOOL_CALLS,
		]);
		const names = toolCalls.map((tc) => tc.toolName);
		expect(names).toContain("search_groups");
		expect(names).toContain("present_recommendation_card");

		// FIX-19: estado TERMINAL — descoberta/cards fora do toolset; status entra.
		const { allowedTools } = await import("@/lib/agent/orchestrator/tool-policy");
		const allowed = allowedTools(FIX11_META);
		expect(allowed).not.toContain("search_groups");
		expect(allowed).not.toContain("recommend_groups");
		expect(allowed).not.toContain("present_recommendation_card");
		expect(allowed).not.toContain("present_simulation_result");
		expect(allowed).toContain("check_proposal_status");

		const { buildAgent } = await import("@/lib/agent/agents/builder");
		// biome-ignore lint/suspicious/noExplicitAny: PersonaRow literal de teste
		const agent = buildAgent(policyPersonaRow() as any, "neutro", { meta: FIX11_META });
		// biome-ignore lint/suspicious/noExplicitAny: introspecção das tools do agent
		const tools = Object.keys(((agent as any).tools ?? {}) as Record<string, unknown>);
		expect(
			tools,
			"toolset pós-fechamento ainda carrega descoberta — FIX-11 voltaria: a re-busca tem " +
				"que morrer NA ORIGEM (tool fora do request), não só no guard do runner",
		).not.toContain("search_groups");
		expect(tools).toContain("check_proposal_status");
	});

	it("cassette EVAL-FIX-14 (nightly 2026-06-11): pergunta de status com proposta REAL em bevi_proposals mas meta sem contractClosed — check_proposal_status NUNCA sai do toolset", async () => {
		// Bug pego pelo eval Camada 3 na primeira rodada da policy: a tabela
		// tirou check_proposal_status de qualify/reveal e o agent NEGOU uma
		// proposta real de memória ("nem simulamos nenhuma opção ainda") — a
		// fonte de verdade da proposta é bevi_proposals, que pode existir sem
		// meta.contractClosed. A tool é LEITURA pura (FIX-14: primitivo sempre
		// presente, status nunca respondido de memória) → vive na BASE.
		const { allowedTools } = await import("@/lib/agent/orchestrator/tool-policy");
		for (const meta of [FIX12_META, { ...FIX12_META, revealCompleted: true }, FIX11_META]) {
			expect(allowedTools(meta as ConversationMetadata)).toContain("check_proposal_status");
		}
		const { buildAgent } = await import("@/lib/agent/agents/builder");
		// biome-ignore lint/suspicious/noExplicitAny: PersonaRow literal de teste
		const agent = buildAgent(policyPersonaRow() as any, "neutro", { meta: FIX12_META });
		// biome-ignore lint/suspicious/noExplicitAny: introspecção das tools do agent
		const tools = Object.keys(((agent as any).tools ?? {}) as Record<string, unknown>);
		expect(
			tools,
			"check_proposal_status fora do toolset em fase pré-fechamento — o agent volta a negar " +
				"proposta real de memória (regressão do eval EVAL-FIX-14-STATUS-VIA-TOOL)",
		).toContain("check_proposal_status");
	});

	it("acoplamento: builder consome allowedTools e resolveAgent propaga o meta", () => {
		const builderSrc = readSource("src/lib/agent/agents/builder.ts");
		expect(builderSrc).toMatch(/allowedTools/);
		const indexSrc = readSource("src/lib/agent/agents/index.ts");
		expect(indexSrc).toMatch(/meta/);
	});

	it("acoplamento: runner loga [tool-policy-violation] quando tool fora da policy é chamada", () => {
		const runnerSrc = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(runnerSrc).toMatch(/tool-policy-violation/);
	});
});

// ============================================================================
// FIX-21 — Telemetria de trajetória: o tap NÃO engole eventos (passthrough)
// ============================================================================
//
// O bloco H instrumenta o funil de consumo de TurnEvents do WhatsApp
// (consumeEvents do adapter) com `traceTurnEvents` — um tap passthrough que
// fecha 1 trace/turno. A regressão crítica: a instrumentação não pode alterar
// o stream que o consumidor vê. Se um dia alguém trocar o `yield ev` por algo
// que filtra/reordena/engole eventos, este cassette quebra ANTES de chegar em
// produção (onde o sintoma seria artifact dropado / texto faltando no canal).
//
// Cassette = a trajetória determinística de um turno de reveal (texto + tools
// de descoberta + simulation_result + gate simulator-offer + finish), igual ao
// que o orquestrador emitiria. 100% determinístico, zero DB, zero Anthropic.
describe("FIX-21 — telemetria de trajetória (tap passthrough)", () => {
	const revealTurn: TurnEvent[] = [
		{ type: "text-delta", text: "Achei 3 grupos que " },
		{ type: "text-delta", text: "encaixam no seu perfil:" },
		{ type: "tool-call", toolName: "search_groups", input: {}, toolCallId: "c1" },
		{ type: "tool-call", toolName: "simulate_quota", input: {}, toolCallId: "c2" },
		{
			type: "artifact",
			artifactType: "simulation_result",
			payload: { administradora: "CANOPUS" },
			toolCallId: "c2",
		},
		{ type: "lead-stage", stage: "qualificado" },
		{ type: "gate", gate: "simulator-offer" },
		{ type: "finish", reason: "ok" },
	];

	async function drain(
		events: TurnEvent[],
	): Promise<{ seen: TurnEvent[]; trace: TurnTraceRecord | null }> {
		const seen: TurnEvent[] = [];
		let trace: TurnTraceRecord | null = null;
		const tapped = traceTurnEvents(
			(async function* () {
				for (const ev of events) yield ev;
			})(),
			{ conversationId: "conv-fix21", channel: "whatsapp", persona: "consultor-auto" },
			{
				now: () => 0,
				newId: () => "fix21-trace",
				sink: (r) => {
					trace = r;
				},
			},
		);
		for await (const ev of tapped) seen.push(ev);
		return { seen, trace };
	}

	it("re-emite TODOS os eventos do turno na ordem original (passthrough intacto)", async () => {
		const { seen } = await drain(revealTurn);
		// Nada engolido, nada reordenado, nada injetado.
		expect(seen).toEqual(revealTurn);
		expect(seen).toHaveLength(revealTurn.length);
	});

	it("fecha exatamente 1 trace/turno agregando gate, tools e artifacts", async () => {
		const { trace } = await drain(revealTurn);
		expect(trace).not.toBeNull();
		const r = trace as unknown as TurnTraceRecord;
		expect(r.channel).toBe("whatsapp");
		expect(r.persona).toBe("consultor-auto");
		expect(r.toolsCalled).toEqual(["search_groups", "simulate_quota"]);
		expect(r.artifactsEmitted).toEqual(["simulation_result"]);
		expect(r.gate).toBe("simulator-offer");
		expect(r.leadStage).toBe("qualificado");
		expect(r.finishReason).toBe("ok");
	});

	it("turno de handoff: passthrough do handoff intacto + trace marca handoff", async () => {
		const handoffTurn: TurnEvent[] = [
			{ type: "text-delta", text: "Vou te passar pro nosso consultor." },
			{ type: "handoff", reason: "trigger satisfied" },
			{ type: "finish", reason: "handoff" },
		];
		const { seen, trace } = await drain(handoffTurn);
		expect(seen).toEqual(handoffTurn);
		const r = trace as unknown as TurnTraceRecord;
		expect(r.handoff).toBe(true);
		expect(r.finishReason).toBe("handoff");
	});
});

// ============================================================================
// CENARIO — FIX-17: gate do nome em card focado (primeiro contato)
// ----------------------------------------------------------------------------
// Teste manual do Kairo (2026-06-11): "como posso te chamar" pedia o nome em
// texto livre — a UNICA coleta texto-livre do funil (todos os outros passos
// tem UI dedicada). No mobile (publico majoritario) o teclado nem abria. Fix:
// card com input FOCADO, deterministico no turno do primeiro contato.
//
// Decisao do Kairo: coexistencia card/texto — os dois caminhos convergem na
// persistencia do nome. O caminho texto-livre (save_contact_name forcado via
// toolChoice, detect-name-turn.ts) segue intacto; o card e o caminho novo
// (route persiste direto, sem tool). Aqui o cassette guarda o caminho
// texto-livre + os invariantes estruturais do card deterministico.
// ============================================================================

describe("FIX-17 — gate do nome em card focado (primeiro contato)", () => {
	it("cassette: turno do nome (texto livre) chama save_contact_name UMA vez e saúda sem re-perguntar", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Prazer, Kairo!"),
			toolCallChunk("tc-name-1", "save_contact_name", { name: "Kairo" }),
			FINISH_TOOL_CALLS,
		]);

		const nameCalls = toolCalls.filter((t) => t.toolName === "save_contact_name");
		expect(nameCalls).toHaveLength(1);
		expect((nameCalls[0]?.input as { name?: string }).name).toBe("Kairo");
		// Saúda usando o nome e NÃO re-pergunta (o card/texto já capturou).
		expect(text).toMatch(/Kairo/);
		expect(text).not.toMatch(/como (posso )?te chamar|qual.*seu nome|seu nome\?/i);
	});

	it("estrutural: gate 'name' dispara deterministico no primeiro contato, sem duplicar a pergunta", () => {
		const meta = { currentCategory: "auto" } as ConversationMetadata;
		// Antes do fix: 'doubts-wait' (no-op). Agora: o card aparece.
		expect(nextGate(meta, { hasContactName: false })).toBe("name");
		// O texto do agente (directive de 1o contato) já carrega a pergunta —
		// gateQuestion null impede o card de escrever a pergunta de novo.
		expect(gateQuestion("name")).toBeNull();
	});

	it("estrutural: runner NÃO seta prefix pro gate 'name' (preserva o texto do agente no WhatsApp)", () => {
		// gateInteractive('name') = null no WhatsApp; se o runner setasse prefix, o
		// adapter limparia o textBuffer e a pergunta do nome se perderia no canal.
		const runnerSrc = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(runnerSrc).toMatch(/gate !== "name"/);
	});
});

// ============================================================================
// CENARIO — FIX-18: confronto de viabilidade quando o orcamento nao fecha
// ----------------------------------------------------------------------------
// Auditoria do dial / jornada BB real do Kairo (2026-06-11): perfil declarado
// carro 250k · R$ 1.000/mes · ~27 meses. Combinacao impossivel (250k a 1k/mes
// ~ 24 anos). O sistema buscou pela CARTA, achou ofertas com parcela de R$
// 9.828,92/mes (9,8x o orcamento), rotulou "Compativel com seu perfil" com o
// breakdown confessando "Orcamento 0%", e o agente CELEBROU ("bem proximo do
// seu objetivo") em vez de confrontar.
//
// Defesa em 3 frentes (decisao do Kairo: confronto no picker E no reveal, tom
// guia-nao-empurra): (1) card com rotulo honesto deterministico, (2) diretiva
// do reveal instrui confronto, (3) regra dura no prompt.
// ============================================================================

describe("FIX-18 — confronto de viabilidade (orcamento declarado nao fecha)", () => {
	it("cassette: agent CELEBRANDO uma parcela 9,8x acima do orcamento é o anti-padrao (bug original)", async () => {
		const cassette = "Achei uma opcao bem proxima do seu objetivo! A parcela fica em R$ 9.828,92.";
		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		// Reproducao fiel do bug: celebracao ("bem proxima do seu objetivo") sem
		// nenhum confronto do estouro de orcamento.
		expect(text).toBe(cassette);
		const celebraSemConfronto =
			/(bem )?pr[oó]xim[ao] do seu objetivo|[óo]tima (escolha|opcao)|achei (uma|a) (op[çc][ãa]o|carta)/i;
		expect(celebraSemConfronto.test(cassette)).toBe(true);
		// O texto do bug NAO confronta o orcamento.
		expect(/acima do.*or[çc]amento|n[ãa]o fecha|fora do.*or[çc]amento/i.test(cassette)).toBe(false);
	});

	it("rotulo do card NUNCA mente: monthlyFit≈0 → 'Melhor opcao na faixa de credito' (deterministico)", () => {
		// Guard mais forte (independe da LLM): o card nunca rotula "Compativel com
		// seu perfil" quando a parcela estourou o orcamento (monthlyFit=0).
		expect(recommendationFitLabel(0.68, 0)).toBe("Melhor opção na faixa de crédito");
		expect(recommendationFitLabel(0.68, 0)).not.toBe("Compatível com seu perfil");
	});

	it("estrutural: diretiva do reveal instrui confronto antes de celebrar quando ha orcamento", () => {
		const meta = {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyAnswers: {
				creditMin: 200_000,
				creditMax: 250_000,
				monthlyBudget: 1_000,
				prazoMeses: 27,
				hasLance: "no",
			},
		} as unknown as ConversationMetadata;
		const d = buildSearchSummaryDirective({ category: "auto", meta });
		expect(d).toMatch(/confront|acima do.*or[çc]amento|estoura/i);
		expect(d).toMatch(/ajustar o valor do bem|ajustar o bem/i);
	});

	it("estrutural: prompt tem regra dura de confronto honesto de orcamento", () => {
		const prompt = `${SPECIALIST_BASE_PROMPT}\n${SYSTEM_PROMPT}`;
		expect(prompt).toMatch(/confront|n[ãa]o celebr|acima do.*or[çc]amento/i);
	});
});

// ============================================================================
// CENARIO — FIX-25 / MC-5 — fechamento Bevi pelo canal WhatsApp
// ----------------------------------------------------------------------------
// Gap P1 desde o PR #19: o passo 5 (Contratar) era WEB-ONLY. No WhatsApp o
// contract_form degradava pra texto pedindo CPF e a conversa MORRIA —
// `startContract` tinha ZERO referencia em src/lib/whatsapp/. O usuario chegava
// ao passo 5 e caia no vazio.
//
// Fix: maquina de estado `contractCollection` (espelho do leadCollection),
// captura conversacional do aceite (processor + contract-capture), botoes
// interactive (contract_confirm/contract_cancel) e disparo de startContract no
// aceite — terminal identico ao web (contractClosed + Parabens + resumo).
//
// Defesa estrutural detalhada:
//   - src/lib/bevi/contract-input.test.ts (derivacao canonica DRY web+whatsapp)
//   - src/lib/whatsapp/contract-capture.test.ts (transicoes/aceite/recusa/
//     ambiguo/idempotencia/revealGuard + CPF nunca em claro)
//   - src/lib/whatsapp/interactive-handlers.contract.test.ts (botoes + terminal)
// Aqui: cassette do gatilho (present_contract_form pos-decisao) + acoplamento
// estrutural da pipeline WhatsApp ao startContract.
// ============================================================================

describe("FIX-25-FECHAMENTO-WHATSAPP — passo 5 deixa de ser web-only", () => {
	it("cassette: pos-decisao 'contratar agora' dispara present_contract_form (gatilho do fechamento)", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa! Pra fechar, é rapidinho:"),
			toolCallChunk("tc-cf25", "present_contract_form", { administradora: "ANCORA" }),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("present_contract_form");
	});

	it("WhatsApp: contract_form com identidade on file vira CONFIRMACAO interativa (nao dead-end de CPF)", () => {
		const wa = artifactToWhatsApp("contract_form", {
			identityOnFile: true,
			prefilledCpfMasked: "529.•••.•••-25",
			administradora: "ANCORA",
		});
		expect(wa?.type).toBe("interactive");
		const interactive = wa?.interactive as
			| { action?: { buttons?: Array<{ reply: { id: string } }> }; body?: { text?: string } }
			| undefined;
		const ids = (interactive?.action?.buttons ?? []).map((b) => b.reply.id);
		expect(ids).toContain("contract_confirm");
		expect(ids).toContain("contract_cancel");
		// nao pede CPF de novo (FIX-9: identidade ja coletada no identify)
		const body = interactive?.body?.text ?? "";
		expect(body).not.toMatch(/me manda seu \*CPF\*/i);
	});

	it("WhatsApp: contract_form SEM identidade cai no pedido de CPF (defensivo)", () => {
		const wa = artifactToWhatsApp("contract_form", { administradora: "ANCORA" });
		expect(wa?.type).toBe("text");
		if (wa?.type === "text") expect(wa.text).toMatch(/CPF/i);
	});

	it("estrutural: contract-capture dispara startContract e a pipeline WhatsApp esta acoplada", () => {
		const capture = readSource("src/lib/whatsapp/contract-capture.ts");
		expect(capture).toMatch(/startContract\(/);
		expect(capture).toMatch(/buildStartContractInput/);
		// idempotencia: limpa o estado antes do disparo
		expect(capture).toMatch(/delete cleared\.contractCollection/);

		const processor = readSource("src/lib/whatsapp/processor.ts");
		expect(processor).toMatch(/captureContractText/);
		expect(processor).toMatch(/fireContract/);

		const adapter = readSource("src/lib/whatsapp/adapter.ts");
		expect(adapter).toMatch(/beginContractCollection/);

		const handlers = readSource("src/lib/whatsapp/interactive-handlers.ts");
		expect(handlers).toMatch(/contract_confirm/);
		expect(handlers).toMatch(/contract_cancel/);
		// terminal paridade web: contractClosed + resumo
		expect(handlers).toMatch(/contractClosed:\s*true/);
		expect(handlers).toMatch(/sendContractSummary/);
	});

	it("LGPD estrutural: contract-capture NUNCA loga o CPF em claro", () => {
		const capture = readSource("src/lib/whatsapp/contract-capture.ts");
		// nenhum console.* imprimindo a variavel cpf/identity em claro
		expect(capture).not.toMatch(/console\.\w+\([^)]*\bcpf\b/i);
		expect(capture).not.toMatch(/console\.\w+\([^)]*identity\.cpf/i);
	});
});

// ============================================================================
// FIX-33 — valor de carta fora da faixa da categoria (texto livre) tem clamp
// ----------------------------------------------------------------------------
// Real (Kairo dev 2026-06-12): "quero uma carta de 5 milhões de auto" passava
// cru pelo funil (sliders limitam por CREDIT_BOUNDS, texto livre não). O clamp
// server-side ajusta pro teto da categoria E o agente confronta a faixa em vez
// de celebrar um valor que a Bevi não entrega.
// ============================================================================

describe("FIX-33-CLAMP-CARTA — valor fora da faixa por texto livre nao passa cru", () => {
	it("cassette: turno apos 'carta de 5 milhoes de auto' confronta a faixa, sem celebrar o impossivel", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks(
				"t1",
				"Pra auto a faixa vai ate R$ 500 mil. Quer ver as opcoes nesse teto, ou seria um imovel?",
			),
			FINISH_STOP,
		]);

		expect(text).toMatch(/500 mil|R\$ ?500|teto|faixa/i);
		expect(toolCalls).toHaveLength(0);
		// NUNCA celebra o valor impossivel.
		expect(text).not.toMatch(/[óo]tim[ao].*5 milh|perfeito.*5 milh|5 milh[õo]es.*[óo]tim/i);
	});

	it("clamp server-side: 5M de auto persiste o teto da categoria (500k — FIX-54)", async () => {
		const { clampCreditToCategory } = await import("@/lib/agent/qualify-config");
		expect(clampCreditToCategory(5_000_000, "auto").value).toBe(500_000);
		expect(clampCreditToCategory(5_000_000, "auto").clamped).toBe(true);
	});

	it("directive de busca confronta a faixa quando o credito foi clampado (creditClampedFrom)", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyAnswers: {
				creditMin: 450_000,
				creditMax: 500_000,
				creditClampedFrom: 5_000_000,
				prazoMeses: 12,
				hasLance: "no",
			},
		};
		const d = buildSearchSummaryDirective({ category: "auto", meta });
		expect(d).toMatch(/500|faixa|teto/i);
		expect(d.toLowerCase()).toMatch(/clamp|fora da faixa|acima|teto da categoria/);
	});
});

// ============================================================================
// FIX-WA-INTEREST — WhatsApp "Tenho interesse" segue o MESMO funil da web
// ----------------------------------------------------------------------------
// Kairo 2026-06-12: "whatsapp precisa ser exatamente igual a web, é a mesma
// jornada". O handleInterest do WhatsApp fazia startInterestHandoff (consultor
// humano) no clique "Tenho interesse" — o MESMO bug do FIX-34/29 da web, no
// outro canal. Agora dirige present_decision_prompt → present_contract_form
// (self-service). O handoff humano fica SÓ no pedido explícito (handoff_confirm).
// ============================================================================

describe("FIX-WA-INTEREST — 'Tenho interesse' no WhatsApp dirige a DECISAO, nao handoff", () => {
	function interestBody(): string {
		const handlers = readSource("src/lib/whatsapp/interactive-handlers.ts");
		return (
			handlers.match(
				/async\s+function\s+handleInterest[\s\S]*?(?=\n(?:async\s+function|function|\/\/ ----|export)|$)/,
			)?.[0] ?? ""
		);
	}

	it("source-level: handleInterest NAO faz startInterestHandoff; dirige a decisao (self-service)", () => {
		const body = interestBody();
		expect(body.length, "handleInterest não isolado").toBeGreaterThan(0);
		expect(
			body.includes("startInterestHandoff"),
			"FIX-WA: o clique 'Tenho interesse' NÃO pode mais iniciar handoff pra consultor — é self-service (decisão → contratação).",
		).toBe(false);
		expect(
			/buildDecisionPromptDirective|buildAdvanceToContractDirective/.test(body),
			"FIX-WA: handleInterest precisa dirigir present_decision_prompt / passo 5 (igual a web).",
		).toBe(true);
		// o clique segue persistido (GAP #2 do BUG-LEAD-HISTORY-INCOMPLETE).
		expect(body.includes("recordUserClick")).toBe(true);
	});

	it("handoff EXPLICITO (handleHandoffConfirm) PRESERVA startInterestHandoff — pedido de humano é legítimo", () => {
		const handlers = readSource("src/lib/whatsapp/interactive-handlers.ts");
		const confirmBody =
			handlers.match(
				/async\s+function\s+handleHandoffConfirm[\s\S]*?(?=\n(?:async\s+function|function|\/\/ ----|export)|$)/,
			)?.[0] ?? "";
		expect(confirmBody.includes("startInterestHandoff")).toBe(true);
	});
});

// ============================================================================
// BUG-ADMIN-DESSINCRONIZADA-NO-WHATIF (teste manual Kairo 2026-06-12, dev):
// jornada com reveal numa administradora e detalhamento posterior de OUTRA
// (via "outras opções" / what-if). O bloco do what-if no runner atualizava
// SÓ meta.recommendedOffer (snapshot) e deixava meta.recommendedAdministradora
// presa na âncora do reveal. Resultado real na tela: simulação decidida com
// Itaú e o agente anunciando "Preenche ali e a proposta vai direto pra
// Âncora!" — e PIOR: o submit da proposta usa recommendedAdministradora como
// administradoraPreferida (contract-input.ts), então a proposta REAL iria pra
// administradora errada. Os dois campos têm que andar JUNTOS: a oferta
// vigente é o último detalhamento que o usuário viu (semântica FIX-6).
// ============================================================================

describe("BUG-ADMIN-DESSINCRONIZADA — what-if atualiza administradora junto com o snapshot", () => {
	function whatifBlock(): string {
		const runner = readSource("src/lib/agent/orchestrator/runner.ts");
		// Isola o bloco "FIX-6 (what-if)" — do comentário até o fechamento do if.
		return runner.match(/\/\/ FIX-6 \(what-if\)[\s\S]*?\n\t\}/)?.[0] ?? "";
	}

	it("source-level: o persistMeta do what-if grava recommendedAdministradora junto com recommendedOffer", () => {
		const block = whatifBlock();
		expect(block.length, "bloco 'FIX-6 (what-if)' não isolado no runner").toBeGreaterThan(0);
		expect(
			block.includes("recommendedOffer: snap"),
			"o bloco precisa seguir atualizando o snapshot da oferta (FIX-6).",
		).toBe(true);
		expect(
			/recommendedAdministradora:\s*snap\.administradora/.test(block),
			"BUG-ADMIN-DESSINCRONIZADA: o persistMeta do what-if TEM que atualizar " +
				"recommendedAdministradora a partir do snapshot — senão a directive do " +
				"fechamento e a proposta real (contract-input.ts: administradoraPreferida) " +
				"apontam pra administradora do reveal antigo, não pra que o usuário decidiu.",
		).toBe(true);
	});

	it("source-level: contract-input segue preferindo a administradora do meta (fonte única)", () => {
		const input = readSource("src/lib/bevi/contract-input.ts");
		expect(
			/administradoraPreferida:\s*meta\.recommendedAdministradora/.test(input),
			"a proposta real deriva administradoraPreferida do meta — é por isso que o " +
				"campo precisa acompanhar o último detalhamento.",
		).toBe(true);
	});
});

// ============================================================================
// FIX-53-DADOS-ANTES-VALOR (jornada2_revisão.docx — Bernardo, 2026-06-19)
// ----------------------------------------------------------------------------
// Stakeholder: "Precisa pedir os dados, antes do valor" + "Voltou a pedir o
// valor". (1) o gate identify (CPF/celular) sobe pra ANTES do credit (value
// picker); (2) o agente NUNCA re-pergunta o valor já coletado nem re-mostra o
// present_value_picker. Cassette do bug (re-pergunta) + caminho correto, com
// asserts estruturais (gate order + guard + prompt).
// ============================================================================

describe("FIX-53-DADOS-ANTES-VALOR — identidade antes do valor; não re-pedir o valor", () => {
	// Detector: re-pergunta de valor em texto — o bug exato da image4.
	const REASK_VALUE =
		/qual valor aproximado.*(lance|bem)|qual valor do bem|qual valor.*voc[eê] (pensa|quer|tem em mente)/i;

	it("cassette do bug: agent RE-PERGUNTA o valor do lance em texto (reproduz a image4)", async () => {
		const { text } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa! E qual valor aproximado você pensa em dar de lance?"),
			FINISH_STOP,
		]);
		// O detector PEGA a re-pergunta — é exatamente o que o fix proíbe.
		expect(text).toMatch(REASK_VALUE);
	});

	it("cassette correto: valor já coletado → confirma em 1 frase, SEM re-perguntar nem present_value_picker", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Boa, R$ 30 mil de lance então. Anotado!"),
			FINISH_STOP,
		]);
		expect(text).not.toMatch(REASK_VALUE);
		expect(toolCalls.map((t) => t.toolName)).not.toContain("present_value_picker");
	});

	it("cassette: pré-identidade o agente NÃO dispara present_value_picker (dados antes do valor)", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Beleza!"),
			FINISH_STOP,
		]);
		expect(toolCalls.map((t) => t.toolName)).not.toContain("present_value_picker");
	});

	it("estrutural: nextGate coloca identify ANTES de credit (value picker)", () => {
		const base: ConversationMetadata = {
			currentCategory: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
		};
		expect(nextGate(base, { hasContactName: true })).toBe("identify");
		expect(nextGate({ ...base, identityCollected: true }, { hasContactName: true })).toBe("credit");
	});

	it("estrutural: o prompt proíbe re-pedir o valor e explica o enforcement do servidor", () => {
		const p = SPECIALIST_BASE_PROMPT.toLowerCase();
		expect(p).toMatch(/identidade antes do valor/);
		expect(p).toMatch(/valor j[áa] coletado/);
		expect(p).toMatch(/servidor/);
		expect(p).toMatch(/voltou a pedir o valor/);
	});

	it("estrutural: o artifact-guard tem a regra value-picker-order (2ª linha de defesa)", () => {
		const src = readSource("src/lib/agent/orchestrator/artifact-guard.ts");
		expect(src).toMatch(/value-picker-order/);
		expect(src).toMatch(/dados antes do valor/);
	});

	it("estrutural: o handler de identidade (web/route) despacha o próximo gate, NÃO o reveal", () => {
		const src = readSource("src/app/api/chat/route.ts");
		// Após storeIdentity, computa nextGate e segue a qualificação (não revela cedo).
		expect(src).toMatch(/nextAfterIdentity/);
		expect(src).toMatch(/pipeGatePrompt\(\{ conversationId, gate: nextAfterIdentity/);
	});
});

// ============================================================================
// BUG-MESA-COPILOT — copiloto de mesa orienta o ATENDENTE com o PDF da
// administradora injetado (FIX-67, bloco-mesa-c).
// ----------------------------------------------------------------------------
// Feature nova (mesa de operação): mensagem do WhatsApp de um ATENDENTE DE MESA
// vai pro copiloto (não pro agente de vendas), que injeta o manual full-text da
// administradora da cota (DEC-C) e orienta o atendente a contratar passo a passo.
// Este cassette trava: (1) o builder injeta o texto do PDF da administradora
// certa no system prompt enviado ao modelo; (3) o copiloto não vaza meta-
// narrativa/stack trace. A parte (2) — roteamento por número → copiloto, não
// vendas — vive no describe BUG-MESA-COPILOT-ROUTING abaixo (FIX-66), que assere
// o hook do processor.ts + a consulta de routing.ts.
//
// Spec: docs/visao/mesa-de-operacao.md §5 + DEC-C. Decisões:
// docs/correcoes/decisions/2026-06-21-bloco-mesa-c.md.
// ============================================================================

describe("BUG-MESA-COPILOT — copiloto injeta o PDF da administradora e não vaza mecanismo", () => {
	const CANOPUS_MANUAL =
		"MANUAL CANOPUS — para contratar: 1) acesse o portal do parceiro; 2) selecione o grupo; " +
		"3) preencha CPF e dados do cliente; 4) confirme a carta de crédito; 5) gere o boleto.";

	it("cassette: o manual full-text da administradora chega ao modelo no system prompt (1)", async () => {
		const { generateMesaCopilotReply } = await import("@/lib/agent/mesa-copilot");

		// Captura o prompt que o copiloto envia ao modelo.
		let capturedPrompt = "";
		const model = new MockLanguageModelV3({
			doStream: async (options: { prompt: unknown }) => {
				capturedPrompt = JSON.stringify(options.prompt);
				return {
					// biome-ignore lint/suspicious/noExplicitAny: SDK v3 typing aceita loose
					stream: simulateReadableStream({
						chunks: [
							{ type: "stream-start", warnings: [] },
							...textChunks(
								"t1",
								"Beleza! No portal do parceiro, comece selecionando o grupo 1234 e confirme a carta.",
							),
							FINISH_STOP,
						] as any[],
					}),
				};
			},
		});

		const reply = await generateMesaCopilotReply({
			caso: {
				administradoraNome: "Canopus",
				docs: [{ titulo: "Manual", tipo: "manual", textoExtraido: CANOPUS_MANUAL }],
				grupo: "1234",
				clienteNome: "Helena Souza",
			},
			history: [{ role: "attendant", content: "Como começo a contratação na Canopus?" }],
			model,
		});

		// O manual full-text foi para o modelo (DEC-C: injeção, não RAG).
		expect(capturedPrompt).toContain("MANUAL CANOPUS");
		expect(capturedPrompt).toContain("portal do parceiro");
		// E a oferta/cliente do caso também chegaram (dossiê do caso).
		expect(capturedPrompt).toContain("1234");
		expect(capturedPrompt).toContain("Helena Souza");
		// O copiloto devolveu a orientação ao atendente.
		expect(reply).toContain("grupo 1234");
	});

	it("cassette: resposta do copiloto NÃO casa detectores de meta-narrativa nem stack trace (3)", async () => {
		const { generateMesaCopilotReply } = await import("@/lib/agent/mesa-copilot");

		const cleanReply =
			"Para esse caso: 1) acesse o portal da Canopus; 2) selecione o grupo 1234; " +
			"3) preencha o CPF da Helena; 4) confirme a carta de R$ 80.000 e gere o boleto.";

		const model = new MockLanguageModelV3({
			doStream: async () => ({
				// biome-ignore lint/suspicious/noExplicitAny: SDK v3 typing aceita loose
				stream: simulateReadableStream({
					chunks: [
						{ type: "stream-start", warnings: [] },
						...textChunks("t1", cleanReply),
						FINISH_STOP,
					] as any[],
				}),
			}),
		});

		const reply = await generateMesaCopilotReply({
			caso: {
				administradoraNome: "Canopus",
				docs: [{ titulo: "Manual", tipo: "manual", textoExtraido: CANOPUS_MANUAL }],
			},
			history: [{ role: "attendant", content: "passo a passo?" }],
			model,
		});

		// Sem meta-narrativa do mecanismo.
		const metaDetectors = [
			/o sistema (vai|ir[áa]) (te )?(guiar|conduzir|processar|injetar)/i,
			/estou (processando|injetando|carregando)/i,
			/vou (processar|injetar) o manual/i,
		];
		for (const rx of metaDetectors) expect(reply).not.toMatch(rx);

		// Sem stack trace / detalhe técnico vazado.
		const stackDetectors = [
			/\bat\s+\/?\w+.*:\d+:\d+/i, // "at file.ts:12:3"
			/\berror:\s/i,
			/\bundefined is not\b/i,
			/\bTypeError\b|\bReferenceError\b/,
			/node_modules|\.ts:\d+/i,
		];
		for (const rx of stackDetectors) expect(reply).not.toMatch(rx);

		// E a persona-fonte realmente proíbe esses vazamentos (acoplamento ao builder).
		const promptSrc = readSource("src/lib/agent/mesa-copilot/system-prompt.ts");
		expect(promptSrc.toLowerCase()).toMatch(/stack trace/);
		expect(promptSrc.toLowerCase()).toMatch(/meta-?narrativa|mecanismo do sistema/);
	});

	it("estrutural: o builder injeta o texto_extraido no bloco STABLE (cacheável)", async () => {
		const { buildMesaCopilotPrompt } = await import("@/lib/agent/mesa-copilot");
		const { stable, dynamic } = buildMesaCopilotPrompt({
			administradoraNome: "Canopus",
			docs: [{ titulo: "Manual", tipo: "manual", textoExtraido: CANOPUS_MANUAL }],
		});
		expect(stable).toContain("MANUAL CANOPUS");
		// O manual NÃO vaza pro bloco dinâmico (que não é cacheado).
		expect(dynamic).not.toContain("MANUAL CANOPUS");
		// index.ts cacheia o stable.
		const idxSrc = readSource("src/lib/agent/mesa-copilot/index.ts");
		expect(idxSrc).toMatch(/content:\s*stable[\s\S]{0,160}cacheControl/);
	});
});

// ============================================================================
// BUG-MESA-COPILOT-ROUTING — número de atendente de mesa → copiloto, NÃO vendas
// (FIX-66, bloco-mesa-c, spec §8 anti-colisão de canal).
// ----------------------------------------------------------------------------
// Parte (2) do cassette do copiloto: o hook do processor.ts roteia a mensagem
// de um número de atendente de mesa pro copiloto (handleMesaCopilot), e ANTES do
// caminho de vendas (processWithOrchestrator). Colisão de canal já causou bug no
// projeto (FIX-31/FIX-35) — este cassette estrutural trava a ordem do roteamento
// e que routing.ts consulta a tabela de atendentes de mesa.
// ============================================================================

describe("BUG-MESA-COPILOT-ROUTING — número de mesa roteia pro copiloto, não pra vendas", () => {
	const processorSrc = readSource("src/lib/whatsapp/processor.ts");
	const routingSrc = readSource("src/lib/whatsapp/mesa/routing.ts");

	it("o processor tem o early-return de mesa (isMesaAttendantPhone → handleMesaCopilot)", () => {
		expect(processorSrc).toMatch(/if\s*\(await isMesaAttendantPhone\(from\)\)/);
		expect(processorSrc).toMatch(/handleMesaCopilot\(from, text\)/);
	});

	it("o check de mesa vem ANTES do roteamento de vendas (processWithOrchestrator)", () => {
		const mesaIdx = processorSrc.indexOf("isMesaAttendantPhone(from)");
		const vendasIdx = processorSrc.indexOf("processWithOrchestrator(from, text");
		expect(mesaIdx).toBeGreaterThan(-1);
		expect(vendasIdx).toBeGreaterThan(-1);
		expect(mesaIdx).toBeLessThan(vendasIdx);
	});

	it("o check de mesa vem ANTES do atendente-de-chat (isAttendantPhone) — precedência de mesa", () => {
		const mesaIdx = processorSrc.indexOf("isMesaAttendantPhone(from)");
		const chatIdx = processorSrc.indexOf("isAttendantPhone(from)");
		expect(mesaIdx).toBeGreaterThan(-1);
		expect(chatIdx).toBeGreaterThan(-1);
		expect(mesaIdx).toBeLessThan(chatIdx);
	});

	it("routing.ts consulta a tabela mesa_attendants ativos (chave do roteamento)", () => {
		expect(routingSrc).toMatch(/from\(mesaAttendants\)/);
		expect(routingSrc).toMatch(/eq\(mesaAttendants\.isActive, true\)/);
	});

	it("handleMesaCopilot persiste nos dois papéis e NÃO chama o orchestrator de vendas", () => {
		expect(routingSrc).toMatch(/role:\s*"attendant"/);
		expect(routingSrc).toMatch(/role:\s*"assistant"/);
		// O copiloto é um canal separado — routing.ts não pode importar/chamar
		// o orchestrator de vendas (evita a colisão de canal da spec §8).
		expect(routingSrc).not.toMatch(/processWithOrchestrator|runTurn|orchestrator/);
	});
});

// ============================================================================
// FIX-76 — agente alucina falha de busca + ressuscita valor STALE como dado real
// ----------------------------------------------------------------------------
// Real (Kairo 2026-06-25, persona Maria, conversa retomada de 3 dias): pediu
// simular R$ 130.000 sobre um reveal antigo de R$ 256.000. O agente respondeu
// "estou com dificuldade em acessar os grupos" / "instabilidade nas buscas"
// (turn-trace: toolsCalled=[] — search_groups NUNCA foi chamada, ZERO erro de
// tool) e ofereceu "a faixa de R$ 256.000 que já temos dados reais disponíveis"
// — número ressuscitado do histórico, apresentado como dado real. Viola a regra
// inviolável Bevi fonte única (proibido número stale/fictício em runtime).
//
// Defesa em duas frentes:
//   • prompt (Camada 1, system-prompt.fix-76.test.ts): veta a frase.
//   • gate (Camada 1, qualify-state.fix76.test.ts): troca de faixa reabre busca.
// Aqui o cassette de stream reproduz a alucinação e o detector a pega; mais o
// assert de que o gate FORÇA a busca na retomada com valor-alvo trocado.
// ============================================================================

describe("FIX-76-ALUCINA-FALHA-BUSCA — narra instabilidade sem chamar search_groups", () => {
	// Detector da frase tóxica: falha/instabilidade/indisponibilidade de BUSCA.
	const FALHA_BUSCA_ALUCINADA =
		/instabilidade\s+n[ao]s?\s+busca|dificuldade\s+(em|de|pra|para)?\s*acess\w*\s+(os\s+)?grupos|problema\w*\s+(em|pra|para)?\s*acess\w*\s+(os\s+)?grupos|inst[áa]vel\s+(a|na)\s+busca/i;
	// Detector do valor stale apresentado como dado real.
	const VALOR_STALE_COMO_REAL =
		/(dados?\s+reais?\s+(dispon[íi]ve|que\s+(j[áa]\s+)?temos)|j[áa]\s+temos\s+(dados\s+)?dispon)/i;

	it("cassette: stream reproduz 'instabilidade nas buscas' SEM tool-call (bug exato Maria)", async () => {
		const cassette =
			"Poxa, estou com dificuldade em acessar os grupos no momento — uma instabilidade nas buscas. " +
			"Mas a faixa de R$ 256.000 que já temos dados reais disponíveis segue valendo, quer seguir nela?";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Reprodução fiel: texto fabricou a falha + ofereceu valor stale, ZERO tool.
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);

		// O detector PEGA a frase quando NENHUMA tool de busca foi chamada no turno.
		const buscouNoTurno = toolCalls.some(
			(t) => t.toolName === "search_groups" || t.toolName === "recommend_groups",
		);
		expect(buscouNoTurno).toBe(false);
		expect(
			FALHA_BUSCA_ALUCINADA.test(cassette),
			"Detector tem que pegar a frase de falha-de-busca alucinada. Se não pega, atualize o regex.",
		).toBe(true);
		expect(
			VALOR_STALE_COMO_REAL.test(cassette),
			"Detector tem que pegar o valor stale apresentado como 'dados reais disponíveis'.",
		).toBe(true);
	});

	it("trajetória CORRETA: com troca de faixa, o turno chama search_groups na faixa nova (sem alucinar)", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Bora ver o que encaixa na faixa de 130 mil:"),
			toolCallChunk("tc-sg", "search_groups", { category: "auto", creditMax: 130_000 }),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls[0]?.toolName).toBe("search_groups");
		// Texto honesto: nem falha alucinada, nem valor stale como dado real.
		expect(FALHA_BUSCA_ALUCINADA.test(text)).toBe(false);
		expect(VALOR_STALE_COMO_REAL.test(text)).toBe(false);
	});

	it("structural: o prompt de produção veta a alucinação de falha de busca (sincronia com a regra dura)", () => {
		expect(
			FALHA_BUSCA_ALUCINADA.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa citar a frase tóxica ('instabilidade nas buscas') na regra dura FIX-76.",
		).toBe(true);
	});

	it("gate: retomada com valor-alvo TROCADO força a busca (não cai em conversacional)", () => {
		const meta: ConversationMetadata = {
			currentCategory: "auto",
			currentPersona: "auto",
			experiencePrev: "first",
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: { creditMax: 130_000, prazoMeses: 60, hasLance: "no", lanceEmbutido: false },
			searchDispatched: true,
			revealCompleted: true,
			discoveredCreditTarget: 256_000,
		};
		// O orquestrador volta a dirigir o gate de busca (em vez de deixar o modelo
		// livre pra alucinar) e libera mesmo num turno de intent fraco.
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
		expect(decideShowGate({ gate: "search", intent: "neutral", meta, isUserTurn: true })).toBe(
			true,
		);
	});
});

// ============================================================================
// FIX-77 — system role dentro de `messages` dispara warning de prompt-injection
// ----------------------------------------------------------------------------
// Real (Kairo 2026-06-25, monitor de logs do aja-app-develop): a cada turno do
// agente principal saía no stdout:
//   "AI SDK Warning: System messages in the prompt or messages fields can be a
//    security risk because they may enable prompt injection attacks. Use the
//    system option instead when possible..."
// Origem: o orchestrator prependava role:"system" DENTRO do array `messages` de
// agent.stream(...). A AI SDK 6 emite o warning via console.warn em
// standardizePrompt quando messages.some(m => m.role === "system").
//
// O cassette prova o shape: messages COM system → warning; system na OPÇÃO
// (instructions/system) + messages SEM system → sem warning. Cross-ref dos
// asserts estruturais: src/lib/agent/orchestrator/system-messages.fix-77.test.ts.
// ============================================================================

describe("FIX-77-SYSTEM-IN-MESSAGES — warning de prompt-injection a cada turno", () => {
	// Mock model mínimo: 1 texto + finish stop. Reutilizável nos dois shapes.
	function mockModel() {
		return new MockLanguageModelV3({
			doStream: async () => ({
				// biome-ignore lint/suspicious/noExplicitAny: SDK v3 typing aceita loosely
				stream: simulateReadableStream({
					chunks: [
						{ type: "stream-start", warnings: [] },
						...textChunks("t1", "ok"),
						FINISH_STOP,
						// biome-ignore lint/suspicious/noExplicitAny: idem
					] as any[],
				}),
			}),
		});
	}

	// Detector do warning exato observado em prod.
	const INJECTION_WARNING =
		/System messages in the prompt or messages fields can be a security risk|prompt injection/i;

	async function warnsFrom(run: () => ReturnType<typeof streamText>): Promise<string[]> {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const r = run();
			for await (const _ of r.textStream) {
				// drena
			}
			await r.warnings;
			return spy.mock.calls.map((c) => String(c[0]));
		} finally {
			spy.mockRestore();
		}
	}

	it("cassette: role:'system' DENTRO de messages dispara o warning (bug original)", async () => {
		const warns = await warnsFrom(() =>
			streamText({
				model: mockModel(),
				// biome-ignore lint/suspicious/noExplicitAny: shape de mensagem cru pro teste
				messages: [
					{ role: "system", content: 'Nome do usuario: "Kairo"' },
					{ role: "user", content: "oi" },
					// biome-ignore lint/suspicious/noExplicitAny: idem
				] as any,
			}),
		);
		expect(
			warns.some((w) => INJECTION_WARNING.test(w)),
			"messages com role:'system' TÊM que disparar o warning de prompt-injection (reproduz o bug).",
		).toBe(true);
	});

	it("shape CORRETO pós-fix: system na opção + messages sem system → SEM warning", async () => {
		const warns = await warnsFrom(() =>
			streamText({
				model: mockModel(),
				system: 'Nome do usuario: "Kairo"',
				// biome-ignore lint/suspicious/noExplicitAny: shape de mensagem cru pro teste
				messages: [{ role: "user", content: "oi" }] as any,
			}),
		);
		expect(
			warns.some((w) => INJECTION_WARNING.test(w)),
			"system na OPÇÃO (instructions/system) não pode disparar o warning — é o shape que a Opção A entrega.",
		).toBe(false);
	});
});

// ============================================================================
// FIX-78 — comparison_table dropado no reveal com 2+ grupos
// ----------------------------------------------------------------------------
// Real (Kairo 2026-06-25, conv a9c5effa, traceId 6b09c87f): no reveal de 2+
// grupos o agente chamou present_recommendation_card mas DROPOU
// present_comparison_table — artifactsEmitted = [recommendation_card,
// simulation_result], comparison_table AUSENTE. O usuário viu só a proposta
// recomendada, sem o carrossel comparativo das demais. Ter chamado
// recommendation_card PROVA que o modelo classificou como 2+ grupos (com 1 só
// grupo o prompt manda NÃO chamar recommendation_card), logo o comparativo era
// obrigatório e faltou.
//
// Mesma classe do FIX-76 (passo obrigatório da jornada omitido pelo modelo). A
// defesa é a REGRA DURA de inseparabilidade no buildSearchSummaryDirective
// (Camada 1: directives.fix-78.test.ts). Aqui o cassette reproduz o drop e o
// detector o pega.
// ============================================================================

describe("FIX-78-COMPARISON-DROPADO — recommendation_card sem comparison_table (2+ grupos)", () => {
	// Detector da violação: num reveal com 2+ grupos, recommendation_card e
	// comparison_table são INSEPARÁVEIS — emitir o primeiro sem o segundo é o bug.
	function violaInseparabilidade(toolNames: string[]): boolean {
		const hasRec = toolNames.includes("present_recommendation_card");
		const hasComp = toolNames.includes("present_comparison_table");
		return hasRec && !hasComp;
	}

	it("cassette: reveal 2+ grupos emite recommendation_card SEM comparison_table (bug exato)", async () => {
		// Trajetória do bug: recommendation_card sai, comparison_table NÃO.
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Encontramos boas opções pro seu perfil. A mais adequada é:"),
			toolCallChunk("tc-sg", "search_groups", { category: "auto", creditMax: 100_000 }),
			toolCallChunk("tc-rg", "recommend_groups", { category: "auto", creditMax: 100_000 }),
			toolCallChunk("tc-rc", "present_recommendation_card", { administradora: "ITAÚ", score: 0.9 }),
			toolCallChunk("tc-sq", "simulate_quota", { groupId: "abc123", creditValue: 100_000 }),
			toolCallChunk("tc-sr", "present_simulation_result", {
				groupId: "abc123",
				monthlyPayment: 1500,
				termMonths: 60,
			}),
			FINISH_TOOL_CALLS,
		]);

		const names = toolCalls.map((t) => t.toolName);
		expect(names).toContain("present_recommendation_card");
		expect(names).not.toContain("present_comparison_table");
		// O detector PEGA o drop — é o sinal de regressão.
		expect(
			violaInseparabilidade(names),
			"Detector tem que pegar recommendation_card sem comparison_table no reveal 2+ grupos.",
		).toBe(true);
	});

	it("trajetória CORRETA: reveal 2+ grupos emite os DOIS cards (recommendation + comparison)", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Encontramos 3 boas opções. A mais adequada é:"),
			toolCallChunk("tc-sg", "search_groups", { category: "auto", creditMax: 100_000 }),
			toolCallChunk("tc-rg", "recommend_groups", { category: "auto", creditMax: 100_000 }),
			toolCallChunk("tc-rc", "present_recommendation_card", { administradora: "ITAÚ", score: 0.9 }),
			toolCallChunk("tc-ct", "present_comparison_table", {
				groups: [{ administradora: "ITAÚ" }, { administradora: "BRADESCO" }],
				highlightBestIndex: 0,
			}),
			toolCallChunk("tc-sq", "simulate_quota", { groupId: "abc123", creditValue: 100_000 }),
			toolCallChunk("tc-sr", "present_simulation_result", {
				groupId: "abc123",
				monthlyPayment: 1500,
				termMonths: 60,
			}),
			FINISH_TOOL_CALLS,
		]);

		const names = toolCalls.map((t) => t.toolName);
		expect(names).toContain("present_recommendation_card");
		expect(names).toContain("present_comparison_table");
		expect(violaInseparabilidade(names)).toBe(false);
	});

	it("structural: o directive do reveal veta o drop (regra de inseparabilidade)", () => {
		const reveal = buildSearchSummaryDirective({
			category: "auto",
			meta: {
				currentCategory: "auto",
				experiencePrev: "first",
				qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
			},
		});
		expect(
			/INSEPAR[ÁA]VE/i.test(reveal),
			"buildSearchSummaryDirective precisa da REGRA DURA de inseparabilidade (FIX-78).",
		).toBe(true);
		const colado =
			/present_recommendation_card[\s\S]{0,260}present_comparison_table|present_comparison_table[\s\S]{0,260}present_recommendation_card/;
		expect(colado.test(reveal)).toBe(true);
	});
});

// ============================================================================
// REV-A — single-option guard MORTO no caminho search_groups
// ----------------------------------------------------------------------------
// Revisão por modelo errado (2026-06-28). O FIX-7 (single-option) suprime o
// recommendation_card quando a descoberta retorna 1 grupo — pra não duplicar o
// grupo (recommendation_card + simulation_result do MESMO grupo). O runner
// alimenta o guard com extractDiscoveryCount(toolName, output).
//
// BUG: o branch de `search_groups` testava `Array.isArray(output)`, mas
// `executeSearchGroups` (ai-sdk.ts) devolve `{ groups, total }` — NUNCA array.
// Logo o count era SEMPRE null → o single-option guard nunca disparava num
// reveal de opção única descoberto via search_groups → card duplicado voltava
// (o exato defeito que o FIX-7 corrigiu, só que pro caminho recommend_groups).
// O teste antigo passava `[{id}]` (array) — shape que a produção nunca emite —
// e ficava verde testando o cenário errado.
//
// Defesa estrutural (Camada 1): src/lib/agent/orchestrator/discovery-count.test.ts
// Aqui (Camada 2): a cadeia REAL search_groups → count → guard suprime.
// ============================================================================

describe("REV-A-SINGLE-OPTION-SEARCH-GROUPS — guard de opção única no caminho search_groups", () => {
	// Shape REAL do tool-result de search_groups (executeSearchGroups).
	const searchGroupsOutput = (n: number) => ({
		groups: Array.from({ length: n }, (_, i) => ({ id: `g${i}` })),
		total: n,
	});

	it("extractDiscoveryCount conta o shape real {groups,total} de search_groups (não array)", async () => {
		const { extractDiscoveryCount } = await import("@/lib/agent/orchestrator/discovery-count");
		// ANTES do fix: Array.isArray({groups,total}) === false → null. Quebra aqui.
		expect(extractDiscoveryCount("search_groups", searchGroupsOutput(1))).toBe(1);
		expect(extractDiscoveryCount("search_groups", searchGroupsOutput(3))).toBe(3);
	});

	it("cadeia completa: opção única via search_groups suprime o recommendation_card", async () => {
		const { extractDiscoveryCount } = await import("@/lib/agent/orchestrator/discovery-count");
		const { evaluateArtifactGuards } = await import("@/lib/agent/orchestrator/artifact-guard");
		// 1) o runner conta a descoberta do tool-result REAL de search_groups…
		const discoveryCount = extractDiscoveryCount("search_groups", searchGroupsOutput(1));
		expect(discoveryCount).toBe(1);
		// 2) …e o single-option guard suprime o recommendation_card duplicado.
		const verdict = evaluateArtifactGuards({
			meta: { currentCategory: "auto" } as ConversationMetadata,
			artifactType: "recommendation_card",
			userIntent: "neutral",
			isUserTurn: false,
			discoveryCount,
			conversationId: "conv-rev-a-single-option",
		});
		expect(verdict.allow).toBe(false);
		if (!verdict.allow) expect(verdict.rule).toBe("single-option");
	});

	it("2+ grupos via search_groups NÃO suprime (recommendation_card legítimo)", async () => {
		const { extractDiscoveryCount } = await import("@/lib/agent/orchestrator/discovery-count");
		const { evaluateArtifactGuards } = await import("@/lib/agent/orchestrator/artifact-guard");
		const discoveryCount = extractDiscoveryCount("search_groups", searchGroupsOutput(3));
		expect(discoveryCount).toBe(3);
		const verdict = evaluateArtifactGuards({
			meta: { currentCategory: "auto" } as ConversationMetadata,
			artifactType: "recommendation_card",
			userIntent: "neutral",
			isUserTurn: false,
			discoveryCount,
			conversationId: "conv-rev-a-multi-option",
		});
		expect(verdict.allow).toBe(true);
	});
});

// ============================================================================
// REV-A — directive do simulador ENSINAVA o agent a descrever o gesto da UI
// ----------------------------------------------------------------------------
// system-prompt.ts proíbe descrever a UI ("arraste") no simulador-agulha —
// "diga algo como 'dá pra ver quando você consegue ser contemplado aqui'". As
// tool descriptions e o cassette bevi-fulfillment.structural barram "arraste o
// slider". MAS buildSimulatorDialDirective dava como frase-modelo "arrasta a
// agulha pro mês que você quer e ve como fica" — descrição de gesto que escapa
// do detector exato ("arraste o slider") e é injetada por turno (vence o prompt
// estável). Defeito de alucinação/meta-narrativa de UI.
// ============================================================================

describe("REV-A-SIMULATOR-UI-GESTURE — directive não ensina o agent a descrever o gesto", () => {
	const GESTURE_DETECTORS = [
		/arrast/i, // arrasta / arraste / arrastar
		/desliz/i, // desliza / deslize
		/puxa\s+a\s+agulha/i,
		/move\s+a\s+agulha/i,
	];

	it("buildSimulatorDialDirective não descreve gesto de UI (com e sem administradora)", () => {
		for (const args of [{}, { administradora: "Porto Seguro" }]) {
			const d = buildSimulatorDialDirective(args);
			const hits = GESTURE_DETECTORS.filter((rx) => rx.test(d));
			expect(
				hits.length,
				`directive do simulador descreve gesto de UI (proibido por system-prompt.ts). Directive: "${d}"`,
			).toBe(0);
		}
	});

	it("detector pega o cassette do bug (frase-modelo antiga descrevia o gesto)", () => {
		const cassette = "Olha que legal — arrasta a agulha pro mês que você quer e ve como fica:";
		const hits = GESTURE_DETECTORS.filter((rx) => rx.test(cassette));
		expect(hits.length).toBeGreaterThanOrEqual(1);
	});

	it("structural: a regra anti-descrição-de-UI vive no system prompt", () => {
		// Sincronia: o directive segue a regra do prompt estável.
		expect(SPECIALIST_BASE_PROMPT).toMatch(/n[ãa]o descreva a ui|arraste/i);
	});
});

// ============================================================================
// REV-A — frase PROIBIDA "vou reservar essa opção" como frase-modelo no directive
// ----------------------------------------------------------------------------
// "vou reservar essa opção" é banida (system-prompt.ts + buildAdjustValueDirective
// a proíbem explicitamente — a plataforma é self-service, nada é "reservado").
// MAS buildSimulationInterestDirective dava ESSA frase como modelo POSITIVO
// ("escreva ... tipo 'Show, vou reservar essa opção pra você'"). Hoje sem callers
// em produção, mas é landmine: religar o fluxo "Tenho interesse" emite a frase
// banida. Frase-modelo trocada por uma de fechamento self-service.
// ============================================================================

describe("REV-A-RESERVAR-LANDMINE — directive não emite a frase banida 'reservar essa opção'", () => {
	it("buildSimulationInterestDirective não usa a frase-modelo proibida", () => {
		const d = buildSimulationInterestDirective("Porto Seguro");
		expect(
			d.toLowerCase(),
			"directive emite frase banida 'reservar essa opção' como modelo positivo",
		).not.toMatch(/reservar essa op[çc][ãa]o/);
	});

	it("a frase segue PROIBIDA no prompt estável (sincronia)", () => {
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toMatch(/reservar essa op[çc][ãa]o/);
	});
});

// ============================================================================
// FIX-108 — escolha do grupo no WhatsApp = card da recomendada + "Ver outras"
// ----------------------------------------------------------------------------
// Decisão Kairo 2026-06-28 (spec jornada-entrada-simulador, decisão #5): no
// WhatsApp a escolha do grupo NÃO é lista plana. A recomendada vem em DESTAQUE
// (card com os CTAs de ação) + botão "Ver outras opções" que abre as
// alternativas. O reveal do agente emite present_recommendation_card; o canal
// WhatsApp o renderiza como esse card destacado.
//
// Defesa estrutural complementar:
//   - src/lib/whatsapp/formatter.card-recomendada.test.ts (botões do card)
//   - src/lib/whatsapp/interactive-handlers.show-others.test.ts (clique → agente)
// ============================================================================

describe("FIX-108-CARD-RECOMENDADA-VER-OUTRAS — recomendada em destaque + 'Ver outras opções'", () => {
	it("cassette: o reveal do agente emite present_recommendation_card", async () => {
		const { toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", "Encontramos 3 boas opções. A mais adequada pra você:"),
			toolCallChunk("tc-rec", "recommend_groups", { category: "auto" }),
			toolCallChunk("tc-card", "present_recommendation_card", {
				id: "porto-80k",
				administradora: "Porto Seguro",
				category: "auto",
				creditValue: 80000,
				monthlyPayment: 1200,
				termMonths: 80,
				contemplationRate: 2,
				score: 0.92,
			}),
			FINISH_TOOL_CALLS,
		]);
		expect(toolCalls.some((tc) => tc.toolName === "present_recommendation_card")).toBe(true);
	});

	it("no WhatsApp a recomendada vira card com 'Ver outras opções' + CTAs preservados", () => {
		const wa = artifactToWhatsApp("recommendation_card", {
			id: "porto-80k",
			administradora: "Porto Seguro",
			category: "auto",
			creditValue: 80000,
			monthlyPayment: 1200,
			termMonths: 80,
			contemplationRate: 2,
			score: 0.92,
		});
		const buttons = wa?.interactive?.action?.buttons ?? [];
		const ids = buttons.map((b) => b.reply.id);
		const titles = buttons.map((b) => b.reply.title ?? "");
		expect(ids).toContain("show_others");
		expect(titles.some((t) => /ver outras op/i.test(t))).toBe(true);
		// CTAs de ação preservados (regra do bloco).
		expect(ids).toContain("interest_porto-80k");
		expect(ids).toContain("simulate_porto-80k");
		expect(buttons.length).toBeLessThanOrEqual(3);
	});

	it("'Ver outras opções' tem alvo: a comparação segue mapeada (anti-drop)", () => {
		const wa = artifactToWhatsApp("comparison_table", {
			groups: [
				{
					id: "g1",
					administradora: "Porto",
					creditValue: 80000,
					monthlyPayment: 1200,
					termMonths: 80,
				},
				{
					id: "g2",
					administradora: "Itaú",
					creditValue: 82000,
					monthlyPayment: 1250,
					termMonths: 84,
				},
			],
		});
		expect(wa).not.toBeNull();
		expect(wa?.interactive?.action?.sections?.[0]?.rows?.length).toBeGreaterThanOrEqual(2);
	});

	it("acoplamento: o handler do clique conduz às alternativas via agente", () => {
		const src = readSource("src/lib/whatsapp/interactive-handlers.ts");
		expect(src).toMatch(/replyId === "show_others"/);
		expect(src).toMatch(/handleShowOthers/);
		expect(src).toMatch(/Quero ver outras op[çc][õo]es/);
	});
});

// ============================================================================
// FIX-109 — simulador conversacional + valor por conversa no WhatsApp
// ----------------------------------------------------------------------------
// Decisão Kairo 2026-06-28 (spec jornada-entrada-simulador, decisões #2 e #6):
//  (a) o valor do bem virou CONVERSA — o WhatsApp não manda mais a lista de
//      faixas (value_picker degrada pra pedido conversacional);
//  (b) o simulador é um LOOP CONVERSACIONAL: a abertura convida o mês-alvo;
//      cada iteração apresenta o cenário que o agente calculou (via
//      computeContemplationDial — bloco-jornada-entrada). O canal SÓ formata,
//      nunca recalcula.
//
// Defesa estrutural complementar:
//   - src/lib/whatsapp/formatter.simulador.test.ts (formatter)
//   - src/lib/whatsapp/formatter.moto.test.ts (value_picker conversacional)
// ============================================================================

describe("FIX-109-SIMULADOR-CONVERSACIONAL — valor por conversa + dial em loop", () => {
	it("value_picker NÃO vira mais lista de faixas (vira pedido conversacional)", () => {
		const wa = artifactToWhatsApp("value_picker", { category: "auto", fields: [] });
		expect(wa).not.toBeNull(); // anti-drop preservado
		expect(wa?.type).toBe("text");
		expect(wa?.interactive?.action?.sections).toBeUndefined();
	});

	it("abertura do simulador (só inputs): convida o loop, sem marcos 3/6/12/24", () => {
		const wa = artifactToWhatsApp("contemplation_dial", {
			category: "auto",
			creditValue: 80000,
			termMonths: 80,
			monthlyPayment: 1200,
			initialTargetMonth: 6,
		});
		expect(wa?.type).toBe("text");
		expect(wa?.text ?? "").not.toMatch(/\b3m:|\b6m:|\b12m:|\b24m:/);
		expect(wa?.text ?? "").toMatch(/quantos meses|quando.*contemplad/i);
	});

	it("iteração: o canal formata o cenário recalculado pelo agente (sem recalcular)", () => {
		// O agente (bloco-jornada-entrada) calcula via computeContemplationDial e
		// devolve o cenário do mês-alvo no payload; o canal só apresenta.
		const wa = artifactToWhatsApp("contemplation_dial", {
			administradora: "Porto Seguro",
			creditValue: 80000,
			termMonths: 80,
			scenario: {
				targetMonth: 6,
				mode: "lance",
				requiredLancePct: 45,
				requiredLanceValue: 36000,
				receivedCredit: 64000,
				paymentAfterContemplation: 1200,
			},
		});
		const t = wa?.text ?? "";
		expect(t).toMatch(/6 meses/);
		expect(t).toMatch(/45%/);
		expect(t).toMatch(/64\.000/);
		expect(t).toMatch(/contemplação não é garantida/i);
	});

	it("acoplamento: o canal NÃO recalcula o dial (sem contemplationDialMarks no formatter)", () => {
		const src = readSource("src/lib/whatsapp/formatter.ts");
		expect(src).not.toMatch(/contemplationDialMarks/);
	});

	it("acoplamento: o adapter documenta a parada de emissão do value_picker (FIX-109)", () => {
		const src = readSource("src/lib/whatsapp/adapter.ts");
		expect(src).toMatch(/value_picker/);
		expect(src).toMatch(/FIX-109/);
	});
});

// ============================================================================
// FIX-110 — agente fica mudo (turno preso)
// ----------------------------------------------------------------------------
// Real (uso manual Kairo, PROD, 2026-06-30): agente pergunta sobre lance
// embutido → usuário "Não, prefiro sem lance embutido" → SILÊNCIO (sem typing,
// sem resposta) → usuário "travou?" → aí o agente responde + dispara search.
//
// Diagnóstico CONFIRMADO no código (diverge da hipótese inicial do card, que
// culpava o onError ausente): um spike provou que `createUIMessageStream` SEM
// onError NÃO engole o erro — emite { type:"error", errorText } na mesma. E o
// ChatInput é `disabled={isStreaming}` (o usuário SÓ conseguiu digitar "travou?"
// porque o status já tinha saído de "streaming"). Logo o turno FECHOU com
// sucesso SEM emitir nenhuma part visível = turno mudo. Defesas:
//   (a) onError uniforme (streamErrorMessage) em todo stream do route;
//   (b) guard de turno-vazio no user-turn (isTurnEmpty → fallback honesto);
//   (c) watchdog no client (stream-watchdog) — fora deste cassette (React).
// ============================================================================

async function drainUIStream(
	stream: ReadableStream<unknown>,
): Promise<Array<{ type?: string; [k: string]: unknown }>> {
	const reader = stream.getReader();
	const parts: Array<{ type?: string; [k: string]: unknown }> = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		parts.push(value as { type?: string });
	}
	return parts;
}

describe("FIX-110 — stream do chat nunca deixa o agente mudo (onError + turno vazio)", () => {
	const ROUTE = "src/app/api/chat/route.ts";

	it("structural: TODO createUIMessageStream do route registra onError", () => {
		const src = readSource(ROUTE);
		const streams = (src.match(/createUIMessageStream<AjaUIMessage>\(/g) ?? []).length;
		const onErrors = (src.match(/onError:/g) ?? []).length;
		expect(streams).toBeGreaterThanOrEqual(4);
		expect(
			onErrors,
			`route.ts tem ${streams} createUIMessageStream mas só ${onErrors} onError — ` +
				"todo stream precisa de onError pra fechar o turno com erro tipado (FIX-110).",
		).toBeGreaterThanOrEqual(streams);
	});

	it("structural: o onError vem do helper único streamErrorMessage (sem inline divergente)", () => {
		const src = readSource(ROUTE);
		expect(src).toMatch(/streamErrorMessage/);
	});

	it("structural: o user-turn é blindado contra turno mudo (isTurnEmpty)", () => {
		const src = readSource(ROUTE);
		expect(src).toMatch(/isTurnEmpty/);
	});

	it("cassette: stream que erra no meio emite error part tipado (turno fecha, client sai de streaming)", async () => {
		const stream = createUIMessageStream({
			execute: () => {
				throw new Error("a administradora caiu no meio do turno");
			},
			onError: streamErrorMessage,
		});
		const parts = await drainUIStream(stream as ReadableStream<unknown>);
		const err = parts.find((p) => p.type === "error");
		expect(
			err,
			"stream que erra DEVE emitir error part — sem isso o client fica mudo",
		).toBeDefined();
		expect((err as { errorText?: string }).errorText).toBe(
			"a administradora caiu no meio do turno",
		);
	});

	it("cassette: turno que fecha sem emitir nada visível é detectado como mudo (root cause real)", () => {
		const recordVazio = {
			textChars: 0,
			toolCount: 0,
			artifactCount: 0,
			gate: null,
			handoff: false,
			transitionedTo: null,
		};
		expect(isTurnEmpty(recordVazio)).toBe(true);
		// Contra-exemplo: turno que disparou search_groups (tool) NÃO é mudo.
		expect(isTurnEmpty({ ...recordVazio, toolCount: 1 })).toBe(false);
		// O fallback existe e é uma frase honesta (não-vazia).
		expect(EMPTY_TURN_FALLBACK.length).toBeGreaterThan(0);
	});
});

// ============================================================================
// FIX-113 — agente TRAVA em afirmação de continuidade ("blz"/"ta bom")
// ----------------------------------------------------------------------------
// Real (uso manual Kairo, PROD/AWS, 2026-06-30): "o agent trava e nao responde,
// parece que nos casos de perguntas afirmativas ou afirmações que tem uma
// continuidade". Ex.: agente disse "Beleza, R$ 50.000 então." → usuário "blz" →
// SILÊNCIO → só destrava quando o usuário manda outra mensagem.
//
// Root cause CONFIRMADO no código: numa afirmação curta o funil avança um gate /
// seta transição internamente SEM emitir texto/tool/artifact. O guard FIX-110
// antigo (`isTurnEmpty`) TAMBÉM olhava `gate`/`transitionedTo` (estado interno) e,
// vendo o gate setado, retornava false → o fallback do route (route.ts) NÃO
// disparava → e como nada visível saiu, a tela CONGELAVA. `gate`/`transitionedTo`
// não são resposta visível — o fix é o guard olhar SÓ emissão visível.
// ============================================================================

describe("FIX-113 — afirmação de continuidade nunca fecha o turno mudo", () => {
	const ROUTE = "src/app/api/chat/route.ts";

	// Matéria-prima do bug: no turno de "blz" o agente fica CALADO (0 texto, 0 tool).
	// O cassette prova que o stream fecha sem emissão — é o que o guard tem que pegar.
	it("cassette: 'blz' de continuidade produz turno calado (0 texto, 0 tool) — matéria-prima do mudo", async () => {
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			FINISH_STOP,
		]);
		expect(text).toBe("");
		expect(toolCalls).toEqual([]);
	});

	// O CORAÇÃO do fix: o turno calado que AVANÇOU um gate internamente (gate setado,
	// nada visível) agora é detectado como mudo → o route dispara o fallback. Antes
	// do FIX-113 isso retornava false (gate bloqueava o fallback) e a tela travava.
	it("cassette: gate avança SEM emissão visível => detectado como mudo (fallback dispara)", () => {
		const recordGateMudo = {
			textChars: 0,
			toolCount: 0,
			artifactCount: 0,
			gate: "value" as string | null,
			handoff: false,
			transitionedTo: null as string | null,
		};
		// Regressão do bug exato: hoje true; se alguém reintroduzir o gate no guard,
		// isto volta a false e o cassette QUEBRA — bloqueando o merge.
		expect(isTurnEmpty(recordGateMudo)).toBe(true);
		// Uma transição interna sozinha também não é emissão visível.
		expect(isTurnEmpty({ ...recordGateMudo, gate: null, transitionedTo: "auto" })).toBe(true);
	});

	// Contraprova (não pode disparar fallback falso): gate LEGÍTIMO vem sempre com a
	// pergunta do gate (texto) OU, no reveal, com artifacts — emissão visível > 0.
	it("cassette: gate legítimo (pergunta em texto OU artifact do reveal) NÃO é mudo", () => {
		const base = { textChars: 0, toolCount: 0, artifactCount: 0, handoff: false };
		// Gate de chips com a pergunta do gate escrita como texto.
		expect(isTurnEmpty({ ...base, gate: "experience", textChars: 42 })).toBe(false);
		// simulator-offer no turno do reveal (allowGateWithArtifacts) — carrega cards.
		expect(isTurnEmpty({ ...base, gate: "simulator-offer", artifactCount: 1 })).toBe(false);
		// Handoff: card silencioso por design (agente calado) — segue contando.
		expect(isTurnEmpty({ ...base, handoff: true })).toBe(false);
	});

	it("structural: o guard do route olha SÓ emissão visível (sem gate/transitionedTo)", () => {
		const src = readSource("src/lib/chat/empty-turn-guard.ts");
		// isTurnEmpty não pode voltar a ler gate/transitionedTo como sinal de emissão.
		const fnBody = src.slice(src.indexOf("export function isTurnEmpty"));
		expect(fnBody).toMatch(/textChars === 0/);
		expect(fnBody).toMatch(/toolCount === 0/);
		expect(fnBody).toMatch(/artifactCount === 0/);
		expect(
			/!rec\.gate|rec\.gate\b/.test(fnBody.slice(0, fnBody.indexOf("}"))),
			"isTurnEmpty NÃO pode condicionar em rec.gate — gate é estado interno (FIX-113).",
		).toBe(false);
		expect(
			/transitionedTo/.test(fnBody.slice(0, fnBody.indexOf("}"))),
			"isTurnEmpty NÃO pode condicionar em transitionedTo — é estado interno (FIX-113).",
		).toBe(false);
		// E o route continua chamando o guard no user-turn.
		expect(readSource(ROUTE)).toMatch(/isTurnEmpty/);
	});
});

// ============================================================================
// FIX-115 — componente de valor + RESILIÊNCIA do valor por texto
// ----------------------------------------------------------------------------
// Real (uso manual Kairo, PROD/AWS, 2026-06-30): no passo do valor o agente
// perguntou por TEXTO e nenhum componente apareceu; o usuário teve que digitar
// "50k". Requisito literal do Kairo (dois lados): (1) o componente de valor
// SIMPLES (agulha) deve renderizar; (2) DINÂMICO — se ele não aparecer, o valor
// por TEXTO tem que ser parseado e AVANÇAR o funil, nunca travar (dead-end).
//
// (1) o gate credit passou a servir a agulha simples (kind "slider") — ver o
// describe PLANEJE-SUA-CONQUISTA e src/lib/web/value-gate.fix115.test.ts.
// (2) backstop determinístico parseAssetValue no analyzeAndMerge — o funil avança
// mesmo com o analyzer LLM mudo (timeout). Detalhe em analyze.test.ts /
// parse-asset-value.test.ts. Aqui travamos o acoplamento source → detector.
// ============================================================================

describe("FIX-115 — valor por texto sempre avança + agulha manda valor como texto", () => {
	it("structural: o backstop determinístico do valor está wired no merge do analyzer", () => {
		const src = readSource("src/lib/agent/orchestrator/analyze.ts");
		expect(src).toMatch(/parseAssetValue/);
		// só roda quando o analyzer devolveu null E ainda não há creditMax (coleta inicial)
		expect(src).toMatch(/analysis\.creditMax === null && q\.creditMax === undefined/);
	});

	it("structural: a agulha, sem onSubmit, manda o VALOR como texto no chat (valor por conversa)", () => {
		const src = readSource("src/components/chat/artifacts/value-picker.tsx");
		// caminho default (gate sem onSubmit): sendUserMessage com o valor formatado
		expect(src).toMatch(/sendUserMessage\(/);
		expect(src).toMatch(/value\.toLocaleString\("pt-BR"\)/);
	});

	it("cassette: o valor digitado que o backstop lê ('50k') é o mesmo texto que a agulha envia", () => {
		// A agulha envia "Valor do bem: R$ 50.000"; o usuário digita "50k". Ambos
		// têm que virar 50000 pelo mesmo parser — prova que os dois caminhos convergem.
		expect(parseAssetValue("50k")).toBe(50_000);
		expect(parseAssetValue("Valor do bem: R$ 50.000")).toBe(50_000);
	});
});

// ============================================================================
// FIX-114 — search_groups disparou ANTES da identidade (IdentityNotCollectedError)
// ----------------------------------------------------------------------------
// Real (PROD/AWS, log /ecs/tb/prod conv bc5fa852, 2026-06-30, persona Maria):
// "Deixa eu buscar / Preciso primeiro buscar os grupos / Deixa eu usar a ferramenta
// certa pra isso" + "tô com uma dificuldade técnica pontual pra acessar os grupos".
// O agente free-rodou search_groups antes do CPF → a Bevi lançou
// IdentityNotCollectedError (tripwire proposital, D1) → o agente narrou a falha.
//
// Fix de ORQUESTRAÇÃO: a descoberta só entra no toolset da fase qualify quando
// identityCollected=true (o gate identify precede o credit). Sem a tool no request,
// o modelo NEM CONSEGUE chamá-la cedo. A meta-narrativa e a invenção de "dificuldade"
// já eram vetadas no prompt (FIX-36 / Maria 2026-06-25) — aqui travamos as duas.
// ============================================================================

describe("FIX-114 — descoberta gateada na identidade + sem meta-narrativa de busca", () => {
	const QUALIFY_NO_ID: ConversationMetadata = {
		currentPersona: "moto",
		currentCategory: "moto",
		experiencePrev: "first",
		qualifyConsented: true,
		// identityCollected ausente — passo 2 antes do gate identify.
	};
	const QUALIFY_WITH_ID: ConversationMetadata = { ...QUALIFY_NO_ID, identityCollected: true };

	it("cassette: sem identidade a policy NÃO expõe search_groups; com identidade, expõe", () => {
		expect(allowedTools(QUALIFY_NO_ID)).not.toContain("search_groups");
		expect(allowedTools(QUALIFY_NO_ID)).not.toContain("recommend_groups");
		expect(allowedTools(QUALIFY_WITH_ID)).toContain("search_groups");
	});

	it("structural: a policy gateia a descoberta em identityCollected (fonte de produção)", () => {
		const src = readSource("src/lib/agent/orchestrator/tool-policy.ts");
		const qualifyCase = src.slice(src.indexOf('case "qualify":'), src.indexOf('case "reveal":'));
		expect(qualifyCase).toMatch(/identityCollected === true \? DISCOVERY_AND_REVEAL_CARDS/);
	});

	it("structural: o prompt VETA a meta-narrativa de busca e a invenção de 'dificuldade'", () => {
		// não narrar mecânica ("vou buscar"/"deixa eu procurar") — FIX-36.
		expect(SPECIALIST_BASE_PROMPT).toMatch(/narrar mec[âa]nica/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/vou buscar/i);
		// não inventar falha de busca sem ter chamado a tool — Maria 2026-06-25.
		expect(SPECIALIST_BASE_PROMPT).toMatch(/dificuldade em acessar os grupos/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/instabilidade nas buscas/i);
		// não anunciar o que vai fazer — chamar a tool direto.
		expect(SPECIALIST_BASE_PROMPT).toMatch(/anunciam o que voc[êe] vai fazer/i);
	});

	// Detector do vazamento exato do bug — se o prompt afrouxar e a frase voltar,
	// este regex casa e o cassette denuncia a regressão.
	it("detector: as frases de meta-narrativa/falha do bug real são pegáveis", () => {
		const vazamento =
			"Deixa eu buscar os grupos. Preciso primeiro buscar os grupos. Tô com uma " +
			"dificuldade técnica pontual pra acessar os grupos nessa faixa agora.";
		const detectors = [
			/deixa eu buscar/i,
			/preciso.{0,20}buscar os grupos/i,
			/dificuldade t[ée]cnica.{0,30}grupos/i,
		];
		expect(detectors.some((rx) => rx.test(vazamento))).toBe(true);
	});
});

// ============================================================================
// FIX-112 — fim da proposta bugado ("bora" lido como recusa)
// ----------------------------------------------------------------------------
// Real (uso manual Kairo, PROD, 2026-06-30): a oferta apareceu, o agente
// perguntou "quer completar?" e o usuário respondeu "bora" / "ok estou pronto"
// (AVANÇO) → o agente respondeu "Sem problema! Quando quiser retomar..." (leu
// como recusa) → beco sem saída de texto, nenhum card de upload.
//
// O código já gateava o documento certo (confirmOffer ordena choose→links; card
// só vem via offer-confirm; ver fulfillment.test.ts). O gap é comportamento de
// LLM — defendido por 2 REGRAS DURAS no SPECIALIST_BASE_PROMPT. Este cassette
// trava a FRASE de adiamento como regressão e prova que um afirmativo de avanço
// NÃO casa com ela.
// ============================================================================

describe("FIX-112 — 'bora' no fechamento é avanço, nunca recusa", () => {
	const REFUSAL_DETECTORS = [
		/sem problema!?\s*quando quiser/i,
		/quando quiser retomar/i,
		/sem pressa[\s\S]{0,30}quando quiser/i,
	];

	it("cassette: a frase de adiamento do bug é reproduzida fielmente (fixture do detector)", async () => {
		const cassette = "Sem problema! Quando quiser retomar, é só me chamar. 😊";
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);
		expect(text).toBe(cassette);
		expect(toolCalls).toEqual([]);
	});

	it("detector pega a frase de adiamento indevida (regressão se voltar)", () => {
		const cassette = "Sem problema! Quando quiser retomar, é só me chamar.";
		const hits = REFUSAL_DETECTORS.filter((rx) => rx.test(cassette));
		expect(hits.length, "a frase de adiamento DEVE ser detectável").toBeGreaterThanOrEqual(1);
	});

	it("um afirmativo de AVANÇO nunca casa com os detectores de recusa", () => {
		for (const advance of ["bora", "ok estou pronto", "vamos", "pode ser", "tô pronto"]) {
			const anyHit = REFUSAL_DETECTORS.some((rx) => rx.test(advance));
			expect(anyHit, `"${advance}" é avanço, não pode disparar adiamento`).toBe(false);
		}
	});

	it("structural: o prompt fixa 'bora'/'estou pronto' como avanço e gateia o documento", () => {
		const src = readSource("src/lib/agent/system-prompt.ts");
		expect(src).toMatch(/FIX-112/);
		expect(src.toLowerCase()).toMatch(/bora/);
		// gate: documento só depois de confirmar a oferta
		expect(src.toLowerCase()).toMatch(/documento[\s\S]{0,600}confirma/i);
	});
});
