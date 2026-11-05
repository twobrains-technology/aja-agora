// Teste de sincronia da rubrica (Bloco C, D-0083).
//
// O juiz online (`scripts/langfuse-judge-online.ts`) carrega a MESMA rubrica
// do juiz offline (`src/lib/eval/rubric.ts` → `RUBRIC_SYSTEM_PROMPT`), portada
// com um ÚNICO conjunto de ajustes conhecidos. Este teste aplica esses ajustes
// ao texto offline e exige que o resultado seja IGUAL ao `PROMPT_DO_JUIZ`.
//
// O que é "ajuste de turno": o juiz offline vê a conversa INTEIRA (transcript
// + sinais determinísticos pré-computados como objetos — `replyRate`,
// `numbersInTextFlagged`, flags booleans); o juiz online vê UM TURNO (input =
// system da caixa de prompt + histórico + tools; output = a fala do vendedor)
// e devolve um único score NUMERIC (a média das 5 dimensões), porque o
// evaluator da instância do Langfuse só emite um número. Logo, as ÚNICAS
// divergências permitidas entre os dois textos são as que refletem essa
// diferença de janela e de formato de saída: sinais nomeados viram referência
// ao histórico/ferramenta, "transcript" vira "histórico", o exemplo e a seção
// de Output mudam de formato (JSON estruturado → score único), a seção
// multi-persona (que depende do marcador de transição do transcript completo)
// sai, e o texto de tarefa muda de "dar notas nas dimensões" para "devolver a
// média como score".
//
// O teste é tolerante APENAS a estes trechos, listados abaixo na ordem em que
// aparecem. Qualquer divergência fora da lista — inclusive mudanças na seção
// "Regras de conduta do dono (v2)", que é comum aos dois — falha. Quando uma
// das rubricas mudar de propósito, aplique a mesma mudança nas duas fontes
// (ou, se for um ajuste de turno novo, registre o par aqui com o motivo).
import { describe, expect, it } from "vitest";
import { RUBRIC_SYSTEM_PROMPT } from "../src/lib/eval/rubric";
import { PROMPT_DO_JUIZ } from "./langfuse-judge-online";

type Ajuste = { offline: string; online: string; motivo: string };

const AJUSTES_DE_TURNO: Ajuste[] = [
	{
		// O offline mede conversão pelo scorer; o online não tem scorer no turno.
		motivo: "fala de conversão: scorer do offline → 'fora deste julgamento'",
		offline: "conversão já mede isso deterministicamente (ela vem do scorer, não de você).",
		online: "conversão é medida deterministicamente fora deste julgamento.",
	},
	{
		motivo: "tarefa: juiz offline lê a conversa toda; o online recebe UM TURNO e devolve a média",
		offline: `Sua tarefa: dar nota de 0 a 1 em **5 dimensões** da conversa, com reasoning curto (1-2
linhas em português) citando evidência específica do transcript.`,
		online: `Você recebe UM TURNO da conversa: o INPUT do vendedor (system da caixa de prompt +
histórico + definição das ferramentas) e o OUTPUT (a fala que ele produziu). Dê nota de
0 a 1 em **5 dimensões** do turno, com reasoning curto (1-2 linhas em português) citando
evidência específica do texto, e devolva como SCORE a MÉDIA das 5 dimensões.`,
	},
	{
		motivo:
			"sinais determinísticos pré-computados (offline) → resultado de ferramenta no histórico (online)",
		offline: `condução, mesmo quando a frase é educada e o tom é ótimo. Se os SINAIS DETERMINÍSTICOS
abaixo trouxerem um alerta, ele é FATO do servidor: leve-o em conta em vez de contorná-lo.`,
		online: `condução, mesmo quando a frase é educada e o tom é ótimo. Se o input trouxer resultado de
ferramenta, ele é FATO do servidor: leve-o em conta em vez de contorná-lo.`,
	},
	{
		motivo: "handoff: marcado no transcript (offline) → visível no histórico (online)",
		offline: `REGRA CRÍTICA: você avalia **apenas o agente IA**. Se a conversa virou handoff humano
em algum ponto (indicado no transcript), ignore os turnos pós-handoff e foque só nas
decisões do agente.`,
		online: `REGRA CRÍTICA: você avalia **apenas o agente IA**. Se o histórico mostrar que a conversa
virou handoff humano em algum ponto, ignore os turnos pós-handoff e foque só nas decisões
do agente.`,
	},
	{
		motivo:
			"multi-persona depende do marcador de transição do transcript completo — não existe no turno",
		offline: `## Conversas multi-persona

Esta conversa pode ter passado por mais de uma persona (ex: concierge → especialista
de imóvel → especialista de auto). O transcript marca cada transição com
"[--- Transição: persona muda de X para Y a partir do Turn N ---]". Avalie cada
segmento contra a persona correspondente (nome, categoria e expertise da persona
ativa naquele segmento). Em **Continuidade**, considere também a suavidade da
transição em si (o agente fez bridge claro? perdeu contexto coletado antes?).\n\n`,
		online: "",
	},
	{
		motivo: "engajamento: sinais nomeados (replyRate/dropOffGate) → leitura do histórico",
		offline: `Use o sinal \`replyRate\` (taxa de resposta) e \`dropOffGate\` (em que momento o usuário
parou). Se a conversa fechou com lead capturado, considere ≥ 0.85 mesmo com replyRate
abaixo de 1 — o engajamento foi suficiente pro objetivo.`,
		online: `Se o histórico mostrar que a conversa fechou com lead capturado, considere ≥ 0.85 mesmo
com respostas rascas — o engajamento foi suficiente pro objetivo.`,
	},
	{
		motivo: "discovery: sinais nomeados (qualifyCoverage/qualifyMissing) não chegam ao juiz online",
		offline:
			"Use `qualifyCoverage` e `qualifyMissing` (campos requeridos por categoria não coletados).\n",
		online: "",
	},
	{
		motivo: "continuidade: 'transcript' → 'histórico'",
		offline: "Se a conversa foi coerente. Sem sinal determinístico — leia o transcript.",
		online: "Se a conversa foi coerente. Sem sinal determinístico — leia o histórico.",
	},
	{
		motivo: "assertividade: 'artifacts, tools' → 'resultados de ferramenta do histórico'",
		offline:
			"- 1.0: dados específicos têm origem em artifacts, tools usadas no momento certo, handoff acionado quando devia, não cita tópicos proibidos",
		online: `- 1.0: dados específicos têm origem em resultados de ferramenta do histórico, ferramentas
  usadas no momento certo, handoff acionado quando devia, não cita tópicos proibidos`,
	},
	{
		motivo: "número sem fonte: sinal nomeado (numbersInTextFlagged) → leitura do histórico",
		offline: `Use \`numbersInTextFlagged\` — números citados pelo agente que não aparecem em nenhum
artifact. Cada um é um sinal forte de alucinação.`,
		online: `Número citado que não aparece em nenhum resultado de ferramenta do histórico é sinal forte
de alucinação.`,
	},
	{
		motivo: "flags: booleans de saída (offline) → peso no score único (online)",
		offline: "## Flags (booleanos)\n\nMarque `true` quando:",
		online: "## Flags (peso no score, quando cabem)",
	},
	{
		motivo: "output: JSON estruturado por dimensão (offline) → score único = média (online)",
		offline: `Retorne JSON conforme schema. Para cada dimensão, dê \`score\` (0-1) e \`reasoning\`
(1-2 linhas em pt-BR, citando evidência específica).

- \`topIssues\`: até 3 strings curtas com problemas mais graves (ex: "Citou taxa 18% sem artifact-fonte").
- \`topStrengths\`: até 3 strings curtas com pontos fortes (ex: "Ajustou linguagem pra leigo").

Seja honesto e específico. Não dê 0.5 por preguiça — escolha entre 0.3-0.4 (mais ruim
que bom) ou 0.6-0.7 (mais bom que ruim) quando o caso for misto.`,
		online: `SCORE = média aritmética das 5 dimensões (0 a 1). REASONING: 1-2 linhas em pt-BR, citando
a dimensão mais fraca e a evidência específica. Seja honesto e específico. Não dê 0.5 por
preguiça — escolha entre 0.3-0.4 (mais ruim que bom) ou 0.6-0.7 (mais bom que ruim) quando
o caso for misto.`,
	},
	{
		motivo: "exemplo: saída por dimensão com JSON (offline) → score único (online)",
		offline: `Conversa: usuário leigo, persona "helena-imovel", 6 turnos. Agente acolheu, perguntou
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
}`,
		online: `INPUT: histórico onde o usuário disse "quero uma moto por até R$ 300 de parcela".
OUTPUT: agente acolhe, pergunta crédito/pentrada antes de buscar grupos e cita parcela
"R$ 290" vinda de resultado de ferramenta.

Output esperado: score ≈ 0.94 (0.9/1.0/0.95/0.85/1.0), reasoning citando a coleta natural
e a parcela ancorada na ferramenta.`,
	},
];

function aplicarAjustes(texto: string): string {
	let atual = texto;
	for (const ajuste of AJUSTES_DE_TURNO) {
		if (!atual.includes(ajuste.offline)) {
			throw new Error(
				`Ajuste de turno não encontrado no texto offline (a rubrica mudou?): "${ajuste.motivo}"`,
			);
		}
		atual = atual.replace(ajuste.offline, ajuste.online);
	}
	return atual;
}

describe("sincronia da rubrica — juiz offline × juiz online", () => {
	it("as duas rubricas são iguais além dos ajustes de turno documentados", () => {
		expect(aplicarAjustes(RUBRIC_SYSTEM_PROMPT)).toBe(PROMPT_DO_JUIZ);
	});

	it("as cinco regras de conduta do dono estão nas duas rubricas, sem divergência", () => {
		const regras = [
			"## Regras de conduta do dono (v2)",
			"Fale da carta pelo que o cliente vê no card",
			"Compare e recomende UMA carta, com o porquê em números da cota",
			"Correção sem confissão",
			"Retomada leva algo novo",
			"Carinho é reconhecer antes de pedir",
		];
		for (const regra of regras) {
			expect(RUBRIC_SYSTEM_PROMPT).toContain(regra);
			expect(PROMPT_DO_JUIZ).toContain(regra);
		}
	});
});
