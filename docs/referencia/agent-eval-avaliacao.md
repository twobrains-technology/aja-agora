# Avaliação e Treinamento Contínuo dos Agentes

> Apresentação da ideia. Como vamos medir a qualidade do agente IA do Aja Agora
> e como vamos transformar essas medições em ajustes concretos que melhoram o
> produto continuamente. Companheiro: [`agent-eval-plano.md`](./agent-eval-plano.md)
> (detalhes técnicos do eval).

---

## O problema

Hoje o agente IA conduz toda a jornada do cliente — do "quero comprar um carro" até a captura de lead. Mas a gente não tem termômetro de qualidade.

Conversa boa ou ruim só vira sinal quando:

- Cliente reclama
- Time olha caso a caso
- Lead deixa de fechar e ninguém sabe por quê

Cada mudança no prompt vira aposta no escuro. Cada incidente (alucinação, handoff perdido) só aparece pelo cliente.

---

## A ideia em uma frase

> Cada conversa encerrada recebe uma nota de 0 a 100% com detalhamento por dimensão e flags do que deu errado. Quando uma conversa vai mal, a IA ajuda a diagnosticar onde corrigir e o time aplica o ajuste com um clique.

Duas peças, dois ciclos:

```
Ciclo 1 — Avaliar           Ciclo 2 — Treinar
──────────────────          ──────────────────
Conversa termina            Admin abre conversa ruim
       ↓                            ↓
Sistema dá nota             Clica "Diagnosticar com IA"
       ↓                            ↓
Aparece no admin            IA sugere ajustes específicos
       ↓                            ↓
Admin vê padrões            Admin aplica os que fazem sentido
                                    ↓
                            Persona aprende, próximas conversas melhoram
```

---

## Ciclo 1 — A avaliação

Toda conversa encerrada recebe nota em **6 dimensões**:

- **Engajamento** — usuário se manteve ativo na conversa?
- **Discovery** — agente coletou as informações antes de avançar?
- **Continuidade** — conversa fez sentido turno-a-turno, sem repetir pergunta?
- **Naturalidade** — tom condiz com a persona, linguagem ajustada ao usuário?
- **Assertividade** — números e fatos corretos, sem invenção?
- **Conversão** — lead avançou no funil?

Mais **4 alertas vermelhos** quando algo crítico acontece:

- **Alucinação** (citou número sem fonte)
- **Handoff perdido** (cliente pediu humano e agente insistiu)
- **Discovery incompleto** (avançou sem coletar contexto)
- **Baixo engajamento** (cliente desengajou cedo)

A nota e os alertas viram um **badge colorido** na lista de conversas. Verde, amarelo, vermelho. Em segundos o time sabe onde olhar.

### Onde aparece

- **Lista de conversas** — coluna "Qualidade" com badge.
- **Detalhe da conversa** — aba "Qualidade" com:
  - Score geral em barra grande
  - 6 mini-barras (uma por dimensão) com motivo da nota
  - Flags ativas em vermelho
  - Top 3 problemas e top 3 pontos fortes

### Quando dispara

- Logo após handoff fechado pelo atendente
- Logo após captura de lead
- Manualmente pelo admin (botão "Avaliar agora")

---

## Ciclo 2 — O "treinamento"

Aqui é onde a coisa vira ferramenta de evolução real, não só dashboard.

### O fluxo

1. Admin vê uma conversa com score 0.42 e flag "discovery incompleto"
2. Clica em **"Diagnosticar com IA"** no drawer
3. Em ~10 segundos, a IA analisa o transcript completo e devolve:

```
Causa raiz:
  Agente usou termos técnicos como "cota" e "lance livre"
  sem explicar — usuária era leiga.

Sugestões:

  [1] Adicionar exemplo (few-shot) à persona helena-imovel:
      Aplicar quando: expertise=leigo, categoria=imovel
      
      User: "O que é cota?"
      Assistant: "Cota é o seu lugar reservado no grupo —
      cada pessoa tem uma. Mensalmente você contribui com..."
      [Aplicar]  [Descartar]

  [2] Adicionar tópico proibido:
      "Usar 'lance livre' sem explicar"
      [Aplicar]  [Descartar]
```

4. Admin escolhe quais aplicar, clica
5. Persona é atualizada na hora
6. Próximas conversas dessa persona já usam a configuração nova
7. Em uma semana, time pode ver se o problema reincidiu menos

### Onde a correção mora

A maioria das correções vai pra **few-shot examples na persona** — recomendação direta da Anthropic, é o jeito mais forte de calibrar voz e comportamento.

| Tipo de problema | Onde corrige |
|---|---|
| Tom errado, jargão, formato ruim | Few-shot example |
| Comportamento muda conforme contexto | Few-shot example **com condição** (leigo, categoria, canal, intent) |
| Coisas que nunca podem aparecer | Tópicos proibidos |
| Sinais de quando escalar pra humano | Handoff triggers |

A regra de bolso: **começa sempre pela persona**. Se um problema aparece em 3+ personas diferentes, aí promove pra global.

### Por que isso é "treinamento"

Não é fine-tuning de modelo (caro, lento, opaco). É **calibração de prompt** baseada em evidência:

- Conversa real mostra falha
- IA diagnostica padrão
- Time aplica ajuste cirúrgico
- Eval re-mede se funcionou

Cada mudança fica documentada (qual conversa motivou, qual foi a sugestão aplicada) pra time entender de onde veio cada ajuste.

---

## Few-shot enriquecido — adaptação ao contexto

Hoje o few-shot tá cru: cada exemplo tem só `userMessage` + `assistantResponse` + um `context` em texto livre. Os 5 exemplos são **sempre** injetados no prompt, em qualquer turno, qualquer canal, qualquer tipo de usuário. O modelo precisa adivinhar quando aplicar cada um.

Funciona, mas desperdiça muito. E pior: força a escolher quais 5 exemplos servem pra **todos os contextos** ao mesmo tempo. Cliente leigo e expert recebem os mesmos exemplos. WhatsApp curto e Web detalhado recebem os mesmos.

A evolução é simples: **adicionar condições opcionais em cada exemplo**.

```ts
type PersonaExample = {
  id, context, userMessage, assistantResponse,

  // NOVO — condições opcionais. null = sempre aplica.
  whenExpertise?: ("leigo" | "expert" | "neutro")[];
  whenCategory?: ("imovel" | "auto" | "servicos")[];
  whenChannel?: "web" | "whatsapp";
  whenIntent?: UserIntent[];
  tags?: string[]; // pra busca/organização no admin
};
```

A cada turno, o sistema:

1. Carrega **todos** os exemplos da persona (pode ter 15-20 no banco)
2. **Filtra** os que batem com o contexto atual (expertise, category, channel, intent)
3. **Ranqueia** por especificidade (mais condições casadas = mais relevante)
4. Injeta os **top 3-5** no prompt daquele turno

Resultado prático:

```
Persona Helena tem 12 exemplos no banco

User leigo + categoria imóvel + WhatsApp pergunta sobre cota
  ↓
Filtro pega 4 exemplos relevantes:
  - "Cota explicada simples"           (whenExpertise=leigo)
  - "Resposta curta WhatsApp"          (whenChannel=whatsapp)
  - "Imóvel — primeira vez"            (whenCategory=imovel)
  - "Pergunta sobre termos técnicos"   (whenIntent=asking_question)
  ↓
Esses 4 vão pro prompt como few-shot

User expert + categoria auto + Web pergunta sobre prazo
  ↓
Filtro pega outros 3 exemplos:
  - "Tom direto pra expert"            (whenExpertise=expert)
  - "Auto — comparação rápida"         (whenCategory=auto)
  - "Resposta com números"             (whenIntent=asking_question)
```

**Cada turno recebe few-shots adaptados ao contexto.** Não é mais "mesma régua pra todo mundo".

### Por que isso resolve o que o playbook resolveria

Os casos de regra condicional (que motivariam um playbook) viram exemplos com condição:

| Cenário | Solução |
|---|---|
| "Linguagem extra simples pra leigo no imóvel" | Few-shot com `whenExpertise=leigo, whenCategory=imovel` |
| "Resposta curta no WhatsApp" | Few-shot com `whenChannel=whatsapp` |
| "Tom direto pra expert" | Few-shot com `whenExpertise=expert` |
| "Modo explicativo quando user pergunta" | Few-shot com `whenIntent=asking_question` |
| "Sugerir handoff após múltiplas objeções" | Já existe — `handoffTriggers` na persona |
| "Hard rule absoluta" | Já existe — `forbiddenTopics` na persona |

Tudo cabe. Sem tabela nova, sem rules engine, sem analyzer estendido. Só um schema mais rico no que já existe.

### Onde fica na tela da persona

A tela de edit da persona ganha uma aba **"Comportamento"** que reorganiza os mecanismos existentes:

```
┌── Persona: Helena (imóvel) ────────────────────────────────┐
│                                                             │
│  [ Identidade ]  [ Comportamento ]                          │
│                                                             │
│  ── Voz e tom ──────────────────────────────────────       │
│  Consultiva e didática, evita jargão de mercado.           │
│                                                             │
│  ── Tópicos proibidos              3 ativos ──             │
│  • Promessa de contemplação                                │
│  • Conselho jurídico                                        │
│  • Comparação direta com concorrentes                      │
│                                                             │
│  ── Triggers de handoff            2 ativos ──             │
│  • Cliente pediu humano explicitamente                     │
│  • 3+ objeções seguidas                                    │
│                                                             │
│  ── Exemplos (few-shot)            12 no banco ──          │
│  Sistema seleciona os 3-5 mais relevantes a cada turno     │
│  [ + Novo exemplo ]                                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ✓ Ativo   Origem: Diagnóstico (conversa #a3b2)       │ │
│  │                                                      │ │
│  │ Aplicar quando:                                      │ │
│  │   expertise=leigo · categoria=imovel                 │ │
│  │                                                      │ │
│  │ User: "O que é cota?"                                │ │
│  │ Assistant: "Cota é o seu lugar reservado no grupo..."│ │
│  │                                                      │ │
│  │ [ Editar ]  [ Desativar ]                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ✓ Ativo   Origem: Manual                             │ │
│  │ Aplicar quando: canal=whatsapp                       │ │
│  │                                                      │ │
│  │ User: "Quanto sai?"                                  │ │
│  │ Assistant: "R$ 850/mês, 120 meses. Quer simular?"    │ │
│  │                                                      │ │
│  │ [ Editar ]  [ Desativar ]                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ✓ Ativo   Origem: Manual                             │ │
│  │ Aplicar quando: (sem condição — sempre)              │ │
│  │                                                      │ │
│  │ User: "Como funciona consórcio?"                     │ │
│  │ Assistant: "É um grupo que se junta pra comprar..."  │ │
│  │                                                      │ │
│  │ [ Editar ]  [ Desativar ]                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### O que cada exemplo mostra

- **Status** (ativo/desativado) — toggle rápido
- **Origem** (manual ou via diagnóstico) — pra rastrear de onde veio
- **Condições** ("Aplicar quando") — chips visuais com os filtros configurados; vazio = sempre aplica
- **Conteúdo** (user message + assistant response) — o exemplo em si
- Botões — editar, desativar

### Como um exemplo nasce

**1. Manual** — admin clica "+ Novo exemplo", escreve user/assistant, marca dropdowns opcionais "Aplicar quando" (expertise, categoria, canal, intent).

**2. Sugerido pelo Diagnóstico** — quando a IA analisa uma conversa ruim, propõe exemplos **já com condições calculadas a partir do contexto da conversa que motivou**:

```
Sugestão do diagnóstico:

Adicionar exemplo à persona helena-imovel:

  Aplicar quando: expertise=leigo, categoria=imovel
  
  User: "O que é cota?"
  Assistant: "Cota é o seu lugar reservado no grupo..."
  
  Por quê: 4 das últimas 10 conversas leigo+imovel tiveram
  naturalidade < 0.5 pelo mesmo motivo (jargão).
  
  [Aplicar]  [Descartar]
```

### A regra de ouro

**Um exemplo bem condicionado vale por 5 genéricos.** Em vez de inflar a lista com exemplos pra "todos os casos", a gente mantém exemplos específicos com escopo claro. O sistema escolhe os certos a cada turno. Limpo, escala bem, fácil de entender olhando um por vez.

---

## A diferença que isso faz

| Antes | Depois |
|---|---|
| "Achei essa conversa ruim" (subjetivo) | "Naturalidade 0.4, discovery 0.3 — problema é coleta de contexto" (objetivo) |
| Mudar prompt é aposta | Cada mudança rastreada com origem clara e impacto medido |
| Alucinação descoberta pelo cliente | Alucinação flaggada na hora pelo cross-check |
| Atendente pega a mesma falha 10x | Falha vira few-shot, próximas conversas evitam |
| Conhecimento mora na cabeça do time | Conhecimento mora na persona, acessível a todos |
| Same-fits-all: 5 exemplos pra todo contexto | Few-shot adapta ao turno (leigo/expert, web/whatsapp, etc.) |

---

## O que vai aparecer no produto

### Telas existentes ganham

**Lista de conversas** → coluna "Qualidade" com badge

**Detalhe da conversa** → aba "Qualidade" com breakdown + diagnóstico

**Edit de persona** → ganha aba nova "Comportamento" agrupando voz, tópicos proibidos, handoff triggers e os exemplos few-shot enriquecidos com condições

---

## Como vamos garantir que funciona

A grande armadilha de qualquer sistema de eval é o **juiz ser falível**. Se o juiz tá calibrado errado, todo dashboard é teatro.

Como mitigamos:

**1. Cenários canônicos com expectativa declarada**
Mantemos 4 conversas sintéticas que representam padrões típicos (happy path, alucinação, handoff perdido, baixo engajamento). Cada uma tem faixa de score esperada.

**2. Comando de calibração**
`npm run eval:calibrate` roda essas conversas contra o juiz real e mede concordância. Se cair abaixo de 70%, sinal de regressão no prompt do juiz.

**3. Quando volume real chegar**
Substituímos os cenários sintéticos por conversas reais com nota humana. A nota humana vira o ground truth de fato.

**4. Humano sempre no loop**
A IA **sugere** — nunca aplica sozinho. Cada mudança passa por revisão.

---

## Custos

- Cada avaliação custa ~$0.02 (Claude Sonnet 4.6)
- Cada diagnóstico custa ~$0.01-0.02
- 100 conversas/dia → ~$60-80/mês
- Calibração mensal completa → ~$0.10

Quando volume crescer, otimizamos com triagem barata (Haiku) + Sonnet só nas suspeitas.

---

## Roadmap

| Fase | Entregável |
|---|---|
| 1 | Eval funcionando (badge + drawer + scores + flags) |
| 2 | Triggers automáticos (handoff fechado, lead capturado) |
| 3 | Botão "Diagnosticar com IA" + apply de sugestões (few-shot, forbidden topics) |
| 4 | Few-shot enriquecido — campos de condição no exemplo + seleção dinâmica no runtime |
| 5 | Diagnóstico passa a sugerir exemplos com condições calculadas a partir da conversa motivadora |
| 6 | Promoção automática — sistema sugere exemplos quando detecta padrão recorrente nas conversas |

---

Esse é o flywheel. Pequeno, com humano no centro e fundamentado em prática recomendada (few-shot examples + invariantes explícitas).
