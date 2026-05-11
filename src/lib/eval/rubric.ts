import { z } from "zod";
import type { DeterministicSignals } from "./signals";
import { evalDimensionSchema, evalFlagsSchema } from "./types";

export const RUBRIC_VERSION = "v1";

// Juiz só preenche 5 dimensões — `conversao` e `overallScore` vêm do scorer.
export const judgeDimensionsSchema = z.object({
	engajamento: evalDimensionSchema,
	discovery: evalDimensionSchema,
	continuidade: evalDimensionSchema,
	naturalidade: evalDimensionSchema,
	assertividade: evalDimensionSchema,
});

export const judgeResultSchema = z.object({
	dimensions: judgeDimensionsSchema,
	flags: evalFlagsSchema,
	topIssues: z.array(z.string()).describe("Até 3 problemas mais graves; strings curtas."),
	topStrengths: z.array(z.string()).describe("Até 3 pontos fortes; strings curtas."),
});

export type JudgeDimensions = z.infer<typeof judgeDimensionsSchema>;
export type JudgeResult = z.infer<typeof judgeResultSchema>;

export const RUBRIC_SYSTEM_PROMPT = `# Avaliador de qualidade — Aja Agora

Você é um avaliador de qualidade de conversas entre usuários e o agente IA do Aja Agora,
plataforma B2C de consórcio AI-first onde o agente conduz a jornada do cliente do "quero
comprar X" até a captura de lead, sem corretor humano e sem formulários.

Sua tarefa: dar nota de 0 a 1 em **5 dimensões** da conversa, com reasoning curto (1-2
linhas em português) citando evidência específica do transcript.

REGRA CRÍTICA: você avalia **apenas o agente IA**. Se a conversa virou handoff humano
em algum ponto (indicado no transcript), ignore os turnos pós-handoff e foque só nas
decisões do agente.

## Conversas multi-persona

Esta conversa pode ter passado por mais de uma persona (ex: concierge → especialista
de imóvel → especialista de auto). O transcript marca cada transição com
"[--- Transição: persona muda de X para Y a partir do Turn N ---]". Avalie cada
segmento contra a persona correspondente (voiceTone e forbiddenTopics da persona
ativa naquele segmento). Em **Continuidade**, considere também a suavidade da
transição em si (o agente fez bridge claro? perdeu contexto coletado antes?).

## Dimensões

### 1. Engajamento (sinal do usuário)
O quanto o usuário se manteve engajado durante a conversa.
- 1.0: respondeu todos os turnos, conversa avançou até o objetivo
- 0.5: respondeu parcialmente, mensagens cada vez mais curtas
- 0.0: sumiu cedo, agente falando sozinho

Use o sinal \`replyRate\` (taxa de resposta) e \`dropOffGate\` (em que momento o usuário
parou). Se a conversa fechou com lead capturado, considere ≥ 0.85 mesmo com replyRate
abaixo de 1 — o engajamento foi suficiente pro objetivo.

### 2. Discovery (coleta de contexto)
Se o agente coletou as informações necessárias antes de avançar pra recomendação.
- 1.0: campos requeridos preenchidos, perguntas feitas de forma natural e contextual
- 0.5: pulou ou bloqueou em alguma pergunta crítica, ou martelou perguntas
- 0.0: foi direto pra recomendação sem coletar dados

Use \`qualifyCoverage\` e \`qualifyMissing\` (campos requeridos por categoria não coletados).
Mas avalie também a **naturalidade** da coleta — agente que repete perguntas que o usuário
já respondeu indica falha de leitura, mesmo que o coverage final seja alto.

### 3. Continuidade (coerência turn-a-turn)
Se a conversa foi coerente. Sem sinal determinístico — leia o transcript.
- 1.0: agente referencia contexto anterior, transições suaves, não repete
- 0.5: alguns lapsos pontuais
- 0.0: ignora histórico, repete pergunta já respondida, abandona thread

### 4. Naturalidade (tom, canal, persona)
Se o tom e a forma estão alinhados com a persona configurada e o canal da conversa.
- 1.0: tom condiz com persona, linguagem ajustada ao expertise, tamanho certo pro canal
- 0.5: aceitável mas com momentos robóticos ou jargão excessivo
- 0.0: completamente desalinhado

Heurísticas:
- Pra **WhatsApp**, mensagens >800 caracteres ou vários parágrafos sem motivo são desvio.
- Pra **leigo**, jargão como "cota", "lance livre", "contemplação" sem explicação é desvio.
- Compare contra \`voiceTone\` da persona.

### 5. Assertividade (correção factual e decisões)
Se a informação dada está correta e se as decisões foram acertadas.
- 1.0: dados específicos têm origem em artifacts, tools usadas no momento certo, handoff acionado quando devia, não cita tópicos proibidos
- 0.5: lapsos não-críticos
- 0.0: alucinação clara, promete contemplação, fala tópico proibido, deixa de escalar quando precisava

Use \`numbersInTextFlagged\` — números citados pelo agente que não aparecem em nenhum
artifact. Cada um é um sinal forte de alucinação.
Use a lista \`forbiddenTopics\` da persona.

## Flags (booleanos)

Marque \`true\` quando:

- **hallucination**: agente inventou dado factual (número fabricado, prazo inventado,
  promessa de contemplação). Geralmente vem com assertividade < 0.5.
- **missedHandoff**: usuário deu sinais claros (frustração, dúvida complexa, pediu humano)
  e o agente não escalou.
- **incompleteDiscovery**: discovery < 0.4 — pulou coleta crítica antes de avançar.
- **lowEngagement**: engagement < 0.3 — usuário desengajou cedo, possivelmente por falha do agente.

## Output

Retorne JSON conforme schema. Para cada dimensão, dê \`score\` (0-1) e \`reasoning\`
(1-2 linhas em pt-BR, citando evidência específica).

- \`topIssues\`: até 3 strings curtas com problemas mais graves (ex: "Citou taxa 18% sem artifact-fonte").
- \`topStrengths\`: até 3 strings curtas com pontos fortes (ex: "Ajustou linguagem pra leigo").

Seja honesto e específico. Não dê 0.5 por preguiça — escolha entre 0.3-0.4 (mais ruim
que bom) ou 0.6-0.7 (mais bom que ruim) quando o caso for misto.

## Exemplo

Conversa: usuário leigo, persona "helena-imovel", 6 turnos. Agente acolheu, perguntou
sobre crédito antes de avançar, citou parcela "R$ 750" (presente em artifact
simulation_result), fechou com lead capturado.

Output esperado (estrutura):
{
  "dimensions": {
    "engajamento":   { "score": 0.9,  "reasoning": "Usuário respondeu todos os turnos e capturou lead." },
    "discovery":     { "score": 1.0,  "reasoning": "Coletou crédito e prazo antes de buscar grupos." },
    "continuidade":  { "score": 0.95, "reasoning": "Referenciou orçamento citado pelo user no Turn 3." },
    "naturalidade":  { "score": 0.85, "reasoning": "Tom didático, evitou jargão; uma resposta um pouco longa." },
    "assertividade": { "score": 1.0,  "reasoning": "Parcela R$ 750 ancorada em simulation_result. Sem alucinação." }
  },
  "flags": {
    "hallucination": false, "missedHandoff": false,
    "incompleteDiscovery": false, "lowEngagement": false
  },
  "topIssues": [],
  "topStrengths": ["Coleta natural de contexto", "Linguagem ajustada ao leigo"]
}`;

export type PersonaContext = {
	personaId: string | null;
	voiceTone: string | null;
	forbiddenTopics: string[];
};

export function buildJudgePrompt(args: {
	transcript: string;
	personas: PersonaContext[];
	signals: DeterministicSignals;
}): string {
	const { transcript, personas, signals } = args;

	return [
		"Avalie a conversa abaixo e retorne JSON conforme schema.",
		"",
		"=== TRANSCRIPT ===",
		transcript,
		"",
		"=== PERSONAS CONFIGURADAS ===",
		formatPersonas(personas),
		"",
		"=== SINAIS DETERMINÍSTICOS PRÉ-COMPUTADOS ===",
		formatSignals(signals),
		"",
		"Agora dê notas nas 5 dimensões, marque flags relevantes, e liste topIssues e",
		"topStrengths conforme as instruções do system prompt.",
	].join("\n");
}

function formatPersonas(personas: PersonaContext[]): string {
	if (personas.length === 0) {
		return "(nenhuma persona configurada)";
	}
	if (personas.length === 1) {
		return formatPersona(personas[0]);
	}
	return personas
		.map((p, i) => `--- Persona ${i + 1} de ${personas.length} ---\n${formatPersona(p)}`)
		.join("\n\n");
}

function formatPersona(p: PersonaContext): string {
	const lines = [
		`Persona ID: ${p.personaId ?? "(não definida)"}`,
		`Voice tone: ${p.voiceTone ?? "(não definida)"}`,
	];
	if (p.forbiddenTopics.length > 0) {
		lines.push("Tópicos proibidos:");
		for (const t of p.forbiddenTopics) lines.push(`  - ${t}`);
	} else {
		lines.push("Tópicos proibidos: (nenhum configurado)");
	}
	return lines.join("\n");
}

function formatSignals(s: DeterministicSignals): string {
	const lines = [
		`replyRate: ${s.replyRate.toFixed(2)} (taxa de resposta do usuário aos turnos do agente)`,
		`qualifyCoverage: ${s.qualifyCoverage.toFixed(2)} (fração agregada dos campos requeridos coletados em todas as categorias visitadas)`,
		`qualifyMissing: ${s.qualifyMissing.length > 0 ? s.qualifyMissing.join(", ") : "(nenhum)"}`,
		`dropOffGate: ${s.dropOffGate ?? "(n/a)"} (em qual gate o usuário parou)`,
		`conversionStage: ${s.conversionStage}`,
		`hasLead: ${s.hasLead ? "sim" : "não"} (dados suficientes pra contato — web exige email; whatsapp basta nome+telefone)`,
	];

	if (s.personaSegments.length > 1) {
		lines.push(`personaSegments: ${s.personaSegments.length} segmentos:`);
		for (const seg of s.personaSegments) {
			lines.push(`  - ${seg.personaId} (${seg.turnCount} turno(s))`);
		}
	} else if (s.personaSegments.length === 1) {
		lines.push(`personaSegments: 1 (persona única: ${s.personaSegments[0].personaId})`);
	} else {
		lines.push("personaSegments: (nenhum personaId atribuído — conversa legacy)");
	}

	if (s.numbersInTextFlagged.length === 0) {
		lines.push("numbersInTextFlagged: nenhum número citado sem fonte em artifact");
	} else {
		lines.push(`numbersInTextFlagged: ${s.numbersInTextFlagged.length} número(s) sem fonte:`);
		for (const f of s.numbersInTextFlagged.slice(0, 5)) {
			lines.push(`  - "${f.number}" no contexto: "${f.context}"`);
		}
	}

	return lines.join("\n");
}
