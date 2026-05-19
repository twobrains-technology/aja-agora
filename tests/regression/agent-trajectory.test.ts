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
				.replace(/ç/g, "c")
				.replace(/õ/g, "o")
				.replace(/á/g, "a");
		const promptNorm = normalizar(SPECIALIST_BASE_PROMPT);

		const variantesExtras = ["confira abaixo", "olhe abaixo", "olha ai"];
		const faltando = variantesExtras.filter(
			(v) => !promptNorm.includes(normalizar(v)),
		);

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
		const branchInterest =
			/body\.action\?\.kind\s*===\s*["']interest["']/;
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
		const lidoDoConv =
			/contactName\s*=\s*conv\.contactName\s*\?\?\s*null/;
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

		const defaultPrefere =
			/defaultValues:\s*\{\s*name:\s*payload\.prefilledName\s*\?\?\s*["']{2}/;
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
				"payload no reset: `name: payload.prefilledName ?? data.name ?? \"\"`. " +
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
		const mencionaNome =
			/(prazer|beleza|show|oi|ol[áa]),?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+!?/i;
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
			ordemTemporal.test(SPECIALIST_BASE_PROMPT) ||
				ordemReversa.test(SPECIALIST_BASE_PROMPT),
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
		const cassette =
			"Beleza, Marina! Prazer, Marina! Vamos achar a opção certa pra você.";

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
				"User:\"Paulo\" + agent:\"Prazer, Paulo!\". É a transcrição real do bug.",
		).toBe(true);
	});

	it("prompt source: lista expandida tem 'Prazer, X!', 'Beleza, X!', 'Oi, X!', 'Bom te conhecer, X!'", () => {
		const variantes = [
			'"prazer, x!"',
			'"beleza, x!"',
			'"oi, x!"',
			'"bom te conhecer, x!"',
		];
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
		const { isLikelyNameResponse } = await import(
			"@/lib/agent/orchestrator/detect-name-turn"
		);
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
				"Hits: " + hits.length,
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
		const mencionaGate = /\b(experience|timeframe|lance)\b/i.test(
			CASSETTE_RAFAEL_PULA_GATES,
		);
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
		const detectorPulaGate =
			/(qual|quanto)[\s\S]{0,30}(faixa|valor|cr[ée]dito|carta|parcela)/i;
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
			regraComOs3Gates.test(SPECIALIST_BASE_PROMPT) ||
				regraInvertida.test(SPECIALIST_BASE_PROMPT),
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

		const mencionaGates =
			/experience[\s\S]{0,300}timeframe[\s\S]{0,300}lance/i.test(migrationSrc);
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

		const idempotente = /NOT LIKE|NOT @>|IS NULL|jsonb_array_length/i.test(
			migrationSrc,
		);
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
				question:
					"Menos formal igual amigo no zap, ou só menos técnico mas ainda profissional?",
			}),
			FINISH_TOOL_CALLS,
		]);

		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.toolName).toBe("ask_clarification");
		expect(toolCalls[0]?.toolName).not.toBe("propose_patch");
	});

	it("CROSS-REF prompt: ASSISTANT_BASE_PROMPT instrui desambiguar antes de propor", async () => {
		const { ASSISTANT_BASE_PROMPT } = await import(
			"@/lib/agent/assistant-prompt"
		);
		const regraDesambigua =
			/(desambigu|vag[oa]|amb[íi]gu[oa])[\s\S]{0,400}ask_clarification/i;
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
		const { ASSISTANT_BASE_PROMPT } = await import(
			"@/lib/agent/assistant-prompt"
		);
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
		const { executeProposePatch } = await import(
			"@/lib/agent/tools/assistant-tools"
		);
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
			expect(result.ok, `voiceTone "${after}" deveria ter sido rejeitado`).toBe(
				false,
			);
		}
	});

	it("CROSS-REF: HARD_RULES.md lista variantes proibidas pos-nome", () => {
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		const variantes = [
			"Vamos achar a opção certa",
			"Vou te ajudar",
			"Estou aqui pra ajudar",
		];
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
		const { executeProposePatch } = await import(
			"@/lib/agent/tools/assistant-tools"
		);
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
		const { executeProposePatch } = await import(
			"@/lib/agent/tools/assistant-tools"
		);
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
		const { executeProposePatch } = await import(
			"@/lib/agent/tools/assistant-tools"
		);
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
			expect(
				result.ok,
				`assistantResponse "${assistantResponse}" deveria ter sido rejeitado`,
			).toBe(false);
		}
	});

	it("CROSS-REF: HARD_RULES.md lista 'Motivo:' e 'Reavaliando' como prefixos proibidos", () => {
		const hardRules = readSource("src/lib/agent/HARD_RULES.md");
		expect(hardRules).toMatch(/Motivo:/);
		expect(hardRules).toMatch(/Reavaliando/i);
	});
});
