// System prompt + builder do prompt de usuário pro diagnóstico.
//
// Filosofia: o juiz já mediu (eval). O diagnóstico parte da nota baixa e
// olha pra dimensão concreta que falhou, propondo correções acionáveis no
// formato que a persona já entende (few-shot, forbidden topic, handoff
// trigger). As condições dos exemplos sugeridos devem refletir o CONTEXTO
// da conversa motivadora — assim a correção adapta personas similares sem
// virar regra universal.

import type {
	EvalDimensionsPayload,
	EvalFlagsPayload,
	PersonaExample,
	PersonaForbiddenTopic,
	PersonaHandoffTrigger,
} from "@/db/schema";

export const DIAGNOSIS_VERSION = "v1";

export const DIAGNOSIS_SYSTEM_PROMPT = `# Diagnóstico — Aja Agora

Você é um engenheiro de qualidade do agente IA do Aja Agora, plataforma B2C
de consórcio onde o agente conduz a jornada do cliente do "quero comprar X"
até a captura de lead. Você recebe uma conversa que foi avaliada com nota
baixa e precisa propor correções concretas pra persona.

## Como entregar valor

1. Leia o transcript inteiro e olhe DIMENSÕES que caíram (< 0.6) e FLAGS
   ativas. Esses são os sintomas — sua tarefa é encontrar a causa raiz.

2. Cite **evidência específica** do transcript no rootCause. Sem "tem
   problemas de tom" — escreva "Turn 3 usa 'cota' e 'lance livre' sem
   explicar pra usuário leigo".

3. Proponha correções em até 3 formatos:

   **suggestedExamples** — few-shot. O mais poderoso pra calibrar voz e
   comportamento. Sempre que possível, escope com \`when*\` baseado no
   contexto da conversa motivadora (ex: se a falha foi em leigo+imóvel+
   whatsapp, use essas condições). Exemplo bem condicionado vale por 5
   genéricos.

   **suggestedForbiddenTopics** — pra coisas que NUNCA deveriam aparecer
   (promessa de contemplação, conselho jurídico, comparação com concorrente).

   **suggestedHandoffTriggers** — pra sinais de quando escalar pra humano
   (3+ objeções seguidas, valor acima de 1M, pedido explícito).

## Regras

- Total entre as 3 listas: **mínimo 1, máximo 5 sugestões**. Qualidade > quantidade.
- Cada \`userMessage\` e \`assistantResponse\` deve ser CURTO (1-2 frases).
- Não duplique exemplos/tópicos/triggers que JÁ EXISTEM na persona (você os
  recebe no prompt do usuário).
- \`rationale\` em 1 frase, citando a dimensão ou flag que motivou.
- Se a conversa é canal específico (whatsapp), prefira \`whenChannel: "whatsapp"\`.
- Se o problema é estritamente do nível do usuário (leigo, expert), use
  \`whenExpertise\`.

## Output

Retorne JSON conforme schema:
- \`rootCause\`: 1-2 frases, evidência específica
- \`suggestedExamples\`: array (pode ser vazio se não couber)
- \`suggestedForbiddenTopics\`: array (pode ser vazio)
- \`suggestedHandoffTriggers\`: array (pode ser vazio)

Seja honesto: se a conversa foi avaliada baixa por motivo que NÃO cabe em
nenhum desses 3 mecanismos, devolva listas vazias e explique no rootCause.`;

export type ConversationContext = {
	expertise: string | null;
	category: string | null;
	channel: "web" | "whatsapp";
	intent: string | null;
};

export type PersonaSnapshot = {
	id: string;
	displayName: string;
	voiceTone: string;
	examples: ReadonlyArray<PersonaExample>;
	forbiddenTopics: ReadonlyArray<PersonaForbiddenTopic>;
	handoffTriggers: ReadonlyArray<PersonaHandoffTrigger>;
};

export type EvalSnapshot = {
	overallScore: number | null;
	dimensions: EvalDimensionsPayload | null;
	flags: EvalFlagsPayload | null;
	topIssues: string[] | null;
	topStrengths: string[] | null;
};

export function buildDiagnosisPrompt(args: {
	transcript: string;
	evaluation: EvalSnapshot;
	persona: PersonaSnapshot;
	context: ConversationContext;
}): string {
	const { transcript, evaluation, persona, context } = args;

	return [
		"Diagnostique a conversa abaixo e proponha correções pra persona.",
		"",
		"=== AVALIAÇÃO ===",
		formatEval(evaluation),
		"",
		"=== TRANSCRIPT ===",
		transcript,
		"",
		"=== CONTEXTO DA CONVERSA ===",
		formatContext(context),
		"",
		"=== PERSONA ATIVA — ESTADO ATUAL ===",
		formatPersona(persona),
		"",
		"Agora produza o JSON conforme schema. Lembre: condições dos exemplos",
		"devem refletir o contexto da conversa quando o problema for específico.",
	].join("\n");
}

function formatEval(e: EvalSnapshot): string {
	const lines: string[] = [];
	lines.push(`overall: ${e.overallScore !== null ? e.overallScore.toFixed(2) : "(n/a)"}`);
	if (e.dimensions) {
		lines.push("dimensões:");
		for (const [key, value] of Object.entries(e.dimensions)) {
			lines.push(`  - ${key}: ${value.score.toFixed(2)} — ${value.reasoning}`);
		}
	}
	if (e.flags) {
		const active = Object.entries(e.flags)
			.filter(([, v]) => v)
			.map(([k]) => k);
		lines.push(`flags ativas: ${active.length > 0 ? active.join(", ") : "(nenhuma)"}`);
	}
	if (e.topIssues && e.topIssues.length > 0) {
		lines.push("problemas reportados pelo juiz:");
		for (const issue of e.topIssues) lines.push(`  - ${issue}`);
	}
	if (e.topStrengths && e.topStrengths.length > 0) {
		lines.push("pontos fortes (preservar):");
		for (const s of e.topStrengths) lines.push(`  - ${s}`);
	}
	return lines.join("\n");
}

function formatContext(c: ConversationContext): string {
	return [
		`canal: ${c.channel}`,
		`categoria: ${c.category ?? "(não definida)"}`,
		`expertise do usuário: ${c.expertise ?? "(não detectada)"}`,
		`intent do último turno: ${c.intent ?? "(não classificado)"}`,
	].join("\n");
}

function formatPersona(p: PersonaSnapshot): string {
	const lines: string[] = [
		`id: ${p.id}`,
		`displayName: ${p.displayName}`,
		`voiceTone: ${p.voiceTone}`,
		"",
		`exemplos ativos: ${p.examples.filter((e) => e.enabled !== false).length}`,
	];

	// Mostra exemplos existentes pro LLM não duplicar.
	const active = p.examples.filter((e) => e.enabled !== false);
	if (active.length > 0) {
		lines.push("exemplos atuais (NÃO duplique):");
		for (const ex of active.slice(0, 10)) {
			const conds = formatExampleConditions(ex);
			lines.push(`  - ${conds}user: "${truncate(ex.userMessage, 80)}"`);
		}
	}

	const enabledForbidden = p.forbiddenTopics.filter((t) => t.enabled);
	if (enabledForbidden.length > 0) {
		lines.push("");
		lines.push("tópicos proibidos atuais (NÃO duplique):");
		for (const t of enabledForbidden) lines.push(`  - ${t.topic}`);
	}

	const enabledHandoff = p.handoffTriggers.filter((t) => t.enabled);
	if (enabledHandoff.length > 0) {
		lines.push("");
		lines.push("triggers de handoff atuais (NÃO duplique):");
		for (const t of enabledHandoff) lines.push(`  - ${t.condition}`);
	}

	return lines.join("\n");
}

function formatExampleConditions(ex: PersonaExample): string {
	const parts: string[] = [];
	if (ex.whenExpertise && ex.whenExpertise.length > 0)
		parts.push(`expertise=${ex.whenExpertise.join("|")}`);
	if (ex.whenCategory && ex.whenCategory.length > 0)
		parts.push(`category=${ex.whenCategory.join("|")}`);
	if (ex.whenChannel) parts.push(`channel=${ex.whenChannel}`);
	if (ex.whenIntent && ex.whenIntent.length > 0) parts.push(`intent=${ex.whenIntent.join("|")}`);
	return parts.length > 0 ? `[${parts.join(", ")}] ` : "";
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max)}…`;
}
