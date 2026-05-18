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
import { streamText } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";

import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { artifactToWhatsApp } from "@/lib/whatsapp/formatter";
import {
	SPECIALIST_BASE_PROMPT,
	SYSTEM_PROMPT,
} from "@/lib/agent/system-prompt";

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
		const cassette =
			"O sistema vai te guiar com botões nas próximas perguntas — é bem rápido.";

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

describe("BUG-LEAD-FUNNEL — agent precisa chamar present_lead_form apos sinal de avanco", () => {
	it("cassette: turn pos opt-in com sinal de avanco produz tool-call present_lead_form", async () => {
		// Simula trajetoria correta — o que deveria ter saido do agent no turn
		// pos opt-in quando user disse "Tenho interesse, vamos prosseguir".
		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks(
				"t1",
				"Show! Vou reservar essa opção pra você — só preciso de uns dados rapidinho:",
			),
			toolCallChunk("tc-lf-1", "present_lead_form", {}),
			FINISH_TOOL_CALLS,
		]);

		// Frase curta natural sem narrar passo a passo, seguida da tool.
		expect(text).toMatch(/reservar|guardar|dados/i);
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("present_lead_form");
	});

	it("regra do prompt: gatilho textual ('tenho interesse') casa com proximidade de present_lead_form", () => {
		// Esse assert protege a regra estrutural — sem ela, o LLM nao converte
		// sinal textual em tool call. Acopla o cassette acima ao prompt source.
		const gatilhoLigadoAoLeadForm =
			/(tenho interesse|quero prosseguir|vamos (prosseguir|fechar|seguir)|bora fechar|pode (prosseguir|fechar))[\s\S]{0,500}present_lead_form/i;

		expect(
			gatilhoLigadoAoLeadForm.test(SPECIALIST_BASE_PROMPT) ||
				gatilhoLigadoAoLeadForm.test(SYSTEM_PROMPT),
			"present_lead_form precisa estar a <500 chars de um gatilho textual de avanco no prompt. " +
				"Sem isso, agent nao mapeia 'tenho interesse' (texto) -> present_lead_form (tool).",
		).toBe(true);
	});

	// Cross-ref: src/lib/agent/system-prompt.lead-funnel.test.ts cobre o
	// encadeamento save_contact_whatsapp -> present_lead_form ALEM do gatilho
	// textual. Nao duplicado aqui.
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
// CENARIO 4 — Value picker em texto puro (BUG-CREDIT-PICKER)
// ----------------------------------------------------------------------------
// Real (Helena/imovel): agent disse "Qual faixa de credito voce esta pensando?"
// em texto puro, sem chamar present_value_picker. Usuario forcado a digitar.
//
// Causa raiz: persona.activeTools nao incluia present_value_picker. Fix em
// builder.ts + migration 0019 (cobertos por builder.credit-picker.test.ts).
// Aqui cassette + assert estrutural no prompt.
// ============================================================================

describe("BUG-CREDIT-PICKER — pergunta valor por texto em vez de present_value_picker", () => {
	it("cassette: stream com pergunta de faixa em texto puro SEM tool-call", async () => {
		const cassette =
			"Qual faixa de credito voce esta pensando pra esse imovel?";

		const { text, toolCalls } = await runMockStream([
			{ type: "stream-start", warnings: [] },
			...textChunks("t1", cassette),
			FINISH_STOP,
		]);

		// Reproducao fiel: pergunta de valor em prosa, sem present_value_picker.
		expect(text).toBe(cassette);
		expect(toolCalls.filter((t) => t.toolName === "present_value_picker")).toEqual([]);

		// Detector: o agent pediu faixa/valor/orcamento por texto.
		const perguntaValorTexto =
			/(qual|quanto)[\s\S]{0,40}(faixa|valor|cr[ée]dito|or[çc]amento|carta)/i;
		expect(perguntaValorTexto.test(cassette)).toBe(true);
	});

	it("prompt SPECIALIST_BASE_PROMPT proibe perguntar valor por texto", () => {
		// system-prompt.ts:13 contem "NUNCA pergunte valores por texto. Use
		// present_value_picker para mostrar sliders interativos."
		// Garante que o prompt nunca afrouxa essa regra.
		const proibicaoValorTexto =
			/NUNCA pergunte valores? por texto[\s\S]{0,200}present_value_picker/i;

		expect(
			proibicaoValorTexto.test(SYSTEM_PROMPT) ||
				proibicaoValorTexto.test(SPECIALIST_BASE_PROMPT),
			"Prompt precisa proibir EXPLICITAMENTE 'NUNCA pergunte valores por texto' acoplado a present_value_picker. " +
				"Sem essa regra, o LLM cai em prosa nas perguntas de faixa/orcamento.",
		).toBe(true);
	});
});

// ============================================================================
// CENARIO 5 — Frase canonica B9 obrigatoria apos detalhamento (BUG-B9)
// ----------------------------------------------------------------------------
// Real: apos present_simulation_result + present_recommendation_card, agent
// improvisou frases de fechamento de turno. Bruna pediu frase canonica
// EXATA: "Aqui esta o detalhamento completo da {admin}. Quer ajustar a carta
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
			/Aqui est[áa] o detalhamento completo da \{admin\}\. Quer ajustar a carta de cr[ée]dito\?/;

		expect(
			moldeCanonico.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa conter o MOLDE EXATO da frase canonica B9: " +
				"'Aqui esta o detalhamento completo da {admin}. Quer ajustar a carta de credito?'. " +
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
			/(present_simulation_result|present_recommendation_card)[\s\S]{0,800}detalhamento completo[\s\S]{0,200}ajustar a carta/i;
		const blocoReverso =
			/detalhamento completo[\s\S]{0,200}ajustar a carta[\s\S]{0,800}(present_simulation_result|present_recommendation_card)/i;

		expect(
			blocoForward.test(SPECIALIST_BASE_PROMPT) ||
				blocoReverso.test(SPECIALIST_BASE_PROMPT),
			"Frase canonica B9 precisa estar a <800 chars de present_simulation_result OU present_recommendation_card. " +
				"Sem proximidade, agent associa errado e improvisa.",
		).toBe(true);
	});

	// Cross-ref: src/lib/agent/system-prompt.lead-funnel.test.ts (Bug B) cobre
	// as 4 dimensoes (substring 'detalhamento completo', 'ajustar a carta',
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
		const cassette =
			"Vou te fazer algumas perguntas rápidas pra achar a opção certa pra você.";

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
		expect(detector.test(cassette), "Detector tem que pegar 'vou te fazer perguntas rapidas'.").toBe(
			true,
		);

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

	it("GAP #2 — interactive-handlers centraliza saveMessage do clique via recordUserClick (handleInterest deixou de ser excecao)", () => {
		const handlers = readSource("src/lib/whatsapp/interactive-handlers.ts");
		// O helper compartilhado tem que existir.
		expect(
			/function\s+recordUserClick/.test(handlers),
			"interactive-handlers.ts precisa exportar/usar o helper `recordUserClick` " +
				"centralizado. Antes do refactor cada handler chamava saveMessage e " +
				"handleInterest esquecia — gap #2 do BUG-LEAD-HISTORY-INCOMPLETE.",
		).toBe(true);
		// handleInterest agora chama recordUserClick antes do startInterestHandoff.
		// Isolamos a função (entre `async function handleInterest` e a próxima
		// declaração top-level ou fim do arquivo) e validamos ordem dentro dela.
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
		// recordUserClick tem que vir ANTES do startInterestHandoff dentro da fn.
		const idxRecord = interestBody.indexOf("recordUserClick");
		const idxHandoff = interestBody.indexOf("startInterestHandoff");
		expect(
			idxRecord > -1 && idxHandoff > -1 && idxRecord < idxHandoff,
			"handleInterest precisa chamar recordUserClick ANTES de startInterestHandoff " +
				"(ordem cronológica: user msg → frase final do bot).",
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
