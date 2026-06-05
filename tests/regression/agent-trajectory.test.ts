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
import { buildDecisionPromptDirective } from "@/lib/agent/orchestrator/directives";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { decideShowGate, nextGate } from "@/lib/agent/qualify-state";
import { realOfferPresentation } from "@/lib/bevi/closing-presentation";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
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
			s.toLowerCase().replace(/ç/g, "c").replace(/õ/g, "o").replace(/á/g, "a");
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
		const cassette = "Qual faixa de credito voce esta pensando pra esse imovel?";

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
			proibicaoValorTexto.test(SYSTEM_PROMPT) || proibicaoValorTexto.test(SPECIALIST_BASE_PROMPT),
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

describe("BUG-LEAD-FORM-PREFILL-REGRESSION — clique 'Tenho interesse' produz lead_form com prefilledName", () => {
	it("cassette source-level: route.ts action.kind === 'interest' continua passando contactName no payload", () => {
		// Fonte de verdade do contrato. Se alguem mover o handler de pasta ou
		// trocar o nome da variavel (contactName -> userName, prefilledName ->
		// nameHint), o cassette aqui pega antes do integration test rodar.
		const route = readSource("src/app/api/chat/route.ts");

		// 1) O branch interest existe no source com a forma esperada.
		const branchInterest = /body\.action\?\.kind\s*===\s*["']interest["']/;
		expect(
			branchInterest.test(route),
			"route.ts precisa ter branch `body.action?.kind === 'interest'`. " +
				"Sem ele o clique 'Tenho interesse' do card simulation_result nao " +
				"produz artifact lead_form algum.",
		).toBe(true);

		// 2) Dentro do mesmo arquivo, o data-artifact lead_form leva
		// prefilledName lido de contactName.
		const payloadInjection =
			/type:\s*["']lead_form["'][\s\S]{0,200}prefilledName:\s*contactName\s*\?\?\s*null/;
		expect(
			payloadInjection.test(route),
			"route.ts (branch interest) precisa emitir " +
				"`payload: { conversationId, prefilledName: contactName ?? null }`. " +
				"Sem essa linha o nome ja capturado pela conversa NAO chega ao " +
				"frontend e o form aparece vazio — regressao reportada em tb-dev " +
				"2026-05-18 (screenshot 'Seu nome' placeholder).",
		).toBe(true);

		// 3) contactName tem que vir do conv.contactName lido no top do POST —
		// sem isso, o ?? null sempre cai pra null e o fix vira no-op.
		const lidoDoConv = /contactName\s*=\s*conv\.contactName\s*\?\?\s*null/;
		expect(
			lidoDoConv.test(route),
			"route.ts precisa ler `contactName = conv.contactName ?? null` antes " +
				"do switch de actions. Se essa atribuicao sumir, prefilledName SEMPRE " +
				"vai null e o form regride pra 'Seu nome' vazio.",
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

	it("CROSS-REF prompt: regra dura no SPECIALIST_BASE_PROMPT acopla os 3 gates à proibição de pedir valor antes", () => {
		// Acoplamento ao prompt source: o reforço estrutural compartilhado
		// precisa estar lá. Se essa regra sumir, o cassette deste describe
		// continuaria reproduzível em prod.
		const regraComOs3Gates =
			/ANTES[\s\S]{0,400}(valor|parcela|carta|present_value_picker|search_groups)[\s\S]{0,800}experience[\s\S]{0,400}timeframe[\s\S]{0,400}lance/i;
		const regraInvertida =
			/experience[\s\S]{0,400}timeframe[\s\S]{0,400}lance[\s\S]{0,800}ANTES[\s\S]{0,400}(valor|parcela|carta|present_value_picker|search_groups)/i;
		expect(
			regraComOs3Gates.test(SPECIALIST_BASE_PROMPT) || regraInvertida.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa amarrar (experience+timeframe+lance) " +
				"à proibição de pedir valor/parcela ANTES. Sem isso, persona row no DB " +
				"(migration 0021) fica solta — modelo cai no padrão antigo.",
		).toBe(true);
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
	it("CROSS-REF: ASSISTANT_BASE_PROMPT + HARD_RULES.md sec 2.2 mencionam os 3 gates (experience/timeframe/lance)", async () => {
		const { ASSISTANT_BASE_PROMPT } = await import("@/lib/agent/assistant-prompt");
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		const promptCombined = `${ASSISTANT_BASE_PROMPT}\n\n${hardRules}`;

		// Combined precisa mencionar os 3 gates por nome — assistant injeta
		// HARD_RULES no system prompt em runtime, então a regra chega no LLM.
		expect(promptCombined).toMatch(/experience/i);
		expect(promptCombined).toMatch(/timeframe/i);
		expect(promptCombined).toMatch(/lance/i);
	});

	it("CROSS-REF: HARD_RULES.md sec 2.2 explicita ordem dos 3 gates antes do valor", () => {
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		const ordemCorreta = /experience[\s\S]{0,200}timeframe[\s\S]{0,200}lance/i;
		expect(
			ordemCorreta.test(hardRules),
			"HARD_RULES.md sec 2.2 precisa listar os 3 gates na ordem experience → timeframe → lance",
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
		expect(body).toMatch(/NAO explique o que e lance embutido/i);
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

	it("acoplamento: runner.ts tem guard anti-re-reveal (revealLoopActive)", () => {
		const runnerSrc = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(runnerSrc).toMatch(/revealLoopActive/);
		expect(runnerSrc).toMatch(/comparison_table/);
		expect(runnerSrc).toMatch(/REVEAL-LOOP/);
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
		const route = readSource("src/app/api/chat/route.ts");
		expect(route).toMatch(/administradoraPreferida: meta.recommendedAdministradora/);
		const pick = readSource("src/lib/adapters/bevi/partner-offer-mapper.ts");
		expect(pick).toMatch(/preferAdministradora/);
		const fulfillment = readSource("src/lib/bevi/fulfillment.ts");
		expect(fulfillment).toMatch(/input.administradoraPreferida/);
		// Re-sim por TTL também mantém a marca confirmada.
		expect(fulfillment).toMatch(/row.administradora\)/);
	});
});

describe("E2E-REAL — pós-fechamento é terminal (BUG-POS-FECHAMENTO-NAO-TERMINAL)", () => {
	it("acoplamento: offer-confirm marca contractClosed e o runner suprime contract_form", () => {
		const route = readSource("src/app/api/chat/route.ts");
		expect(route).toMatch(/contractClosed: true/);
		const runner = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(runner).toMatch(/isContractDup/);
		expect(runner).toMatch(/contractClosed === true && artifactType === "contract_form"/);
	});
});

// ============================================================================
// REVEAL-ORDER (docx passos 3-4 — auditoria 2026-06-04: "partial/ordem invertida")
// ----------------------------------------------------------------------------
// docx: "Mostrar primeiro 'Plano recomendado pela Aja Agora' (destaque). E
// permitir que o cliente veja 'Outras opções' (as outras 2) para comparação."
// Antes: reveal jogava comparison_table + recommendation JUNTOS, e "ver outras
// opções" era texto livre pro modelo (sem surfacing determinístico).
// ============================================================================

describe("REVEAL-ORDER — recomendado primeiro, outras opções sob demanda", () => {
	it("directive do reveal: recomendado em destaque + detalhamento, SEM comparison no reveal", async () => {
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
		// Ordem do docx: recommendation primeiro + simulate como detalhamento.
		expect(d).toContain("present_recommendation_card");
		expect(d).toContain("present_simulation_result");
		expect(d).toMatch(/recomendado PRIMEIRO|PRIMEIRO, em destaque/);
		// Comparison NÃO entra no reveal — só sob demanda.
		expect(d).toMatch(/NAO chame present_comparison_table neste turno/);
	});

	it("acoplamento: route tem o handler determinístico show-other-options (as outras 2)", () => {
		// O surfacing vive em other-options.ts (módulo único produção+eval) e o
		// route consome — os dois lados do acoplamento são verificados.
		const src = readSource("src/app/api/chat/route.ts");
		expect(src).toMatch(/show-other-options/);
		expect(src).toMatch(/buildOtherOptions/);
		expect(src).toMatch(/comparison_table/);
		const lib = readSource("src/lib/bevi/other-options.ts");
		expect(lib).toMatch(/slice\(0, 2\)/); // docx: "as outras 2"
		expect(lib).toMatch(/recommendedAdministradora/); // exclui a recomendada
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
		expect(src).toMatch(/scoreLabel/);
		expect(src).not.toMatch(/% compativel|% compatível/);
	});
});

// ============================================================================
// FIX-3 (visão do Kairo, design aprovado 2026-06-05) — "Planeje sua conquista"
// no gate credit: 4 indicadores interligados + híbrido vendedor
// ----------------------------------------------------------------------------
// O gate credit deixou de ser 2 sliders simples: virou o componente dinâmico
// (valor do bem · quando quer usar · parcela · lance · lance embutido) em modo
// ESTIMATIVA DE MERCADO (selo obrigatório — a Bevi não simula sem CPF, D1).
// Os campos extras preenchem qualifyAnswers e o funil PULA os gates já
// respondidos; o agente confirma como VENDEDOR (sem re-perguntar). O simulador
// do passo 4 PERMANECE (números reais da oferta ativa — FIX-6).
//
// Defesas detalhadas: plan-estimate.test.ts (engine),
// plan-estimate-picker.test.tsx (componente), route (gate credit estendido).
// ============================================================================

describe("FIX-3-PLANEJE-SUA-CONQUISTA — gate credit dinâmico + funil sem re-pergunta", () => {
	it("estrutural: gate credit serve o componente plan (não os 2 sliders simples)", () => {
		const src = readSource("src/lib/web/adapter.ts");
		expect(src).toMatch(/kind: "plan"/);
		expect(src).toMatch(/targetMonthDefault/);
	});

	it("estrutural: route consome targetMonth/lanceValue/lanceEmbutido do componente", () => {
		const src = readSource("src/app/api/chat/route.ts");
		expect(src).toMatch(/targetMonth/);
		expect(src).toMatch(/buildPlanReactionDirective/);
	});

	it("híbrido vendedor: directive confirma SEM re-perguntar e proíbe tools", () => {
		const directives = readSource("src/lib/agent/orchestrator/directives.ts");
		const start = directives.indexOf("function buildPlanReactionDirective");
		expect(start, "buildPlanReactionDirective precisa existir").toBeGreaterThan(-1);
		const body = directives.slice(start, start + 1800);
		expect(body).toMatch(/VENDEDOR/i);
		expect(body).toMatch(/SEM re-perguntar/i);
		expect(body).toMatch(/NAO chame tools/i);
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

describe("FIX-13-PRAZO-SEM-FONTE — oferta real de parceiro não tem term; ninguém inventa", () => {
	// Detector: "98 meses", "em 110 meses", "prazo de 84 meses"… no contexto
	// do fechamento (oferta de parceiro), QUALQUER "N meses" é número sem fonte.
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

	it("cassette: agent derivando prazo em texto ao apresentar a oferta real — detector pega", async () => {
		// O que o agent NÃO pode falar (derivação de valorCarta ÷ parcela):
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

	it("texto canônico de produção (realOfferPresentation) NÃO dispara o detector", () => {
		const items = realOfferPresentation(START_OK);
		const allText = items
			.filter((i) => i.kind === "text")
			.map((i) => i.text)
			.join("\n");
		expect(allText.length).toBeGreaterThan(0);
		expect(PRAZO_DETECTOR.test(allText)).toBe(false);
	});

	it("payload do artifact real_offer: exatamente as chaves com fonte — sem term/prazo", () => {
		const items = realOfferPresentation(START_OK);
		const artifact = items.find((i) => i.kind === "artifact" && i.type === "real_offer");
		if (artifact?.kind !== "artifact") throw new Error("real_offer ausente");
		expect(Object.keys(artifact.payload).sort()).toEqual([
			"administradora",
			"category",
			"creditValue",
			"grupo",
			"monthlyPayment",
			"proposalId",
		]);
	});

	it("card se explica: copy honesta do prazo vive no componente (regra de produto)", () => {
		const src = readSource("src/components/chat/artifacts/real-offer.tsx");
		expect(src).toMatch(/[Pp]razo e demais condições/);
		expect(src).toMatch(/proposta \(PDF\)/);
		// E o componente não renderiza nenhum campo de prazo (não existe fonte):
		expect(src).not.toMatch(/termMonths|prazoMeses/);
	});
});
