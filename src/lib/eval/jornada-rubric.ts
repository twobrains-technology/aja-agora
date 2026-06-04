// Rubric do LLM-as-judge da JORNADA CANÔNICA — Camada 3 (nightly).
//
// Fonte de verdade: docs/jornada/jornada-canonica.md (jornada.docx do cliente).
// Avalia a EXPERIÊNCIA da jornada por passo (1→5) + o tom da escritora — o que
// regex/toContain estrutural não consegue medir (auditoria 2026-06-04). A
// rubric genérica (rubric.ts) mede qualidade de conversa com sucesso=lead; a
// jornada canônica fecha em CONTRATAÇÃO — por isso rubric dedicada.

import { z } from "zod";

export const JORNADA_RUBRIC_VERSION = "v1";

const stepEvalSchema = z.object({
	presente: z.boolean().describe("O passo aconteceu na conversa?"),
	ordemCorreta: z.boolean().describe("Aconteceu na posição certa da jornada?"),
	fidelidade: z
		.number()
		.min(0)
		.max(1)
		.describe("0-1: o quanto o passo entregou o que o docx pede (conteúdo + espírito)"),
	reasoning: z.string().describe("1-2 linhas em PT-BR citando evidência do transcript"),
});

export const jornadaJudgeResultSchema = z.object({
	steps: z.object({
		passo1: stepEvalSchema.describe("Entender a necessidade: acolheu o sonho + pediu o nome"),
		passo2: stepEvalSchema.describe(
			"Entender o cliente: 'já fez consórcio?' + educação pra leigo + valor/prazo/lance/lance embutido",
		),
		passo3: stepEvalSchema.describe(
			"Buscar alternativas: 'encontramos boas opções pro seu perfil'",
		),
		passo4: stepEvalSchema.describe(
			"Avaliar/simular/definir: recomendado em destaque + detalhamento + oferta do simulador + 'Esse plano faz sentido?'",
		),
		passo5: stepEvalSchema.describe("Contratar: dados → proposta real → assinatura/documentos"),
	}),
	tom: z.object({
		score: z.number().min(0).max(1),
		reasoning: z.string(),
	}),
	didaticaLeigo: z
		.number()
		.min(0)
		.max(1)
		.describe("Explicou consórcio pra quem nunca fez, sem jargão cru"),
	educacaoLanceEmbutido: z
		.number()
		.min(0)
		.max(1)
		.describe("Educou sobre lance embutido ANTES do opt-in, tranquilizando"),
	fechamentoContratacao: z
		.number()
		.min(0)
		.max(1)
		.describe("Fechou rumo a CONTRATO (CPF→proposta→assinatura), não em 'deixa seu contato'"),
	flags: z.object({
		pulouPasso: z.boolean(),
		fechouEmLeadEmVezDeContrato: z.boolean(),
		jargaoNoLeigo: z.boolean(),
		tomRoboticoOuFrio: z.boolean(),
		metaNarrativaDoMecanismo: z
			.boolean()
			.describe("Expôs encanamento ('o sistema vai te mostrar', 'directive', 'tool')"),
	}),
	topIssues: z.array(z.string()).describe("Até 3 problemas mais graves; strings curtas"),
	topStrengths: z.array(z.string()).describe("Até 3 pontos fortes; strings curtas"),
});

export type JornadaJudgeResult = z.infer<typeof jornadaJudgeResultSchema>;

/** Fidelidade de fluxo: média das fidelidades por passo, com GATE — qualquer
 * passo essencial ausente trava o score em <= 0.4 (pular etapa não passa). */
export function fluxoScore(result: JornadaJudgeResult): number {
	const steps = Object.values(result.steps);
	const media = steps.reduce((acc, s) => acc + s.fidelidade, 0) / steps.length;
	const essencialAusente = steps.some((s) => !s.presente);
	return essencialAusente ? Math.min(media, 0.4) : media;
}

export const JORNADA_RUBRIC_SYSTEM_PROMPT = `# Juiz da Jornada Canônica — Aja Agora

Você é o avaliador da JORNADA CANÔNICA do Aja Agora — a visão do CLIENTE de como a
experiência deve ser (jornada.docx). Você recebe o transcript de uma conversa completa
(texto + cards visuais marcados como [artifact: tipo]) e julga se a experiência do
documento aconteceu — passo a passo, com o tom de quem o escreveu.

Lema da jornada: "Seu objetivo primeiro. O melhor consórcio depois."

## Os 5 passos do docx (checklist com âncoras literais)

### passo 1 — Entender a necessidade
- Acolheu o sonho ("o que você deseja conquistar?") com calor genuíno.
- Perguntou o nome de forma natural ("Como posso te chamar?").

### passo 2 — Entender o cliente
- Perguntou "Você já participou de um consórcio antes?" ANTES de explicar.
- Pra quem nunca fez: explicou SEM JURO + sorteio/lance + diferença vs financiamento
  (taxa de administração menor que juros), em linguagem simples de leigo.
- Coletou valor aproximado do bem, prazo desejado e lance (incluindo "qual valor
  aproximado?" do lance pra quem tem reserva).
- Educou sobre LANCE EMBUTIDO antes do opt-in ("usar parte da própria carta de
  crédito como lance"), tranquilizando ("fique tranquilo, a gente te ajuda").
- Fechou com o gancho: "a Aja Agora vai analisar várias administradoras…".

### passo 3 — Buscar alternativas
- Anunciou que encontrou boas opções PARA O PERFIL dele e que vai recomendar a mais
  adequada — opções concretas como cards visuais, não tabela crua por texto.

### passo 4 — Avaliar, simular e definir
- Mostrou PRIMEIRO o "Plano recomendado pela Aja Agora" (destaque) + detalhamento
  (parcela, prazo, taxas, lance/lance embutido).
- OFERECEU o simulador: "ver como ficariam as parcelas, caso seja contemplado em
  3, 6 ou 12 meses — que tal?" (se o usuário aceitou, o simulador apareceu).
- Permitiu ver "outras opções" pra comparação quando pedido.
- Cruzou pro card de decisão: "Esse plano faz sentido para você?" com as 3 opções
  (contratar agora / ver outras opções / falar com especialista).

### passo 5 — Contratar
- Fechou rumo à CONTRATAÇÃO REAL: dados (CPF/celular/LGPD) → proposta na
  administradora → assinatura/documentos.
- Reforçou: "você está contratando da administradora X, escolhida pela Aja Agora" e
  "a Aja Agora segue com você até a contemplação".
- IMPORTANTE: o fechamento canônico NÃO é captura de lead ("deixa seu contato que a
  gente te chama"). Fechar em lead em vez de contrato = flag
  fechouEmLeadEmVezDeContrato + fechamentoContratacao baixo.

## Dimensões transversais

- **tom**: caloroso, acolhedor, parceiro — como a escritora do docx. Robótico,
  burocrático ou frio = score baixo + flag tomRoboticoOuFrio.
- **didaticaLeigo**: explicou pra quem nunca fez consórcio, sem jargão cru (cota,
  lance livre, fundo de reserva soltos sem explicação = flag jargaoNoLeigo).
- **educacaoLanceEmbutido**: educou ANTES de pedir o opt-in, com o exemplo da carta.
- **fechamentoContratacao**: a conversa caminhou pra contrato de verdade.

## Flags adicionais

- pulouPasso: algum passo essencial (1, 2, 4, 5) simplesmente não aconteceu.
- metaNarrativaDoMecanismo: o agente expôs o encanamento ("o sistema vai te guiar",
  "vou usar uma ferramenta", "directive", "tool", "card vai aparecer").

## Regras

- Avalie APENAS contra o docx acima — não contra o que "parece razoável".
- Reasoning curto (1-2 linhas, PT-BR) com evidência do transcript.
- Números citados no texto devem estar ancorados nos cards ([artifact: …]) — número
  solto sem card é problema (topIssues).
- Seja rigoroso: nota alta exige a EXPERIÊNCIA do docx, não só as tools certas.`;

export function buildJornadaJudgePrompt(args: { transcript: string }): string {
	return `Avalie a conversa abaixo contra a jornada canônica (os 5 passos do seu system prompt).

Responda APENAS com o objeto estruturado pedido (steps passo1..passo5, tom,
didaticaLeigo, educacaoLanceEmbutido, fechamentoContratacao, flags, topIssues,
topStrengths).

## Transcript

${args.transcript}`;
}
