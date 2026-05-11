# Plano do Eval — Avaliação de Conversas do Agente

> Documento técnico. Descreve **como** o sistema de avaliação foi construído:
> arquitetura, decisões, estrutura no código, fluxo de execução, cuidados.
> Companheiros: [`agent-eval-avaliacao.md`](./agent-eval-avaliacao.md) (visão e
> ciclo de melhoria) e [`agent-eval-playbook.md`](./agent-eval-playbook.md)
> (regras condicionais — fase futura).

---

## 1. Por que existe

O Aja Agora coloca um agente IA na frente do cliente em toda a jornada — do primeiro "quero comprar um carro" até a captura de lead. Esse agente toma decisões em tempo real: que pergunta fazer, que grupo recomendar, quando passar pra humano.

Antes desse sistema, **não havia jeito objetivo de saber se uma conversa foi boa ou ruim**. O time descobria problema:

- Quando o cliente reclamava
- Olhando caso a caso (não escala)
- Quando o lead não fechava (tarde demais)

O eval entrega o que faltava: **uma nota estruturada por conversa** com detalhamento por dimensão e flags acionáveis. Em segundos, o admin sabe quais conversas merecem atenção e por quê.

---

## 2. O que faz, em uma frase

Quando uma conversa do agente IA encerra (ou fica parada por bastante tempo), um modelo de IA lê o histórico, junta com sinais que a gente computa automaticamente (taxa de resposta, números citados, campos coletados) e devolve um JSON estruturado com **6 notas de 0 a 1**, **4 flags binárias** e **listas de problemas e pontos fortes**. Isso vira badge colorido na lista de conversas e detalhamento completo no drawer da conversa.

---

## 3. As 6 dimensões

Cada uma vira nota 0-1 com um motivo curto que justifica a nota. A nota geral é a **média ponderada das 6**.

### Engajamento — sinal do usuário

Mede o quanto o usuário se manteve ativo. Não é sobre o agente diretamente, mas sobre o que o agente provocou.

- **1.0** — usuário respondeu a todos os turnos do agente, conversa avançou até o objetivo
- **0.0** — usuário sumiu cedo, mensagens ficaram cada vez mais curtas, agente falou sozinho

A gente já calcula `replyRate` (turnos do user ÷ turnos do agente) e injeta como sinal pro juiz junto com a posição em que parou (qual gate?) e se virou lead. O juiz combina esses sinais com o transcript pra decidir: o abandono foi por falha do agente ou natural?

### Discovery — coleta de contexto

Mede se o agente coletou as informações necessárias antes de avançar pra recomendação. Por categoria, os campos esperados são:

- **imóvel**: faixa de crédito + prazo
- **auto**: faixa de crédito + se tem reserva pra lance
- **serviços**: faixa de crédito

A gente computa `qualifyCoverage` (campos preenchidos ÷ esperados) e o juiz avalia também a **forma**: as perguntas foram naturais, ou agente martelou? Agente ignorou informação que o user já tinha dado?

### Continuidade — coerência turno-a-turno

Não tem sinal determinístico. O juiz lê o transcript inteiro e avalia: agente referenciou o que foi dito antes? Repetiu pergunta já respondida? As transições entre tópicos foram suaves? Abandonou alguma thread no meio?

### Naturalidade — tom, canal, persona

Mede se o tom condiz com a persona configurada no admin (voz consultiva, didática, etc.) e se a forma respeita o canal:

- **WhatsApp**: mensagens longas (>800 chars) são desvio
- **Web**: tem mais espaço, mas ainda precisa fazer sentido
- **Leigo**: jargão como "cota", "lance livre", "contemplação" sem explicação é desvio

A persona configurada (`voiceTone`, `forbiddenTopics`, `examples`) é injetada como referência pro juiz.

### Assertividade — correção factual e decisões

Mede se a informação dada é correta e se as decisões foram acertadas. É a dimensão mais crítica em fintech.

- **1.0** — números citados (parcela, taxa, prazo) têm origem em algum artifact persistido (quer dizer que vieram de uma tool, não foram inventados); tools usadas no momento certo; handoff acionado quando devia; nenhum tópico proibido apareceu
- **0.0** — citou número sem fonte, prometeu contemplação, deu conselho jurídico, deixou de escalar pra humano quando o cliente claramente precisava

A gente faz cross-check determinístico: pega todos os números no texto do agente (R$ X, Y%) e confere se algum artifact da conversa contém esse valor. Se citou e não tem fonte, é flag forte de alucinação.

### Conversão — outcome

Diferente das outras: **100% determinística, sem juiz**. A gente lê direto do banco:

- `qualificado` ou superior + lead capturado → 1.0
- `qualificado` sem lead → 0.7
- `engajado` com lead → 0.6
- `engajado` sem lead → 0.4
- `novo` → 0.0
- `perdido` → 0.1 (não é zero — agente tentou, só não rolou)

---

## 4. As 4 flags

São alertas vermelhos que disparam quando algo crítico acontece. Aparecem em destaque na UI.

| Flag | Quando dispara | Como detecta |
|---|---|---|
| **`hallucination`** | Agente inventou dado factual | Juiz marca **OU** cross-check pega número sem fonte (defesa em depth) |
| **`missedHandoff`** | Cliente pediu humano e agente insistiu | Juiz analisa transcript |
| **`incompleteDiscovery`** | Pulou coleta crítica antes de avançar | Discovery < 0.4 **OU** juiz marca |
| **`lowEngagement`** | Cliente desengajou cedo | Engajamento < 0.3 **OU** juiz marca |

A combinação "juiz **OU** threshold determinístico" garante que erros óbvios (números sem fonte) sempre flagguem mesmo se o juiz relaxar.

---

## 5. Quando uma conversa é avaliada

Pra evitar avaliar conversas sem material ("oi") ou em curso (que ainda vão mudar), a gente tem regras de elegibilidade.

### Regras de elegibilidade

Pra ser elegível, a conversa precisa:

1. Ter pelo menos **4 turnos do usuário** — abaixo disso não há texto suficiente pra julgar continuidade, naturalidade, etc.
2. Estar **parada há tempo suficiente**:
   - `active` ou `closed` → ≥ 12h sem nova mensagem
   - `handed_off` → ≥ 48h sem nova mensagem (caso o atendente esqueça de fechar)

### Os triggers (quem dispara o cálculo)

| Trigger | Como funciona | Estado padrão |
|---|---|---|
| **Manual** (botão "Avaliar agora" no admin) | Admin clica, dispara na hora. Bypassa a regra de inatividade — admin sabe o que tá fazendo. | Sempre disponível |
| **Síncrono pós-`handoffToAgents()`** | Único trigger automático: dispara no momento em que o atendente é chamado. Vale pra Web (submit do form de lead em `/api/leads`) e pra WhatsApp (após `startInterestHandoff` enviar a notificação aos atendentes). Bypassa inatividade. | Sempre ligado |

A escolha do handoff como único trigger automático é proposital: é o momento que naturalmente marca o fim do trabalho da IA — daí em diante o humano assume. Captura de lead sem handoff (rara) e fechamento de handoff (que é só admin) não disparam, evitando ruído. Conversas que nunca chegam ao handoff dependem de reavaliação manual pelo admin.

---

## 6. Como o cálculo funciona, passo a passo

```
[entrada: conversationId]
   ↓
1. Carrega conversa do banco
   - mensagens (ordenadas por createdAt)
   - artifacts (group_card, simulation_result, etc.)
   - lead (se houver)
   - metadata (currentPersona, currentCategory, qualifyAnswers)
   ↓
2. Verifica elegibilidade
   - Se < 4 turnos do user OU idle insuficiente → retorna { skipped, reason }
   ↓
3. Computa SINAIS DETERMINÍSTICOS (sem LLM)
   - replyRate
   - qualifyCoverage por categoria
   - numbersInTextFlagged (cross-check números × artifacts)
   - dropOffGate (qual gate estava pendente quando user parou)
   - conversionStage e hasLead (do banco)
   ↓
4. Constrói TRANSCRIPT formatado pro juiz
   - Mensagens numeradas + role + timestamp
   - Artifacts inline na mesma "turn" do agente
   - Janela 5+35 (5 primeiros + 35 últimos) se conversa > 40 turnos
   - Aviso se status indica handoff (juiz ignora turnos pós-handoff)
   ↓
5. Carrega PERSONA CONTEXT
   - voiceTone, forbiddenTopics (filtrados pelos enabled)
   ↓
6. Chama JUIZ LLM (Claude Sonnet 4.6 via generateObject)
   - System prompt = rubric (com 5 dimensões — sem conversao)
   - User prompt = transcript + persona + signals
   - Output = JSON estruturado validado por Zod
   - 1 retry com backoff em caso de erro de network/parse
   ↓
7. Calcula CONVERSÃO determinístico
   - Pega lead.stage, calcula 0-1 conforme tabela
   - Não passa pelo juiz
   ↓
8. Aplica BACKSTOPS em flags
   - hallucination = juiz.hallucination OR (numbersInTextFlagged.length > 0)
   - lowEngagement = juiz.lowEngagement OR (engajamento < 0.3)
   - incompleteDiscovery = juiz.incompleteDiscovery OR (discovery < 0.4)
   - missedHandoff = juiz.missedHandoff (sem backstop)
   ↓
9. Calcula OVERALL SCORE
   - Média simples das 6 dimensões
   ↓
10. Salva linha em `conversation_evaluations`
    - dimensions, flags, overallScore, topIssues, topStrengths
    - tokensInput, tokensOutput, judgeModel, rubricVersion
    - evaluatedUntilMessageId (pra detectar conversa "ressuscitando")
    - error (se algo falhou)
   ↓
[saída: { evaluationId, overallScore }]
```

---

## 7. Arquitetura do código

```
src/lib/eval/
├── types.ts             # Schemas Zod do EvalResult canônico
├── signals.ts           # Sinais determinísticos (replyRate, números, etc.)
├── transcript.ts        # Formata conversa pro juiz (janela, handoff cutoff)
├── rubric.ts            # System prompt do juiz + buildJudgePrompt
├── judge.ts             # Chamada generateObject com retry
├── eligibility.ts       # Regras de quem é elegível
├── scorer-internals.ts  # Helpers puros (cálculo de conversão, flags)
├── scorer-pipeline.ts   # Orquestração pura (sem DB) — usa fixtures e mocks
├── scorer.ts            # Entry público — load DB → pipeline → save
├── fixtures.ts          # 5 cenários canônicos pra calibração (inclui multi-persona)
├── calibration.ts       # Roda fixtures, mede concordância
└── README.md            # Docs do módulo
```

A separação **pipeline puro** vs **scorer com DB** existe pra:

- Permitir **testes** sem mock pesado de banco (chamando o pipeline com dados em memória)
- Permitir **calibração** rodando fixtures contra o juiz real sem nenhum I/O

### Endpoints

```
src/app/api/admin/conversations/[id]/eval/route.ts
   GET  → retorna eval mais recente da conversa (ou 404)
   POST → dispara nova avaliação manual (com forceImmediate)
```

### UI

```
src/components/admin/conversations/
├── evaluation-badge.tsx   # Badge colorido na lista (verde/amarelo/vermelho/cinza)
└── evaluation-panel.tsx   # Drawer com overall + 6 dimensões + flags + diagnóstico
```

A coluna "Qualidade" foi adicionada à tabela de conversas. A aba "Qualidade" foi adicionada ao drawer existente da conversa.

### Tabela `conversation_evaluations`

```sql
conversation_evaluations
├── id (uuid)
├── conversation_id (FK → conversations, on delete cascade)
├── persona_id (text, nullable)             -- snapshot da persona avaliada
├── persona_version (int, nullable)
├── rubric_version (text)                   -- "v1"
├── judge_model (varchar 100)               -- "claude-sonnet-4-6"
├── overall_score (numeric 3,2)             -- 0.00-1.00
├── dimensions (jsonb)                      -- {engajamento: {score, reasoning}, ...}
├── flags (jsonb)                           -- {hallucination, missedHandoff, ...}
├── top_issues (jsonb)                      -- string[]
├── top_strengths (jsonb)                   -- string[]
├── tokens_input (int)
├── tokens_output (int)
├── evaluated_until_message_id (uuid, FK)   -- pra detectar conversa que voltou à vida
├── evaluated_at (timestamp tz)
└── error (text, nullable)                  -- se o juiz falhou, registra
```

Index em `(conversation_id, evaluated_at desc)` pra pegar a mais recente em uma query.

---

## 8. Stack utilizada

Tudo já existia no projeto antes — zero dependência nova foi adicionada (só Vitest pra testes).

| Pra que | Ferramenta |
|---|---|
| Tabela de evals | Drizzle ORM + PostgreSQL |
| Chamada do juiz (LLM-as-judge) | Vercel AI SDK 6 — `generateObject` |
| Provider | `@ai-sdk/anthropic` — Claude Sonnet 4.6 |
| Schema do output | Zod |
| API routes | Next.js 16 App Router |
| Auth admin | `requireRole` (já existente) |
| UI | shadcn/ui (já existente) |
| Testes | Vitest 4.1 (instalado pra esse trabalho) |

---

## 9. Decisões importantes (e por quê)

| # | Decisão | Por quê |
|---|---|---|
| D1 | Avaliar conversa **encerrada por inatividade**, não por status `closed` | `closed` só cobre handoffs fechados manualmente — perderíamos 90% do volume |
| D2 | Mínimo de 4 turnos do user | Abaixo disso não há material pra julgar (uma conversa de "oi" + "quero carro" não dá pra avaliar continuidade ou naturalidade) |
| D3 | Em handoff, transcript marca onde a IA parou | Não atribuir trabalho do humano à IA |
| D4 | Triggers manuais bypassam inatividade | Admin sabe o que tá fazendo; idle é regra pra batch automático |
| D5 | Re-avaliação substitui anterior | Mais simples; histórico de evals não é prioridade hoje |
| D6 | Rubric hardcoded v1 | Evita over-engineering antes de calibrar |
| D7 | Modelo Sonnet 4.6 | Naturalidade e continuidade pedem juiz capaz; volume baixo no início — custo aceitável |
| D8 | PII trafega in-clear pro juiz | Política Anthropic de no-training em API. Reavaliar se trocar de provider |
| D9 | Conversão sai do escopo do juiz | Lookup puro do banco; juiz não acrescenta nada |
| D10 | Sem batch automático em massa; só síncronos + manual | Volume controlado por design — só dispara em marcos reais (handoff fechado, lead capturado) ou ato deliberado do admin. Evita custo descontrolado e re-eval em loop. |
| D11 | Mensagens carregam `persona_id` no banco; eval segmenta por persona | Conversa pode passar por concierge → especialista A → especialista B. Sem atribuição por turno, Naturalidade/Assertividade ficavam com viés sistemático (avaliando contra a última persona apenas). Coluna `messages.persona_id` (nullable) permite reconstruir segmentos. Conversas legacy (todas com NULL) caem no caminho single-persona via `currentPersona` do metadata. |
| D12 | `qualifyAnswers` por categoria preservado em transição | Antes a transição zerava `qualifyAnswers`, perdendo o trabalho de discovery em categorias anteriores pro eval. Snapshot em `qualifyAnswersByCategory[category]` mantém o histórico; `qualifyCoverage` é agregada entre todas as categorias visitadas. |

---

## 10. Como o juiz é "calibrado" sem conversas reais

A grande armadilha de qualquer sistema de eval é o **juiz ser falível**. Se o juiz tá calibrado errado, todo dashboard é teatro. Calibração tradicionalmente requer conversas reais com nota humana — a gente não tem isso ainda.

A solução: **fixtures sintéticas com faixas esperadas**.

Em `src/lib/eval/fixtures.ts`, mantemos 5 cenários canônicos:

1. **Happy path imóvel** — usuário leigo, agente coletou tudo, citou números com fonte, fechou lead. Esperado: overall ∈ [0.75, 1.0], sem flags.
2. **Alucinação auto** — agente inventou taxa e parcela, prometeu contemplação. Esperado: overall ∈ [0.0, 0.4], `hallucination=true`.
3. **Handoff perdido imóvel** — usuário pediu humano, agente insistiu. Esperado: `missedHandoff=true`.
4. **Baixo engajamento auto** — agente despejou parede de texto no WhatsApp, user respondeu "ok"/"tá" e sumiu. Esperado: `lowEngagement=true`.
5. **Multi-persona imóvel→auto** — usuário transita de imóvel pra auto, helena entrega bridge limpo, rafael assume sem perder contexto. Esperado: overall ∈ [0.7, 1.0], sem flags, continuidade alta apesar da troca.

Cada fixture declara faixas `[min, max]` por dimensão e valor obrigatório por flag. O comando:

```bash
npm run eval:calibrate
```

Roda essas fixtures contra o **juiz real** (Claude Sonnet 4.6) e mede **concordância** = % das checks dentro das faixas. Se cair abaixo de 70%, exit 1 sinalizando regressão no prompt do juiz. Custo: ~$0.10 por execução.

Quando começarmos a ter volume real, substituímos progressivamente: pega 15-20 conversas reais variadas, time anota nota humana, vira fixture (faixa = nota humana ± 0.15), substitui as sintéticas.

---

## 11. Tratamento de erro

O juiz é uma chamada externa que pode falhar (network, rate limit, parse). A gente trata em camadas:

1. **Retry automático** — 1 tentativa com backoff de 1s antes de desistir
2. **Persistência da falha** — se ambas falharem, salva linha em `conversation_evaluations` com `error` preenchido e scores nulos
3. **UI mostra "erro ao avaliar"** com botão "Tentar de novo"

---

## 12. Custos

- Cada avaliação: ~$0.02 (Sonnet 4.6, ~5k tokens input + 500 output)
- Calibração completa: ~$0.10 (4 fixtures)
- 100 conversas/dia → ~$60-80/mês
- 1000 conversas/dia → ~$600-800/mês

Quando volume crescer, otimizamos:

- Triagem com Haiku 4.5 + Sonnet só nas conversas suspeitas
- Sample (avaliar 30-50% em vez de 100%)
- Cap por persona/categoria

---

## 13. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Juiz mal calibrado → notas sem sentido | Fixtures de calibração rodam antes de cada mudança no prompt |
| Custo descontrolado | Triggers síncronos disparam só em marcos reais (handoff fechado, lead capturado); reavaliação manual é ato deliberado; logs estruturados pra auditar |
| Conversa muito longa estoura janela | Janela 5+35 (preserva começo e fim, omite miolo se > 40 turnos) |
| Tool calls não persistidos limitam assertividade | Aceitar no MVP; se virar dor, adicionar `tool_invocations` table |
| Cliente reclama de PII no juiz | Política Anthropic é de no-training em API; reavaliar se trocar provider |
| Ressuscitação: conversa parece encerrada e volta dias depois | Re-eval natural quando atinge idle de novo; eval mais recente vence |

---

## 14. Conversas multi-persona

Conversa real frequentemente passa por mais de uma persona — concierge → especialista
de imóvel → especialista de auto, por exemplo. Antes da rev. de multi-persona, a eval
avaliava o transcript inteiro contra a **persona atual** (a última a falar), produzindo
viés sistemático em Naturalidade e Assertividade quando havia transição.

### Mecanismo

- **Coluna `messages.persona_id`** (text, nullable) carrega a persona que produziu cada turno do agente. User/system messages e mensagens legacy ficam NULL.
- **Orchestrator** (`runner.ts`) plumar `currentPersona` no `saveMessage` ao gravar turno do agente.
- **Transição** (`transition.ts`) snapshota `qualifyAnswers` em `qualifyAnswersByCategory[oldCategory]` antes de resetar — preserva o trabalho de discovery em categorias anteriores.
- **Sinais determinísticos** (`signals.ts`):
  - `personaSegments` — array de `{personaId, startMessageId, endMessageId, turnCount}` derivado de mensagens consecutivas com mesma persona.
  - `qualifyCoverage` — agregada entre todas as categorias visitadas (`personasSeen` ∪ `currentCategory`).
  - `qualifyMissing` — campos faltantes prefixados com a categoria (`imovel.prazoMeses`).
- **Transcript** (`transcript.ts`) insere marker entre turnos do agente quando a persona muda: `[--- Transição: persona muda de X para Y a partir do Turn N ---]`.
- **Scorer** (`scorer.ts`) carrega todas as personas vistas via `messages.personaId` e passa como array (`personas: PersonaContext[]`) pro juiz.
- **Rubric** (`rubric.ts`) tem bloco "Conversas multi-persona" no system prompt instruindo o juiz a avaliar cada segmento contra sua persona e pontuar a transição em **Continuidade**.

### Fallback legacy

Conversas pré-rev. (todas as mensagens com `personaId` NULL) seguem o caminho single-persona:
- `personaSegments` = `[]`, sem markers de transição.
- Carrega só `currentPersona` do metadata (1 persona no array).
- Juiz formata como persona única (sem "Persona 1 de N").
- Sem necessidade de backfill de conversas históricas.

---

## 15. O que fica fora desta versão

- Configurabilidade da rubric por persona (hoje é hardcoded v1)
- Comparação de versões de persona
- Promoção automática de "exemplares" pro flywheel
- Eval pré-deploy (Vitest contra casos sintéticos como testes obrigatórios)
- Avaliação de conversa em curso
- Re-eval de conversas históricas em massa (pode rodar manual pra backfill)
- **Diagnóstico com IA** — endpoint que sugere correções a partir de eval ruim. Ver `agent-eval-avaliacao.md`.
- **Playbook** — regras condicionais. Ver `agent-eval-playbook.md`.

---

## 16. A grande armadilha

O **juiz LLM é o ponto único de falha**. Se ele tá ruim, todo o resto é teatro: dashboards bonitos com números aleatórios. As fixtures de calibração são a defesa contra isso. Antes de qualquer mudança no `RUBRIC_SYSTEM_PROMPT` ir pra produção, rodar `npm run eval:calibrate` e ver se a concordância continua acima de 70%. Sem essa disciplina, o sistema deteriora silenciosamente.
