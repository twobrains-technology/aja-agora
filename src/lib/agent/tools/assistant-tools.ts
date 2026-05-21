import { tool } from "ai";
import { z } from "zod";
import { personaPatchSchema } from "@/lib/validations/persona-patch";
import type { PersonaPatch } from "@/lib/validations/persona-patch";

type AssistantToolsContext = {
	personaId: string;
	personaVersion: number;
	role: "concierge" | "specialist";
	category: string | null;
	currentRow: {
		voiceTone: string;
		examples: ReadonlyArray<{ id: string; [k: string]: unknown }>;
		forbiddenTopics: ReadonlyArray<{ id: string; [k: string]: unknown }>;
		handoffTriggers: ReadonlyArray<{ id: string; [k: string]: unknown }>;
	};
	/**
	 * Optional. Quando presente, executeProposePatch re-checka a version
	 * direto no DB no momento da emissão do patch (fecha a janela de race
	 * onde outro admin pode ter bumpado a versão durante o stream do LLM).
	 *
	 * Sem essa função, a comparação cai pra ctx.personaVersion (snapshot do
	 * início do POST). Para tests pode-se omitir; em prod, route /assist
	 * injeta um fetcher que lê do DB.
	 */
	refreshVersion?: () => Promise<number>;
};

/**
 * Tópicos canônicos do funil que NÃO podem virar forbiddenTopic.
 * HARD_RULES.md sec 4.3 — bloquear esses quebra o produto.
 */
const CANONICAL_FUNNEL_TOPICS = [
	"consórcio",
	"consorcio",
	"simulação",
	"simulacao",
	"carta de crédito",
	"carta de credito",
	"parcela",
	"lance",
	"contemplação",
	"contemplacao",
] as const;

/**
 * Palavras-chave fracas/ambíguas que não podem disparar handoff sozinhas.
 * HARD_RULES.md sec 4.4 — só pedido EXPLÍCITO de humano vira handoff.
 */
const WEAK_HANDOFF_KEYWORDS = ["ajuda", "dúvida", "duvida"] as const;

/**
 * Sinais de pedido EXPLÍCITO de humano que validam um handoff trigger.
 */
const STRONG_HANDOFF_SIGNALS = [
	/\b(humano|pessoa|consultor|atendente|gerente|representante|operador|funcion[áa]rio)\b/i,
	/\bn[ãa]o quero (falar com|robô|bot)\b/i,
	/\bquero falar com algu[ée]m\b/i,
] as const;

/**
 * Palavras que indicam citação de valor monetário absoluto em texto de example.
 * Concierge não pode citar valor (CA-33).
 */
const MONETARY_PATTERN =
	/\b(R\$\s*\d|parcela[^a-z]{0,10}\d|cr[ée]dito[^a-z]{0,10}\d|\d{2,3}\s*mil|\d{1,3}\.\d{3})/i;

/**
 * Mapeamento categoria → palavras-chave de OUTRAS categorias que não devem
 * aparecer no assistantResponse de um specialist daquela categoria (CA-34).
 */
const CATEGORY_FORBIDDEN_TERMS: Record<string, RegExp> = {
	auto: /\b(im[óo]vel|im[óo]veis|apartamento|casa|terreno|moto|motoc[ií]clo|servi[çc]o|reforma)\b/i,
	imovel: /\b(carro|autom[óo]vel|moto|motoc[ií]clo|ve[íi]culo|servi[çc]o|reforma)\b/i,
	moto: /\b(carro|autom[óo]vel|im[óo]vel|apartamento|casa|servi[çc]o|reforma)\b/i,
	servicos: /\b(carro|autom[óo]vel|im[óo]vel|apartamento|casa|moto|motoc[ií]clo)\b/i,
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

/**
 * Lógica de validação server-side do patch — extraída pra ser testável sem
 * passar pelo wrapper z.object({ patch: ... }) que o tool inputSchema obriga
 * por exigência da Anthropic (input_schema deve ter type:"object" no root).
 */
export async function executeProposePatch(
	patch: PersonaPatch,
	ctx: AssistantToolsContext,
): Promise<ProposePatchResult> {
	// Anti-race: se ctx fornece refreshVersion, re-checka direto no DB no
	// momento da emissão do patch. Fecha a janela onde outro admin bumpou
	// a versão durante o stream do LLM (gap reportado em QA round 2).
	const currentVersion = ctx.refreshVersion
		? await ctx.refreshVersion()
		: ctx.personaVersion;

	if (patch.personaVersionSeen !== currentVersion) {
		return {
			ok: false,
			error: `versão stale: você usou personaVersionSeen=${patch.personaVersionSeen} mas a versão atual é ${currentVersion}. Outro admin pode ter editado a persona — releia a ficha e tente de novo.`,
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
		// CA-33: concierge não pode dar valor de parcela/crédito.
		if (
			ctx.role === "concierge" &&
			MONETARY_PATTERN.test(patch.after.assistantResponse)
		) {
			return {
				ok: false,
				error:
					"persona concierge não pode citar valor de parcela ou crédito — só specialist. Reformule sem números absolutos (encaminhe pro especialista da categoria).",
			};
		}
		// CA-34: specialist de uma categoria não pode falar de outra.
		if (ctx.role === "specialist" && ctx.category) {
			const forbidden = CATEGORY_FORBIDDEN_TERMS[ctx.category];
			if (forbidden && forbidden.test(patch.after.assistantResponse)) {
				return {
					ok: false,
					error: `persona specialist de "${ctx.category}" não fala de outra categoria. Mantenha o exemplo no escopo da especialidade.`,
				};
			}
		}
	}

	if (patch.kind === "example.remove") {
		// A-03: targetId precisa existir no row atual.
		const exists = ctx.currentRow.examples.some(
			(e) => e.id === patch.targetId,
		);
		if (!exists) {
			return {
				ok: false,
				error: `example.remove: targetId "${patch.targetId}" não existe na persona. IDs disponíveis: ${
					ctx.currentRow.examples.map((e) => e.id).join(", ") || "(nenhum)"
				}`,
			};
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
		// A-01: bloquear tópicos canônicos do funil.
		const topicNorm = normalize(patch.after.topic);
		const canonHit = CANONICAL_FUNNEL_TOPICS.find((c) =>
			topicNorm.includes(normalize(c)),
		);
		if (canonHit) {
			return {
				ok: false,
				error: `forbiddenTopic.topic "${patch.after.topic}" é tópico canônico do funil (${canonHit}) — bloquear quebra o produto. Use tópicos fora do escopo (ex: "comissão de corretor", "concorrência").`,
			};
		}
	}

	if (patch.kind === "forbiddenTopic.remove") {
		// A-03 extension: idem example.remove.
		const exists = ctx.currentRow.forbiddenTopics.some(
			(t) => t.id === patch.targetId,
		);
		if (!exists) {
			return {
				ok: false,
				error: `forbiddenTopic.remove: targetId "${patch.targetId}" não existe na persona.`,
			};
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
		// A-02: rejeitar condition fraca (palavra-chave única ambígua).
		const condNorm = normalize(patch.after.condition);
		const hasWeak = WEAK_HANDOFF_KEYWORDS.some((w) =>
			condNorm.includes(normalize(w)),
		);
		const hasStrong = STRONG_HANDOFF_SIGNALS.some((rx) =>
			rx.test(patch.after.condition),
		);
		if (hasWeak && !hasStrong) {
			return {
				ok: false,
				error:
					'handoffTrigger.condition fraco — palavras como "ajuda" ou "dúvida" são ambíguas. Use sinais explícitos de pedido humano: "usuário pede explicitamente falar com pessoa/consultor/atendente".',
			};
		}
		if (!hasStrong) {
			return {
				ok: false,
				error:
					'handoffTrigger.condition precisa descrever pedido EXPLÍCITO de humano (palavras: humano, pessoa, consultor, atendente, gerente, operador).',
			};
		}
	}

	if (patch.kind === "handoffTrigger.remove") {
		const exists = ctx.currentRow.handoffTriggers.some(
			(t) => t.id === patch.targetId,
		);
		if (!exists) {
			return {
				ok: false,
				error: `handoffTrigger.remove: targetId "${patch.targetId}" não existe na persona.`,
			};
		}
	}

	return { ok: true, patch };
}

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
				"Propõe uma mudança estruturada na persona. SEMPRE valide o conteúdo com validate_against_rules antes de chamar. Inclua personaVersionSeen igual à versão atual da persona (veja a ficha no system prompt). O patch deve ter formato { kind, rationale, personaVersionSeen, ...(campos específicos por kind) }: voiceTone usa { before, after }; example.add/forbiddenTopic.add/handoffTrigger.add usam { after: <objeto> }; *.remove usam { targetId: <uuid> }.",
			inputSchema: z.object({
				patch: personaPatchSchema,
			}),
			execute: async ({ patch }) => executeProposePatch(patch, ctx),
		}),
	};
}

export type AssistantTools = ReturnType<typeof buildAssistantTools>;
