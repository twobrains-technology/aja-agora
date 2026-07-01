# Playbook do Agente — Regras Condicionais de Comportamento

> Documento de design. Ainda não implementado — é a fase 2 do sistema de
> melhoria contínua dos agentes. Companheiros: [`agent-eval-plano.md`](./agent-eval-plano.md)
> (eval técnico, já implementado) e [`agent-eval-avaliacao.md`](./agent-eval-avaliacao.md)
> (visão e ciclo de melhoria).

---

## 1. Por que existe

A persona do agente já tem 3 mecanismos pra calibrar comportamento, e os 3 já estão implementados no admin:

- **`voiceTone`** — descrição em texto da voz da persona ("consultiva e didática")
- **`examples`** (few-shot) — pares de mensagens que servem de referência de tom
- **`forbiddenTopics`** — coisas que a persona nunca pode dizer

Esses três cobrem **comportamento padrão**: como a persona se comporta **sempre**. Mas atendimento real tem situações que pedem comportamento **diferente do padrão**:

- Cliente leigo precisa de mais explicação que cliente expert
- Cliente que já fez 3 objeções precisa de handoff, não de mais argumento
- Cliente que ficou em silêncio por 2 turnos precisa ser provocado a continuar

Isso são **regras condicionais**: se acontece X, faça Y. Não cabe como exemplo (que é constante) nem como tom genérico (que é único). É um nível diferente.

O Playbook resolve isso. Cada persona tem sua lista de regras. A cada turno, o sistema avalia quais regras "batem" com a situação atual e injeta a diretiva correspondente no contexto do agente — invisível pro usuário, mas mantém consistência.

---

## 2. Diferença pra few-shot examples (importante)

| | Few-shot | Playbook |
|---|---|---|
| **O que é** | Par (User diz X, Assistant responde Y) | Par (Quando X acontece, faça Y) |
| **Quando aplica** | **Sempre**, como referência implícita de estilo | **Só quando a condição bate** |
| **Foco** | Forma — *como* falar | Comportamento — *quando mudar* o jeito |
| **Onde mora** | Campo `examples` na linha da persona | Tabela `playbook_rules` separada |
| **Limite** | 3-5 (mais que isso o modelo ignora) | Tantas quantas o time mantiver |
| **Como o modelo "vê"** | Lê os exemplos junto com o system prompt e absorve o tom | Recebe diretiva injetada **naquele turno** específico |
| **Granularidade** | Aplicado a toda conversa | Pode ligar/desligar conforme intent, expertise, etc. |

**Frase pra fixar**: few-shot mostra "esse é o jeito padrão"; playbook diz "quando acontecer X, mude pro outro jeito".

Exemplos lado a lado:

- **Tom didático em geral** → few-shot (adicionar 2-3 exemplos de respostas didáticas)
- **Tom extra-simples só pra leigo no imóvel** → playbook (`if expertise=leigo AND categoria=imovel, injetar "linguagem extra simples"`)
- **Nunca prometer contemplação** → forbiddenTopics (hard rule)
- **Sugerir handoff após 3 objeções** → playbook (`if objection_count >= 3, suggest_handoff`)

A regra prática: começa pelos 3 mecanismos da persona (voiceTone, few-shot, forbidden). Quando o problema é **claramente condicional** (depende de algo dinâmico), aí vai pro playbook.

---

## 3. Como funciona, fluxo a fluxo

A peça que destrava isso já existe no projeto: o **turn-analyzer** (`src/lib/agent/turn-analyzer.ts`). Hoje ele detecta `intent`, `expertise`, `category`, valores extraídos. A gente estende com mais sinais (emoção, objeções acumuladas, perguntas repetidas) e adiciona um passo entre analyzer e agent:

```
[user manda mensagem]
   ↓
Turn analyzer (estendido)
   - intent: ready_to_proceed | asking_question | expressing_doubt | ...
   - emotion: neutral | confused | frustrated | hesitant | excited
   - signals: { objectionsRaised: 2, repeatedQuestions: 1, turnCount: 7 }
   ↓
[NOVO] Playbook lookup
   - Carrega todas as regras ativas da persona em uso
   - Pra cada regra, avalia se a condição bate com sinais + metadata
   - Acumula diretivas das regras que casaram (com priorização)
   ↓
Agente recebe system prompt da persona + diretivas do playbook + transcript
   ↓
Agente responde (mesmo loop de hoje, só com mais contexto contextual)
```

**Não muda a arquitetura**. Adiciona um passo entre o analyzer (que já existe) e o agent (que já existe).

---

## 4. Forma da regra

Cada regra é um par **condição estruturada → ação**. Em código:

```ts
type PlaybookRule = {
  id: string;
  name: string;                 // "leigo-imovel-linguagem-simples"
  description: string;          // "Quando user é leigo em imóvel, exigir linguagem extra simples"
  scope: "global" | { category: string } | { persona: string };
  condition: Condition;
  action: Action;
  priority: number;             // desempate quando várias regras casam
  enabled: boolean;
};
```

### Tipos de condição

```ts
type Condition =
  | { kind: "intent_is", values: UserIntent[] }
  | { kind: "emotion_is", values: Emotion[] }
  | { kind: "expertise_is", values: ExpertiseLevel[] }
  | { kind: "objection_count_gte", n: number }
  | { kind: "repeated_question", windowTurns: number }
  | { kind: "missing_qualify", fields: ("creditMin" | "prazoMeses" | "hasLance")[] }
  | { kind: "turn_count_gte", n: number }
  | { kind: "all_of", conditions: Condition[] }
  | { kind: "any_of", conditions: Condition[] };
```

Pra MVP, começamos com 4 tipos: `intent_is`, `expertise_is`, `objection_count_gte`, `missing_qualify`. Os outros entram conforme necessidade.

### Tipos de ação

```ts
type Action =
  | { kind: "inject_directive", text: string }   // adiciona instrução no contexto
  | { kind: "set_tone", tone: string }            // muda tom específico daquele turno
  | { kind: "force_tool", tool: string }          // força uso de uma tool específica
  | { kind: "suggest_handoff", reason: string }   // dispara handoff
  | { kind: "skip_gate", gate: string };          // pula gate de qualificação
```

Pra MVP, começamos com 2: `inject_directive` e `suggest_handoff`. Cobrem 80% dos casos.

### Exemplos concretos

| Frase em português | Como vira regra |
|---|---|
| "Se cliente parecer inseguro, explique melhor" | `condition: emotion_is [hesitant, confused]`<br>`action: inject_directive "use linguagem simples, exemplos concretos, valide entendimento"` |
| "Se objetar 3 vezes, encaminha pra atendente" | `condition: objection_count_gte 3`<br>`action: suggest_handoff "cliente com múltiplas objeções"` |
| "Se for leigo em imóvel, evita jargão" | `condition: all_of [expertise_is [leigo], category_is [imovel]]`<br>`action: inject_directive "evite cota, lance livre, contemplação; explique em palavras do dia a dia"` |
| "Após 5 turnos sem coletar crédito, perguntar direto" | `condition: all_of [turn_count_gte 5, missing_qualify [creditMin]]`<br>`action: inject_directive "pergunte explicitamente sobre faixa de crédito"` |

---

## 5. Onde fica na tela da persona

A tela de edit da persona ganha uma aba nova **"Comportamento"** que agrupa todos os mecanismos de configuração — voz, few-shot, tópicos proibidos, handoff triggers e o playbook.

```
┌── Persona: Helena (imóvel) ────────────────────────────────┐
│                                                             │
│  [ Identidade ]  [ Comportamento ]                          │
│                                                             │
│  ── Voz e tom ──────────────────────────────────────       │
│  Consultiva e didática, evita jargão de mercado.           │
│                                                             │
│  ── Exemplos (few-shot)            5 ativos / 5 max ──     │
│  + Cota explicada em palavras simples                      │
│  + Resposta curta para WhatsApp                            │
│  + ...                                                      │
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
│  ── Playbook (regras condicionais) 4 ativas ──             │
│  [ + Nova regra ]                                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ✓ Ativa   Origem: Diagnóstico (conversa #a3b2)      │ │
│  │                                                      │ │
│  │ Quando: expertise=leigo E categoria=imovel          │ │
│  │ Faça:   injetar "use linguagem simples, sem jargão" │ │
│  │                                                      │ │
│  │ [ Editar ]  [ Desativar ]                           │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ✓ Ativa   Origem: Manual                            │ │
│  │ Quando: turno > 5 E sem creditMin coletado          │ │
│  │ Faça:   pergunte crédito de forma direta            │ │
│  │ [ Editar ]  [ Desativar ]                           │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### O que cada card de regra mostra

- **Status** (ativa/desativada) com toggle rápido
- **Origem** — manual ou via diagnóstico (rastreio de onde veio)
- **Condição** em linguagem natural simples (gerada do JSON da regra)
- **Ação** — diretiva que será injetada no contexto do agente
- **Botões** — editar e desativar

---

## 6. Como uma regra nasce

Três caminhos:

### Manual

Admin clica "+ Nova regra" e usa um builder com dropdowns:

- **Quando** (condição) — escolhe o tipo (`intent`, `expertise`, `objection_count`, etc.) e os valores
- **Faça** (ação) — escolhe o tipo (`inject_directive`, `suggest_handoff`) e preenche o texto
- **Onde aplica** (escopo) — global, categoria específica ou só nessa persona

Sem precisar escrever prompt nenhum. O sistema monta o JSON da regra a partir das escolhas.

### Sugerido pelo Diagnóstico (integração com eval)

Esse é o caminho mais valioso. Quando o admin clica em "Diagnosticar com IA" no drawer de uma conversa avaliada (ver `agent-eval-avaliacao.md`), além de sugerir few-shot examples e tópicos proibidos, a IA pode propor uma regra de playbook:

```
Sugestões do diagnóstico:

[3] Sugestão de regra condicional:
    Quando: expertise=leigo + categoria=imovel
    Faça:   injetar "use linguagem simples, sem jargão"
    
    Por quê: 4 das últimas 10 conversas leigo+imovel tiveram 
    naturalidade < 0.5 pelo mesmo motivo (jargão).
    
    [Aplicar à persona]  [Descartar]
```

A regra é criada já com `origem: "diagnóstico"` e referência à conversa que motivou. Aparece no card com essa marca.

### Promovida automaticamente (futuro)

Quando o sistema detectar **padrão recorrente** em vários eval com flag, sugere a regra direto no dashboard, sem precisar abrir conversa por conversa. Por exemplo: "70% das conversas em que `dropOffGate=lance` falharam — considera adicionar regra que reage antes do gate de lance?"

Esse é o passo mais avançado e fica pra fase 3.

---

## 7. Modelagem no banco

```sql
playbook_rules
├── id (uuid)
├── name (text)
├── description (text)
├── scope (text)                      -- "global" | "category" | "persona"
├── scope_value (text, nullable)      -- "imovel" | "helena-imovel" | null
├── condition (jsonb)                 -- Condition union serializado
├── action (jsonb)                    -- Action union serializado
├── priority (int, default 0)
├── enabled (bool, default true)
├── origin (text)                     -- "manual" | "diagnosis"
├── origin_conversation_id (uuid, nullable)  -- se vier de diagnóstico, qual conversa motivou
├── created_by (FK user)
├── created_at, updated_at
```

Sem versionamento. Sem log de disparos. Mantém simples no MVP — adiciona se virar dor.

---

## 8. Resolução de conflito

Quando 3 regras casam ao mesmo tempo, qual vence?

A ordem é:

1. **Filtra por scope mais específico**: persona > categoria > global. Se uma regra de persona casa, regras de categoria/global do mesmo "tipo" não aplicam.
2. **Dentro do mesmo scope, prioridade decrescente**: a regra com `priority` maior vence.
3. **Ações compatíveis se acumulam**: várias `inject_directive` viram um bloco único de instruções no contexto.
4. **Ações incompatíveis** (duas `set_tone` diferentes): só a de maior prioridade vence.
5. **Veto duro**: se alguma regra disparar `suggest_handoff`, ela curto-circuita as outras — escalação tem precedência sobre tudo.

---

## 9. MVP do playbook (versão 0.1)

Pra entregar valor sem entrar em over-engineering:

- Tabela `playbook_rules` com 4 tipos de condition: `intent_is`, `expertise_is`, `objection_count_gte`, `missing_qualify`
- 2 tipos de action: `inject_directive`, `suggest_handoff`
- Plug no orchestrator depois do analyzer
- 5-8 regras manuais escritas pelo time como seed (cobrindo casos óbvios)
- Admin UI básica: lista, criar, editar, desativar
- Sem builder visual sofisticado — formulário simples com dropdowns
- Sem trigger log — se virar dor, adiciona depois

Esforço estimado: ~1 semana de dev focado.

Depois (v0.2+): mais signals (`emotion`, `repeated_question`, `turn_count_gte`), mais actions (`set_tone`, `force_tool`, `skip_gate`), builder visual, escape hatch LLM (`condition: { kind: "llm_match", description: "..." }` pra casos que não cabem no schema estruturado).

---

## 10. Conexão com a eval — o flywheel real

A eval é o **medidor**. O playbook é uma das **formas de agir** sobre o que a eval mediu. Junto com diagnóstico e few-shot, fecha o ciclo:

```
Eval gera score + flags
   ↓
Padrão emerge ("60% das conversas leigo+imovel têm naturalidade < 0.5")
   ↓
Time analisa o porquê (ou IA diagnostica)
   ↓
Time decide: "isso é condicional → vai pro playbook"
   ↓
Cria regra "expertise=leigo + categoria=imovel → linguagem simples"
   ↓
Próximas conversas usam a regra
   ↓
Eval re-mede o segmento
   ↓
Naturalidade subiu? Regra fica. Não? Ajusta ou remove.
```

Sem eval, o playbook seria chute. Com eval, cada regra adicionada tem **razão clara** (eval mostrou problema X) e **forma de medir** (eval re-mede pra ver se resolveu).

---

## 11. Estratégia de rollout

A ordem importa muito pra evitar caos:

1. **Eval primeiro** (já implementado) — sem isso, não dá pra avaliar se uma regra funciona
2. **Diagnóstico com IA depois** (próxima fase) — automatiza a análise "esse problema é condicional ou de tom?"
3. **Playbook por último** — entra quando os 3 mecanismos da persona (voiceTone, few-shot, forbidden) saturarem ou quando aparecer claramente um problema condicional

Pular pra "implementa playbook agora" sem ter eval rodando virou chute baseado em opinião. Não compensa.

---

## 12. A armadilha

**Tentação**: criar 50 regras "pra cobrir todos os casos" achando que mais regras = melhor controle. Resultado real: regras conflitando entre si, ninguém sabe qual disparou em qual conversa, agente fica engessado e robotizado, manutenção vira pesadelo.

**Disciplina**: cada regra precisa ter:

- **Razão clara** documentada (qual conversa ou padrão da eval motivou)
- **Critério pra remover** (se em 30 dias o problema não voltou, considera desativar e ver se permaneceu resolvido sem ela)
- **Revisão periódica** (mensal, time olha lista de regras e desativa as que não fazem mais sentido)

A regra de ouro: **manter o playbook enxuto**. Cada regra é um pedaço a mais de comportamento que o time precisa entender e revisar. A força do mecanismo é proporcional à disciplina de quem mantém.
