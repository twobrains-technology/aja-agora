import { tool } from "ai";
import { z } from "zod";
import { personaPatchSchema } from "@/lib/validations/persona-patch";
import type { PersonaPatch } from "@/lib/validations/persona-patch";

type AssistantToolsContext = {
	personaId: string;
	personaVersion: number;
	currentRow: {
		voiceTone: string;
		examples: unknown[];
		forbiddenTopics: unknown[];
		handoffTriggers: unknown[];
	};
};

/**
 * Lista canônica de frases proibidas — sincronizada com HARD_RULES.md e
 * tests/regression/agent-trajectory.test.ts via HARD_RULES.test.ts.
 *
 * Adicionar/remover daqui = adicionar/remover do doc + cassettes no mesmo PR.
 */
const FORBIDDEN_PHRASES = [
	// BUG-NO-CTA-AFTER-NAME (9 variantes canônicas)
	"Vamos achar a opção certa",
	"Vamos começar",
	"Vou te ajudar",
	"Estou aqui pra ajudar",
	"Vamos juntos achar",
	"Vamos lá",
	"Bora começar",
	"Vamos descobrir",
	"Vou achar o melhor",
	// BUG-INTERNAL-REASONING-LEAK — prefixos de chain-of-thought
	"Motivo:",
	"Razão:",
	"Justificativa:",
	"Por isso:",
	"Reavaliando",
	"Avaliando",
	"Pensando bem",
	"Refletindo",
	// BUG-META-NARRATIVE-AFTER-NAME
	"perguntas rápidas",
	"próximas perguntas",
	"o sistema vai te guiar",
	// BUG-TOPIC-PICKER promessa sem render
	"olha as opções abaixo",
	"olha as opcoes abaixo",
	"da uma olhada nas opções",
	"da uma olhada nas opcoes",
	"veja as opções abaixo",
	"confira abaixo",
] as const;

/**
 * Regras estruturais sobre o conteúdo do voiceTone que extrapolam frase exata.
 * Cada regra é (regex, mensagem de erro). Casa = viola.
 */
const VOICE_TONE_VIOLATING_RULES: Array<{ test: RegExp; error: string }> = [
	{
		test: /cumpriment(e|ar)[^.!?\n]*(antes|assim que|entrar|nome|primeiro)/i,
		error:
			"voiceTone não pode instruir cumprimentar pelo nome antes/assim-que-entrar — colide com save_contact_name (BUG-SAVE-CONTACT-NAME-MUST-FIRE)",
	},
	{
		test: /(pul(e|ar)|ignor(e|ar)).*(gate|experiencia|prazo|lance)/i,
		error:
			"voiceTone não pode instruir pular gates pré-valor (experiência/prazo/lance) — colide com BUG-AUTO-SKIPS-PRE-VALUE-GATES",
	},
];

function normalize(s: string): string {
	return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function detectViolations(text: string, field: string): string[] {
	const violations: string[] = [];
	const norm = normalize(text);
	for (const phrase of FORBIDDEN_PHRASES) {
		if (norm.includes(normalize(phrase))) {
			violations.push(`Contém frase proibida: "${phrase}"`);
		}
	}
	if (field === "voiceTone") {
		for (const rule of VOICE_TONE_VIOLATING_RULES) {
			if (rule.test.test(text)) {
				violations.push(rule.error);
			}
		}
	}
	return violations;
}

export type ProposePatchResult =
	| { ok: true; patch: PersonaPatch }
	| { ok: false; error: string };

export function buildAssistantTools(ctx: AssistantToolsContext) {
	return {
		ask_clarification: tool({
			description:
				"Faça uma pergunta de UMA FRASE pro admin quando a intenção dele estiver ambígua. Use ANTES de propor patch quando há mais de uma interpretação plausível. Não use pra confirmar — só pra desambiguar.",
			inputSchema: z.object({
				question: z.string().min(5).max(280),
			}),
			execute: async ({ question }) => ({ question }),
		}),

		validate_against_rules: tool({
			description:
				"Verifica se um texto livre viola alguma HARD_RULE do produto antes de você propor patch. SEMPRE chame antes de propose_patch quando o patch carregar texto livre (voiceTone, assistantResponse, responseWhenAsked, condition).",
			inputSchema: z.object({
				text: z.string().min(1),
				field: z.enum([
					"voiceTone",
					"example.assistantResponse",
					"forbiddenTopic.responseWhenAsked",
					"handoffTrigger.condition",
				]),
			}),
			execute: async ({ text, field }) => {
				const violations = detectViolations(text, field);
				return { valid: violations.length === 0, violations };
			},
		}),

		propose_patch: tool({
			description:
				"Propõe uma mudança estruturada na persona. SEMPRE valide o conteúdo com validate_against_rules antes de chamar. Inclua personaVersionSeen igual à versão atual da persona (veja a ficha no system prompt).",
			inputSchema: personaPatchSchema,
			execute: async (patch): Promise<ProposePatchResult> => {
				if (patch.personaVersionSeen !== ctx.personaVersion) {
					return {
						ok: false,
						error: `versão stale: você usou personaVersionSeen=${patch.personaVersionSeen} mas a versão atual é ${ctx.personaVersion}. Releia a ficha da persona e tente de novo.`,
					};
				}

				if (patch.kind === "voiceTone") {
					if (patch.before !== ctx.currentRow.voiceTone) {
						return {
							ok: false,
							error:
								"patch.before não bate com o voiceTone atual da persona. Copie o texto EXATO da ficha — não invente nem parafraseie.",
						};
					}
					const violations = detectViolations(patch.after, "voiceTone");
					if (violations.length > 0) {
						return { ok: false, error: violations.join(" | ") };
					}
				}

				if (patch.kind === "example.add") {
					const violations = detectViolations(
						patch.after.assistantResponse,
						"example.assistantResponse",
					);
					if (violations.length > 0) {
						return { ok: false, error: violations.join(" | ") };
					}
				}

				if (patch.kind === "forbiddenTopic.add") {
					const violations = detectViolations(
						patch.after.responseWhenAsked,
						"forbiddenTopic.responseWhenAsked",
					);
					if (violations.length > 0) {
						return { ok: false, error: violations.join(" | ") };
					}
				}

				if (patch.kind === "handoffTrigger.add") {
					const violations = detectViolations(
						patch.after.condition,
						"handoffTrigger.condition",
					);
					if (violations.length > 0) {
						return { ok: false, error: violations.join(" | ") };
					}
				}

				return { ok: true, patch };
			},
		}),
	};
}

export type AssistantTools = ReturnType<typeof buildAssistantTools>;
