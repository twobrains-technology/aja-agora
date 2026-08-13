# Decisão — Bloco A: governança determinística do agente (allowlist estado→ação→precondição)

> 2026-07-01 · Design do `bloco-a-governanca-agente` (FIX-181 + FIX-180 + FIX-182).
> É a resposta arquitetural ao incidente da Mirella (conv 69a38af1, prod): a IA
> pulou pra `simulate_quota → get_group_details → present_decision_prompt` sobre
> "Embracon", grupo **nunca exibido**, e emitiu card de decisão sobre plano-fantasma.
> Fundamento: `~/.claude/reference/arquitetura-agentes-ia.md` (as 6 leis + a regra do
> tripé de pesquisa). Card-âncora da doença: `docs/correcoes/todo/bloco-b-intent-ver-mais/fix-183-*.md`.
>
> As 3 perguntas de trade-off foram levantadas via `AskUserQuestion` (Q1/Q2/Q3
> abaixo). A rodada foi **dispensada no ClaudeNotch** (sem resposta em tempo hábil);
> conforme o `_prompt.md` do bloco, segui a **opção recomendada** em cada uma e
> registro aqui. Reversível — se o Kairo quiser outra opção, o diff é localizado.

---

## Contexto — o que já governa a jornada (e o buraco)

A metade da FRENTE da jornada (qualificação) já segue as 6 leis: o `nextGate()`
(`qualify-state.ts`) é um controlador determinístico que decide qual GATE dispara; o
LLM só faz NLU + copy. A metade de TRÁS (busca→recomendação→decisão→contrato) é
governada por três peças:

1. **`allowedTools(meta)` (`tool-policy.ts`)** — allowlist de tools por **FASE** (4 fases
   grossas: `qualify`/`reveal`/`closing`/`terminal`, derivadas de `phaseFromMeta`). É
   fail-closed (bom), MAS **cega a DADO**: na fase `reveal`, `simulate_quota`/
   `get_group_details`/`present_decision_prompt` são TODAS permitidas (legítimas em
   geral), e a fase não sabe dizer "só sobre um grupo que o usuário viu/escolheu".
2. **`shown-groups.ts` (FIX-179)** — precondição de DADO (só agir sobre grupo cujo
   id/administradora já passou por um artifact de exibição), mas **ad-hoc dentro do
   `execute`** de 4 tools. É o primeiro tijolo da precondição, não algo a remover.
3. **`artifact-guard.ts`** — blocklist reativa de **6 regras** nascidas de 6 bugs de
   prod. Incompleta por construção (Lei 2).

**Modo de falha nomeado:** free-running ReAct off-script (Lei 1) + a allowlist governa
QUAL tool, não SOBRE QUE DADO. O FIX-179 acrescentou a dimensão de dado, mas ad-hoc.

**A cura:** formalizar a governança da metade de trás como **allowlist declarativa
`estado → ação → precondição`**, generalizando o FIX-179 de caso especial para
princípio, usando os **primitivos NATIVOS do AI SDK 6**.

---

## Correção de premissa do `_prompt.md` (verificado, não de memória)

O `_prompt.md` e o `_bloco.md` afirmam que "o projeto usa `streamText` direto em
`runner.ts`, não a classe Agent". **Isso está incorreto.** Verificado no código:

- `src/lib/agent/agents/builder.ts` constrói um **`ToolLoopAgent`** (`import { ToolLoopAgent } from "ai"`).
- `src/lib/agent/orchestrator/runner.ts` chama **`agent.stream({ messages })`** (linha 178).
- O `ToolLoopAgent` **encapsula** o `streamText` internamente. Os três primitivos existem
  e funcionam nele — só mudam de LUGAR de wiring (ver abaixo).

Isso não invalida o design; ao contrário, torna o wiring mais limpo. Registro para o
orquestrador e para o card-âncora não propagarem a premissa errada.

---

## Primitivos AI SDK 6 confirmados na doc oficial (via context7, `ai@^6.0.158`)

Fonte: `/websites/ai-sdk_dev` (doc oficial atual do AI SDK). Consultado 2026-07-01.

### 1. `prepareStep` — allowlist de tools por ESTADO (eixo estado→ação)
- **Onde:** setting do **construtor** do `ToolLoopAgent` (e param do `streamText`). O
  projeto **já usa** `prepareStep` no `builder.ts` (para reverter o `toolChoice` forçado
  do `save_contact_name` após o step 0 — BUG-MUTE-LOOP).
- **Assinatura confirmada:** `({ stepNumber, steps, model, messages, experimental_context }) => PrepareStepResult | Promise<...>`.
- **Retorno relevante:** `{ activeTools?: Array<keyof TOOLS>, toolChoice?, system?, messages?, model?, providerOptions? }`.
  `activeTools` restringe o subconjunto de tools **habilitado naquele step** — é o primitivo
  nativo para "só estas tools neste estado". A doc oficial (`/docs/agents/loop-control`)
  mostra exatamente `new ToolLoopAgent({ ..., prepareStep: ({ stepNumber, steps }) => ({ activeTools: [...], toolChoice }) })`.
- **Ganho do `steps`:** dá o histórico do turno (o que já foi chamado) — permite estreitar
  a allowlist ao longo do turno multi-step.

### 2. `onStepFinish` — observabilidade de tool I/O (FIX-181)
- **Onde:** **opção de chamada** de `agent.stream({ messages, onStepFinish })` /
  `agent.generate({ ..., onStepFinish })` (confirmado na ref do `Agent`: "both generate()
  and stream() methods accept an AgentCallParameters object with ... an onStepFinish
  callback invoked after each agent step"). Também é param do `streamText`/`generateText`.
- **Assinatura confirmada:** recebe `{ stepNumber, text, toolCalls, toolResults, finishReason, usage }`.
  **`toolCalls` = args/inputs** por chamada; **`toolResults` = outputs** por chamada. É
  exatamente o que a Lei 5 exige (argumentos + resultado por tool-call, estruturado).
- **Decisão de wiring:** vai na chamada de `.stream()` no **runner.ts** (escopo do FIX-181),
  não no construtor — o runner tem `conversationId`/`traceId` em mão.

### 3. `experimental_repairToolCall` — **NÃO se aplica à precondição** (achado importante)
- **Onde:** setting do construtor do `ToolLoopAgent` (e param do `streamText`).
- **Assinatura confirmada:** `({ system, messages, toolCall, tools, parameterSchema, error }) => Promise<LanguageModelV3ToolCall | null>`.
- **Quando dispara:** **SÓ em `NoSuchToolError | InvalidToolInputError`** — ou seja, falhas
  de PARSE/schema (nome de tool inexistente, input que não valida no Zod). **NÃO dispara**
  quando a tool executa com sucesso e RETORNA um payload `{error}` (que é o que o FIX-179
  faz via `naoExibidoDirective`, e o FIX-72 via `rebuscaDirective`).
- **Conclusão (Lei epistêmica — não cargo-cultar primitivo que não encaixa):** o card
  FIX-180 sugeriu `experimental_repairToolCall` "pro modelo se auto-corrigir em vez de
  narrar instabilidade". Mas o mecanismo REAL da precondição (grupo não-exibido, id
  fabricado) é uma precondição semântica sobre input **válido no schema** — não é parse
  error. O padrão que o código já usa (RETORNAR uma diretiva acionável no tool-result, que
  o modelo lê no próximo step e se re-ancora) é **superior** ao repairToolCall aqui: zero
  round-trip extra ao modelo, a diretiva chega no mesmo canal que o modelo já consome.
  **Decisão: NÃO adotar `experimental_repairToolCall` para a precondição.** Fica
  documentado como avaliado-e-recusado com motivo. (A "instabilidade" narrada vinha de
  tools que LANÇAVAM exceção → o AI SDK converte em tool-error; o código já migrou esses
  para retorno de diretiva — ver BUG-BEVI-EMPTY-ENV / FIX-72.)

---

## Decisões de trade-off (Q1/Q2/Q3 — recomendadas, rodada dispensada no Notch)

### Q1 — Alcance da migração do eixo estado→ação pro `prepareStep.activeTools`
**Decisão: Incremental + belt nativo.** (Alternativas: big-bang movendo tudo pra
`prepareStep`; ou mínimo, sem tocar o eixo estado→ação.)

- A CURA do bug da Mirella é a **tabela de precondição** (`action-policy.ts`, ver D1),
  não a camada estado→ação (que já funciona e é fail-closed).
- Adoto `prepareStep.activeTools` como **cinto nativo**: no `builder.ts`, o `prepareStep`
  (que hoje só existe quando `opts.toolChoice` é passado) passa a existir SEMPRE que houver
  `meta`, re-afirmando `activeTools = allowedTools(meta)` por step — **fundido** com a
  lógica de reversão do `toolChoice` forçado (um único `prepareStep` cobre as duas coisas).
- **MANTENHO** o filtro build-time do `allowedTools` (o `Object.fromEntries(...filter)` no
  builder) como defesa-em-profundidade **e** como chave de cache de agents (`tpHash` no
  `index.ts`). Não faço o big-bang: mover tudo pra `prepareStep` passando o toolset
  completo complica o cache (o `prepareStep` fecha sobre `meta`, então o cache ainda
  precisaria variar por fase) e arrisca expor tool se o `prepareStep` tiver bug.
- **Por quê:** menor risco, adota o primitivo nativo no eixo certo, e o tripwire
  `[tool-policy-violation]` do runner continua sendo a rede se algo escapar.

### Q2 — Quanto do `artifact-guard.ts` vira precondição
**Decisão: Meio-termo documentado.** (Alternativas: absorção total das 6 regras; ou
mínimo, dois sistemas paralelos intocados.)

- Migro a precondição de **grounding/shown-groups** (a dimensão de DADO do FIX-179) para
  a tabela formal `action-policy.ts` — vira o princípio, não caso especial.
- **Reclassifico** o `artifact-guard.ts` como **2ª linha (defense-in-depth) EXPLICITAMENTE
  documentada** — atualizo o header do arquivo deixando claro que a allowlist declarativa
  (tool-policy + action-policy) é a 1ª linha positiva, e o artifact-guard segura o residual.
- **NÃO removo** o artifact-guard. Análise honesta das 6 regras (por que não migram todas):
  - `whatsapp-optin`, `post-closure`, `premature-contract`, `value-picker-order` — são
    precondições de ESTADO que a `tool-policy` **já** cobre na 1ª linha (fase). O
    artifact-guard é o 2º cinto delas. Migrar de novo pra `action-policy` seria triplicar.
  - `single-option` — **genuinamente pós-fato**: depende do `discoveryCount`, que só existe
    DEPOIS da tool de descoberta rodar no turno. Não é representável como precondição
    pré-ação. **Fica**, documentado como pós-fato.
  - `reveal-loop` — parte é estado (revealCompleted), parte é **heurística de intent**
    (isUserTurn + userIntent + revealValueTargetChanged). A parte heurística não é
    precondição limpa. **Fica**, documentado.
- **Por quê:** Lei 2 feita certo = allowlist POSITIVA como governança primária
  (completa-por-construção no eixo estado→ação→dado); o residual pós-fato é um conjunto
  **pequeno, fechado e documentado**, não "mais um guard por bug". Rasgar o artifact-guard
  removeria 2ª linha que funciona e arriscaria regressão nas 6 famílias de bug que ele cobre.

### Q3 — Granularidade da fase `reveal`
**Decisão: Manter as 4 fases.** (Alternativa: dividir reveal em
just-revealed/comparing/detailing/awaiting-decision.)

- O eixo correto pro bug da Mirella é a **precondição sobre DADO** ("o grupo foi exibido?"),
  **não** sub-fases de estado. A precondição resolve o caso sem sub-fasear.
- Sub-fasear `reveal` agora é complexidade especulativa (YAGNI + Lei do equilíbrio: grossos
  o bastante pra a conversa fluir, estritos o bastante pela precondição). Se um bug futuro
  exigir distinguir "comparando" de "detalhando escolhido", aí sim — com evidência.

---

## Design fechado

### D1 — `action-policy.ts` (novo): a tabela `ação → precondição`

Módulo declarativo, pequeno e testável isoladamente. Uma entrada por **ação de risco**
(tools de simulação/detalhe/decisão), cada uma com uma **precondição** sobre o contexto
disponível no `execute` (`meta`, `shownGroups`, `args`). Retorna uma diretiva acionável
quando a precondição falha.

```
export type ActionPreconditionContext = {
  shownGroups: ShownGroups;        // ids + administradoras já exibidos (FIX-179)
  args: Record<string, unknown>;   // input validado da tool
};

export type PreconditionVerdict =
  | { allow: true }
  | { allow: false; directive: string };  // texto de re-ancoragem (naoExibido/rebusca)

// tabela: nome-da-tool -> precondição
export const ACTION_PRECONDITIONS: Record<string, (ctx) => PreconditionVerdict>
```

- `simulate_quota` / `get_group_details` → exigem `shownGroups.ids.has(args.groupId)`;
  senão `{ allow:false, directive: naoExibidoDirective(groupId) }`.
- `present_decision_prompt` → se `args.administradora` presente, exige
  `shownGroups.administradoras.has(args.administradora)`; senão
  `{ allow:false, directive: administradoraNaoExibidaDirective(...) }`. Sem administradora,
  nada a validar (`allow:true`) — igual ao FIX-179 hoje.
- As diretivas (`naoExibidoDirective`, `administradoraNaoExibidaDirective`,
  `rebuscaDirective`) migram de `ai-sdk.ts` para `action-policy.ts` (fonte única).

**Como o FIX-179 migra:** o `buildConsorcioTools` deixa de ter os `if (!shown.ids.has(...))`
espalhados nos `execute` e passa a chamar `evaluateActionPrecondition(toolName, { shownGroups, args })`.
O `looksLikeFabricatedGroupId`/`GroupNotInDiscoveryError` (FIX-72, "id não existe na Bevi")
**continuam** no adapter — são camada diferente ("existe na Bevi?" ≠ "foi exibido?"), e o
`action-policy` roda ANTES (o não-exibido nem toca o adapter). A ordem das duas camadas:
`action-policy` (foi exibido?) → adapter/`rebuscaDirective` (existe na Bevi?).

**Precondição da chave "estado":** o `action-policy` cobre a dimensão DADO. A dimensão
ESTADO (qual tool em qual fase) segue no `tool-policy.ts` (`allowedTools`) — 1ª linha. Os
dois juntos são a allowlist `estado → ação → precondição`.

### D2 — Wiring dos primitivos

| Primitivo | Onde | O quê |
|---|---|---|
| `onStepFinish` | `runner.ts` (chamada `agent.stream`) | loga `toolCalls`(args)+`toolResults`(output) por step, JSON estruturado, PII mascarada, ligado a `conversationId`. FIX-181. |
| `prepareStep.activeTools` | `builder.ts` (construtor do `ToolLoopAgent`) | re-afirma `allowedTools(meta)` por step (belt nativo), fundido com a reversão do `toolChoice` forçado. FIX-180. |
| precondição no `execute` | `action-policy.ts` + `ai-sdk.ts` | `action-policy` avalia a precondição de DADO; `execute` retorna a diretiva. Generaliza FIX-179. FIX-180. |
| `experimental_repairToolCall` | — | **não adotado** (não dispara em retorno `{error}`; ver acima). |

### D3 — PII no log do FIX-181 (LGPD)

O `onStepFinish` loga args de tools que podem carregar CPF/celular/documentos (ex.:
`capture_lead` tem `phone`/`email`; contract-form/identify). **Máscara antes de logar:**
função `maskPii(value)` que redige campos sensíveis por CHAVE (`phone`, `email`, `cpf`,
`celular`, `document*`, `name` parcial) e por PADRÃO (regex de CPF `\d{3}\.?\d{3}\.?\d{3}-?\d{2}`,
celular BR). Mascara recursivamente args e results. Nível de log = servidor (`console.log`
estruturado grepável), **nunca** vaza pro cliente. Reusa a família de mascaramento já usada
no gate identify quando existir.

### D4 — FIX-182 (texto colado multi-tool) — dependente desta spec

Sintoma: 4 narrações de transição pré-tool coladas sem separador num turno multi-step
(`fullResponse += part.text` no runner concatena textos de STEPS diferentes sem quebra).
**Correção:** inserir `\n\n` entre textos de **steps DIFERENTES** do multi-tool-call — NÃO
entre deltas do MESMO step (que precisam ficar colados pro streaming). Marcador de fronteira
de step no loop do `fullStream` (a AI SDK emite eventos que delimitam step; senão, usar o
boundary de tool-call como proxy). Sem heurística de falso-positivo (não colar/descolar por
conteúdo). A CURA determinística (governar a fase) reduz a superfície na origem (menos
narrações soltas por turno); o `\n\n` é a rede enquanto a governança não cobre tudo. P2.

---

## Impacto em testes (3 camadas obrigatórias)

- **Camada 1 (structural):** (a) `action-policy` nega ação sobre grupo não-exibido em cada
  tool de risco; (b) `builder.ts` expõe `prepareStep` que devolve `activeTools` da fase; (c)
  `runner.ts` passa `onStepFinish` e o log contém tool+input+output com PII mascarada; (d)
  header do `artifact-guard.ts` documenta 2ª linha.
- **Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`):** reproduz o turno
  "quero ver todos" da Mirella (stream: `simulate_quota`/`get_group_details`/
  `present_decision_prompt` sobre grupo/administradora nunca exibidos) e prova que a
  precondição BLOQUEIA (tool-result = diretiva de re-ancoragem), e que o texto multi-step
  sai com separador (FIX-182).
- **Camada 3 (nightly):** já coberta pela estrutura existente; sem mudança de gate.
- **NÃO regredir FIX-179:** `shown-groups*.test.ts` e o integration `ai-sdk.fix-179-*`
  continuam verdes — a lógica migra de lugar, o comportamento observável é o mesmo.

## Gaps / PENDENTE-KAIRO

- A UX de "ver mais opções" (o roteamento do intent `wants_more_options`) é do **bloco-b**
  (FIX-183) e depende do aval do Bernardo sobre o FIX-96 (hero+5). Este bloco NÃO decide
  isso — só garante que, sem grupo escolhido, o agente **não consegue** decidir/simular
  sobre grupo não-exibido (a trava). O "o que mostrar quando pede ver mais" fica no bloco-b.
- `experimental_repairToolCall` avaliado e **não adotado** (registrado acima); se um caso
  real de parse-failure aparecer, reabrir com evidência.
