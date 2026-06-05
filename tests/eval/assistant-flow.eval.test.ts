/**
 * Eval Camada 3 — AI Assistant no cadastro/edição de persona (backoffice).
 *
 * Diferente do agent-flow.eval.test.ts que valida o agente de produção via
 * `runTurn`, aqui validamos o **AI Assistant** (Sonnet 4.6) que ajuda admins
 * leigos a editar personas. Não passamos pelo orchestrator — chamamos
 * `streamText` direto com os tools reais do assistant.
 *
 * Padrão: user-bot (Haiku 4.5) simula admin leigo dando instrução em
 * linguagem natural; assistant (Sonnet 4.6) responde com tool-calls reais
 * (ask_clarification, validate_against_rules, propose_patch).
 *
 * Cirurgico (EVAL-ASSISTANT-LESS-FORMAL) entra no `test:eval:quick` pra
 * rodar no pre-commit quando há mudança em src/lib/agent/.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { anthropicAvailable, warnEvalSkipped } from "./anthropic-availability";
import { generateText, stepCountIs, streamText } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAssistantPrompt } from "@/lib/agent/assistant-prompt";
import { buildAssistantTools } from "@/lib/agent/tools/assistant-tools";

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;
// Camada 3 exige API REAL disponível — cota esgotada/5xx/rede não é regressão
// (ver tests/eval/anthropic-availability.ts). Top-level await: vitest ESM ok.
const AVAILABILITY = HAS_API_KEY ? await anthropicAvailable() : { ok: false, reason: "ANTHROPIC_API_KEY ausente" };
if (HAS_API_KEY && !AVAILABILITY.ok) warnEvalSkipped(import.meta.url.split("/").pop() ?? "eval", AVAILABILITY.reason ?? "");
const describeIfKey = AVAILABILITY.ok ? describe : describe.skip;

const anthropic = createAnthropic();
const ASSISTANT_MODEL = process.env.AI_MODEL_ASSISTANT_EVAL ?? "claude-sonnet-4-6";
const USER_BOT_MODEL = process.env.AI_MODEL_EVAL ?? "claude-haiku-4-5";

type Persona = {
	id: string;
	displayName: string;
	role: "concierge" | "specialist";
	category: string | null;
	expertise: string | null;
	voiceTone: string;
	// biome-ignore lint/suspicious/noExplicitAny: fixture
	examples: any[];
	// biome-ignore lint/suspicious/noExplicitAny: fixture
	forbiddenTopics: any[];
	// biome-ignore lint/suspicious/noExplicitAny: fixture
	handoffTriggers: any[];
	version: number;
};

type AssistantTurn = {
	toolCalls: Array<{ toolName: string; input: unknown; output: unknown }>;
	text: string;
};

/**
 * Roda 1 turn do assistant: dá uma mensagem do user, captura tool-calls + texto.
 * Usa streamText pra simular exatamente o que a route /assist faz.
 */
async function runAssistantTurn(args: {
	persona: Persona;
	history: Array<{ role: "user" | "assistant"; content: string }>;
	userMessage: string;
}): Promise<AssistantTurn> {
	const tools = buildAssistantTools({
		personaId: args.persona.id,
		personaVersion: args.persona.version,
		role: args.persona.role,
		category: args.persona.category,
		currentRow: {
			voiceTone: args.persona.voiceTone,
			examples: args.persona.examples,
			forbiddenTopics: args.persona.forbiddenTopics,
			handoffTriggers: args.persona.handoffTriggers,
		},
	});

	const result = streamText({
		model: anthropic(ASSISTANT_MODEL),
		system: buildAssistantPrompt(args.persona),
		messages: [...args.history, { role: "user", content: args.userMessage }],
		tools,
		stopWhen: stepCountIs(6),
		temperature: 0.3,
	});

	// Drena stream + steps
	let text = "";
	for await (const chunk of result.textStream) text += chunk;

	const steps = await result.steps;
	const toolCalls: AssistantTurn["toolCalls"] = [];
	for (const step of steps) {
		for (let i = 0; i < (step.toolCalls?.length ?? 0); i++) {
			const tc = step.toolCalls?.[i];
			const tr = step.toolResults?.[i];
			if (tc) {
				toolCalls.push({
					toolName: tc.toolName,
					input: tc.input,
					output: tr?.output,
				});
			}
		}
	}

	return { text, toolCalls };
}

async function userBotReply(args: {
	systemPrompt: string;
	transcript: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
	const result = await generateText({
		model: anthropic(USER_BOT_MODEL),
		system: `${args.systemPrompt}\n\nResponda como ADMIN LEIGO configurando o agente. 1 frase curta em PT-BR, sem jargão técnico. Sem emojis.`,
		messages: args.transcript,
	});
	return result.text.trim();
}

function makePersona(over: Partial<Persona> = {}): Persona {
	return {
		id: "eval-persona-1",
		displayName: "Rafael Auto",
		role: "specialist",
		category: "auto",
		expertise: null,
		voiceTone: "formal e técnico, usa termos do mercado",
		examples: [],
		forbiddenTopics: [],
		handoffTriggers: [],
		version: 1,
		...over,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// EVAL-ASSISTANT-LESS-FORMAL — cirúrgico (entra no pre-commit)
// Admin diz "deixa o tom menos formal". Assistant DEVE:
//   1. Ou pedir clarificação (ask_clarification) primeiro
//   2. Ou propor patch voiceTone válido (com validate_against_rules antes)
// Em qualquer caso: NÃO pode propor patch que contenha frase proibida.
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey(
	"EVAL-ASSISTANT-LESS-FORMAL — admin pede tom menos formal, assistant traduz em patch válido",
	() => {
		let turn: AssistantTurn | null = null;
		let persona: Persona;

		beforeAll(async () => {
			persona = makePersona();
			turn = await runAssistantTurn({
				persona,
				history: [],
				userMessage: "deixa o tom menos formal, fala como amigo no zap",
			});
		}, 60_000);

		it("assistant chama tool válida (não responde só texto)", () => {
			expect(turn?.toolCalls.length, "esperava ≥1 tool call").toBeGreaterThan(0);
		});

		it("primeira tool é ask_clarification OU propose_patch (nada de inventar tool)", () => {
			const first = turn?.toolCalls[0];
			expect(first?.toolName, "primeira tool inesperada").toMatch(
				/^(ask_clarification|propose_patch|validate_against_rules)$/,
			);
		});

		it("se houve propose_patch, ele foi validado server-side com ok:true OR a IA replanejou após ok:false", () => {
			const proposeCalls = turn?.toolCalls.filter((t) => t.toolName === "propose_patch");
			if (!proposeCalls?.length) {
				// IA escolheu desambiguar primeiro — válido.
				return;
			}

			// Pelo menos UM patch válido com kind=voiceTone deve ter sido proposto.
			// Comportamento holístico agora permite também example.add/remove em sequência.
			const okPatches = proposeCalls.filter((c) => {
				const out = c.output as { ok?: boolean };
				return out?.ok === true;
			});

			if (okPatches.length === 0) {
				// Servidor bloqueou tudo. Bom sinal — defesa funcionou.
				return;
			}

			const voiceTonePatch = okPatches.find((c) => {
				const out = c.output as { patch?: { kind?: string } };
				return out?.patch?.kind === "voiceTone";
			});
			expect(
				voiceTonePatch,
				"orquestração holística deve incluir pelo menos 1 patch voiceTone pra 'menos formal'",
			).toBeDefined();
		});

		it("NENHUMA propose_patch passou com voiceTone contendo frase proibida", () => {
			const proposeCalls = turn?.toolCalls.filter((t) => t.toolName === "propose_patch");
			for (const call of proposeCalls ?? []) {
				const output = call.output as {
					ok?: boolean;
					patch?: { kind?: string; after?: string };
				};
				if (output?.ok && output.patch?.kind === "voiceTone") {
					const after = (output.patch as { after?: string }).after ?? "";
					expect(after.toLowerCase()).not.toContain("vamos achar a opção certa");
					expect(after.toLowerCase()).not.toContain("vou te ajudar");
					expect(after).not.toMatch(/cumpriment(e|ar).*(antes|assim que|entrar|nome)/i);
				}
			}
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// EVAL-ASSISTANT-NO-CTA-LEAK — admin pede algo que viola HARD_RULE, IA recusa
// "bota pra cumprimentar pelo nome assim que entrar"
// → IA deve EXPLICAR que viola regra (texto) ou propor alternativa que respeite.
// ─────────────────────────────────────────────────────────────────────────────

describeIfKey(
	"EVAL-ASSISTANT-NO-CTA-LEAK — admin pede violação, IA recusa ou propõe alternativa válida",
	() => {
		let turn: AssistantTurn | null = null;

		beforeAll(async () => {
			turn = await runAssistantTurn({
				persona: makePersona(),
				history: [],
				userMessage:
					"quero que o agente cumprimente o usuário pelo nome assim que ele entrar na conversa",
			});
		}, 60_000);

		it("se propôs patch voiceTone, after NÃO contém instrução de cumprimentar antes", () => {
			const proposeCalls = turn?.toolCalls.filter((t) => t.toolName === "propose_patch");
			for (const call of proposeCalls ?? []) {
				const output = call.output as {
					ok?: boolean;
					patch?: { kind?: string; after?: string };
				};
				if (output?.ok && output.patch?.kind === "voiceTone") {
					const after = (output.patch as { after?: string }).after ?? "";
					expect(after).not.toMatch(/cumpriment(e|ar).*(antes|assim que|entrar|nome)/i);
				}
			}
		});

		it("se propose_patch retornou ok:false, IA recebeu o erro (não pode ter passado)", () => {
			const proposeCalls = turn?.toolCalls.filter((t) => t.toolName === "propose_patch");
			const anyOk = proposeCalls?.some((c) => {
				const out = c.output as { ok?: boolean };
				return out?.ok === true;
			});

			if (!anyOk && proposeCalls?.length) {
				// Server bloqueou. Bom sinal — defesa server-side funcionou.
				const lastOutput = proposeCalls[proposeCalls.length - 1].output as {
					ok?: boolean;
					error?: string;
				};
				expect(lastOutput?.ok).toBe(false);
				expect(lastOutput?.error).toBeTruthy();
			}
			// Se anyOk === true ou nenhum propose_patch, é caso do teste anterior.
		});
	},
);

// Garante que pelo menos um teste roda no quick mesmo sem chave (skip não falha)
describe("EVAL-ASSISTANT — sanity (sempre roda)", () => {
	it("buildAssistantTools retorna 3 tools registradas", () => {
		const tools = buildAssistantTools({
			personaId: "x",
			personaVersion: 1,
			role: "specialist",
			category: "auto",
			currentRow: {
				voiceTone: "x",
				examples: [],
				forbiddenTopics: [],
				handoffTriggers: [],
			},
		});
		expect(Object.keys(tools).sort()).toEqual([
			"ask_clarification",
			"propose_patch",
			"validate_against_rules",
		]);
	});
});
