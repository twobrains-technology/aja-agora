// Rubric do LLM-as-judge da JORNADA CANÔNICA — Camada 3 (nightly).
//
// Fonte de verdade: docs/jornada/jornada-canonica.md (jornada.docx do cliente).
// Avalia a EXPERIÊNCIA da jornada por passo (1→5) + o tom da escritora — o que
// regex/toContain estrutural não consegue medir (auditoria 2026-06-04). A
// rubric genérica (rubric.ts) mede qualidade de conversa com sucesso=lead; a
// jornada canônica fecha em CONTRATAÇÃO — por isso rubric dedicada.

import { z } from "zod";

export const JORNADA_RUBRIC_VERSION = "v2";

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
	reforcosPasso5: z
		.number()
		.min(0)
		.max(1)
		.describe(
			"v2: os 2 reforços literais do docx no fechamento ('escolhida pela Aja Agora para o seu perfil' + 'segue com você até a contemplação e depois dela')",
		),
	assinaturaSemTrocarEmpresa: z
		.number()
		.min(0)
		.max(1)
		.describe(
			"v2: encaminhou pra assinatura digital da administradora SEM o cliente sentir que 'mudou de empresa' (continuidade de voz da Aja Agora)",
		),
	flags: z.object({
		pulouPasso: z.boolean(),
		fechouEmLeadEmVezDeContrato: z.boolean(),
		jargaoNoLeigo: z.boolean(),
		tomRoboticoOuFrio: z.boolean(),
		metaNarrativaDoMecanismo: z
			.boolean()
			.describe("Expôs encanamento ('o sistema vai te mostrar', 'directive', 'tool')"),
		faltaramReforcos: z
			.boolean()
			.describe("v2: os reforços literais do passo 5 não apareceram no fechamento"),
		faltouParabens: z
			.boolean()
			.describe("v2: o 'Parabéns! Agora você está oficialmente mais perto…' não apareceu"),
		faltouResumoContratacao: z
			.boolean()
			.describe("v2: o resumo da contratação (WhatsApp) não foi enviado nem sinalizado"),
	}),
	topIssues: z.array(z.string()).describe("Até 3 problemas mais graves; strings curtas"),
	topStrengths: z.array(z.string()).describe("Até 3 pontos fortes; strings curtas"),
});

export type JornadaJudgeResult = z.infer<typeof jornadaJudgeResultSchema>;

/** Fidelidade de fluxo: média das fidelidades por passo, com GATE — passo
 * essencial AUSENTE ou FORA DE ORDEM trava o score em <= 0.4. A ordem É o
 * fluxo do docx (v2): explicar depois de buscar, ou contratar antes de
 * simular, não é a jornada — é outra coisa. */
export function fluxoScore(result: JornadaJudgeResult): number {
	const steps = Object.values(result.steps);
	const media = steps.reduce((acc, s) => acc + s.fidelidade, 0) / steps.length;
	const quebrouFluxo = steps.some((s) => !s.presente || !s.ordemCorreta);
	return quebrouFluxo ? Math.min(media, 0.4) : media;
}

export const JORNADA_RUBRIC_SYSTEM_PROMPT = `# Juiz da Jornada Canônica — Aja Agora

Você é o avaliador da JORNADA CANÔNICA do Aja Agora — a visão do CLIENTE de como a
experiência deve ser (jornada.docx). Você recebe o transcript de uma conversa completa
(linhas USUÁRIO/AGENTE + cards visuais descritos entre colchetes com o CONTEÚDO que o
usuário viu) e julga se a experiência do documento aconteceu — passo a passo, com o
tom de quem o escreveu.

Lema da jornada: "Seu objetivo primeiro. O melhor consórcio depois."

## Os 5 passos do docx (checklist com âncoras literais)

### passo 1 — Entender a necessidade
- Acolheu o sonho ("o que você deseja conquistar?") com calor genuíno.
- Perguntou o nome de forma natural ("Como posso te chamar?").
- Ponte pro passo 2: "precisamos fazer mais algumas perguntinhas para buscar o melhor
  consórcio" (com "de cerca de X" quando o usuário já disse o valor).

### passo 2 — Entender o cliente
- Perguntou "Você já participou de um consórcio antes?" ANTES de explicar.
- Pra quem nunca fez: explicou SEM JURO + sorteio/lance + diferença vs financiamento
  (taxa de administração menor que juros), em linguagem simples de leigo — e seguiu
  com o botão "Entendi, pode continuar" (literal do docx).
- Coletou valor aproximado do bem, prazo desejado e lance (incluindo "qual valor
  aproximado?" do lance pra quem tem reserva).
- Educou sobre LANCE EMBUTIDO antes do opt-in ("usar parte da própria carta de
  crédito como lance", com o exemplo da carta de R$ 100 mil), tranquilizando
  ("fique tranquilo, a gente te ajuda").
- Fechou com o gancho: "a Aja Agora vai analisar várias administradoras…".
- DECISÃO DOCUMENTADA D1 (não punir ordem): a coleta de CPF + celular + aceite
  LGPD acontece ao FIM do passo 2, no gancho acima — a administradora NÃO simula
  oferta real sem CPF (exigência técnica registrada em docs/jornada/CONTEXT.md).
  O docx posiciona "dados pessoais" no passo 5; a antecipação do CPF é decisão
  aprovada — avalie a ordem dos passos considerando isso (não é quebra de fluxo).

### passo 3 — Buscar alternativas
- Anunciou que encontrou boas opções PARA O PERFIL dele e que vai recomendar a mais
  adequada — opções concretas como cards visuais, não tabela crua por texto.

### passo 4 — Avaliar, simular e definir
- Mostrou PRIMEIRO o "Plano recomendado pela Aja Agora" (destaque) + detalhamento
  (parcela, prazo, taxas, lance/lance embutido).
- Resumo por opção com os campos DISPONÍVEIS da oferta real: valor da carta, parcela,
  prazo total, tipo de grupo, lance/lance embutido e contemplados/mês.
  LIMITAÇÃO DE FONTE (não punir): reputação da administradora e histórico de
  contemplações por assembleia NÃO existem na oferta da administradora — a fonte
  não fornece esses dados. Exibi-los inventados seria erro GRAVE; a ausência deles
  não desconta nota.
- OFERECEU o simulador: "ver como ficariam as parcelas, caso seja contemplado em
  3, 6 ou 12 meses — que tal?" (se o usuário aceitou, o simulador apareceu com os
  dados REAIS do plano).
- Permitiu ver "outras opções" (as outras 2) pra comparação quando pedido — sem
  repetir a recomendada.
- Cruzou pro card de decisão: "Esse plano faz sentido para você?" com as 3 opções
  (contratar agora / ver outras opções / falar com especialista da Aja Agora).

### passo 5 — Contratar
- Fechou rumo à CONTRATAÇÃO REAL: dados (CPF/celular/LGPD) → proposta na
  administradora → carta real confirmada → assinatura digital → documentos.
- REFORÇOS LITERAIS (avalie em reforcosPasso5; ausência = flag faltaramReforcos):
  "você está contratando um consórcio da administradora X, escolhida pela Aja Agora
  para o seu perfil" E "a Aja Agora segue com você até a contemplação e depois dela".
- Encaminhou pra assinatura digital sem o cliente sentir que "mudou de empresa"
  (avalie em assinaturaSemTrocarEmpresa) — a voz continua sendo da Aja Agora, o
  link da administradora é apresentado como continuidade.
- Enviou o RESUMO DA CONTRATAÇÃO por WhatsApp (administradora, grupo, carta,
  parcela, link de assinatura) — ausência total = flag faltouResumoContratacao.
- Fechou com o literal "Parabéns! Agora você está oficialmente mais perto da sua conquista!"
  — ausência = flag faltouParabens.
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
- **reforcosPasso5** e **assinaturaSemTrocarEmpresa**: ver passo 5 acima.

## Flags adicionais

- pulouPasso: algum passo essencial (1, 2, 4, 5) simplesmente não aconteceu.
- metaNarrativaDoMecanismo: o agente expôs o encanamento ("o sistema vai te guiar",
  "vou usar uma ferramenta", "directive", "tool", "card vai aparecer").
- faltaramReforcos / faltouParabens / faltouResumoContratacao: ver passo 5.

## Regras

- Avalie APENAS contra o docx acima — não contra o que "parece razoável".
- ordemCorreta importa tanto quanto presente: passo essencial fora de ordem quebra
  o fluxo do docx (o score de fluxo trava baixo).
- Reasoning curto (1-2 linhas, PT-BR) com evidência do transcript.
- Números citados no texto devem estar ancorados nos cards descritos — número
  solto sem card é problema (topIssues).
- Seja rigoroso: nota alta exige a EXPERIÊNCIA do docx, não só as tools certas.`;

export function buildJornadaJudgePrompt(args: { transcript: string }): string {
	return `Avalie a conversa abaixo contra a jornada canônica (os 5 passos do seu system prompt).

Responda APENAS com o objeto estruturado pedido (steps passo1..passo5, tom,
didaticaLeigo, educacaoLanceEmbutido, fechamentoContratacao, reforcosPasso5,
assinaturaSemTrocarEmpresa, flags, topIssues, topStrengths).

## Transcript

${args.transcript}`;
}
