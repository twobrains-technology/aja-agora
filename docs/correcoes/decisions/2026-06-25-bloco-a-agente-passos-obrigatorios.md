# ADR — Bloco A: robustez do agente nos passos obrigatórios da jornada

- **Data:** 2026-06-25 (execução 2026-06-26)
- **Branch:** `fix/agente-passos-obrigatorios`
- **Itens:** FIX-76, FIX-77, FIX-78 (rodada de QA manual do Kairo 2026-06-25)
- **Natureza:** três bugs de comportamento NÃO-determinístico do modelo (pula/inventa
  passos obrigatórios da jornada). Cada um cobre as 3 camadas de regressão de agente
  (CLAUDE.md → "Regressão de agent — 3 camadas OBRIGATÓRIAS").

Decisões de design tomadas pelo executor (sem o Kairo — best practice + padrões do repo).

---

## FIX-76 — agente alucina falha de busca e ressuscita valor STALE como "dado real"

**Causa dupla (do card):** (1) nada no prompt proíbe narrar falha de busca inexistente;
(2) o gate de busca é suprimido por intent fraco numa retomada com valor-alvo já definido.

### Decisão 1 — regra anti-alucinação no prompt (defesa PRIMÁRIA)
Adicionada REGRA DURA no `SPECIALIST_BASE_PROMPT` (vai pro bloco `stable`, cacheado):
proíbe (a) afirmar instabilidade/erro/dificuldade de busca sem ter chamado `search_groups`
e sem erro de tool NESTE turno; (b) reapresentar valor do histórico como "dado real
disponível"/"dados reais" sem `search_groups` no mesmo turno.

- **Opções:** (A) só prompt; (B) prompt + reabertura do gate; (C) postprocessor que
  bloqueia a frase no runtime.
- **Escolhida:** prompt como defesa primária (cobre a regra inviolável Bevi fonte única)
  **+** reabertura do gate (decisão 2). Rejeitei (C) postprocessor: detector regex sobre
  texto livre do modelo é frágil e arrisca censurar resposta legítima ("a administradora
  retornou instabilidade" quando a tool DE FATO falhou). O prompt é o mesmo padrão de
  TODAS as regras de comportamento do agente no repo (FIX-36, topic-picker, FIX-71/72).

### Decisão 2 — reabertura cirúrgica do gate de busca em troca de faixa
O sinal `revealValueTargetChanged(meta)` (já existente, FIX-68: valor-alvo atual ≠
`discoveredCreditTarget`) passa a reabrir o GATE de busca, não só o toolset:
- `nextGate`: retorna `"search"` quando `revealValueTargetChanged` (antes de
  simulator-offer/decision/terminal), mesmo com `searchDispatched=true`.
- `index.ts`: o guard `search-already-dispatched` ganha exceção pra `revealValueTargetChanged`
  (re-disparo legítimo da nova faixa).
- `decideShowGate` (gate `search`): além de `ready_to_proceed`/`providing_info`, libera
  `neutral` quando `revealValueTargetChanged` — cobre a retomada onde o analyzer marca a
  mensagem como conversacional mas o valor-alvo já mudou.

- **Opções:** (A) mexer só no prompt e documentar o gate como não-feito; (B) reabrir o
  gate nos 3 pontos via `revealValueTargetChanged`; (C) resetar `searchDispatched` no
  runner ao detectar troca de faixa.
- **Escolhida:** (B). Rejeitei (A) — o card pede explicitamente a reabertura e deixar o
  gate quieto mantém o agente livre pra alucinar. Rejeitei (C) — resetar flag persistida
  tem efeito colateral em outros gates (simulator-offer/decision dependem de
  `searchDispatched`); usar o sinal derivado `revealValueTargetChanged` é não-destrutivo e
  reaproveita a convergência já existente (o runner re-snapshota `discoveredCreditTarget`
  após produzir os cards da nova faixa → `revealValueTargetChanged` volta a `false` →
  fecha o ciclo, sem loop). Risco contido: toda a suíte `qualify-state.*` + regressão roda
  verde.

## FIX-77 — system messages dentro de `messages` (warning prompt-injection) + Letta em dobro

### Decisão — Opção A do card (threadar pro builder via `instructions`)
`systemContext` (knownName/experience/doubts) + `examplesBlock` deixam de ser prepended em
`messages` e passam a ser anexados ao array `instructions` do `ToolLoopAgent`, DEPOIS de
stable/dynamic/memory, SEM `cacheControl`. O `memoryPrefix` em `messages` é removido (a
memória Letta já entra via `memoryContext` → `buildAgent`), o que mata a duplicação.

- **Opções:** (A) threadar pro builder (recomendada no card); (B) passar `system` na opção
  do `agent.stream()`; (C) suprimir o warning com `allowSystemInMessages: true`.
- **Escolhida:** (A). Rejeitei (C) — silencia o sintoma e mantém a duplicação Letta +
  uso não-idiomático. Rejeitei (B) como caminho principal — o card é explícito ("NÃO trocar
  `ToolLoopAgent` por `streamText`", threadar pro builder); o builder já é o dono do array
  `instructions` e do `cacheControl`, então é o lugar certo pra garantir que `stable`
  continue 1º item byte-idêntico e único com ephemeral. Padrão idêntico ao
  `mesa-copilot/index.ts` (system via opção, cache no bloco STABLE).
- **Cache preservado:** specialist + `conversationId` SEMPRE bypassa o cache de agents
  (`resolveAgent`), então blocos dinâmicos por turno (systemContext/examples) entram com
  segurança no caminho de produção sem poluir cache-key. `builder.prompt-cache.test.ts`
  segue verde.

## FIX-78 — `comparison_table` dropado no reveal com 2+ grupos

### Decisão — reforço no prompt (directives.ts), sem injeção em runtime
REGRA DURA de inseparabilidade `present_recommendation_card` ↔ `present_comparison_table`
no `buildSearchSummaryDirective` (ramo 2+ grupos): emitir um sem o outro é defeito.

- **Opções:** (A) reforçar só o prompt; (B) artifact-guard no runner que INJETA o
  `comparison_table` ausente; (C) prompt + tripwire de log.
- **Escolhida:** (A). Rejeitei (B) — a injeção exigiria remontar o payload do carrossel a
  partir do output de `recommend_groups`, que no runner é o stub `DISCOVERY_NO_CONTEXT`
  (os grupos reais vêm interceptados pela adapter Bevi e o runner não os retém de forma
  confiável). Remontar números em runtime é exatamente o "dado remontado/fabricado" que a
  regra inviolável Bevi fonte única proíbe — pior que o bug que conserta. (C) descartado: o
  `turn-trace` já expõe `artifactsEmitted` (a ausência do `comparison_table` é visível ali
  sem tripwire extra). A defesa fica no prompt + cassette Camada 2, mesmo padrão dos demais
  bugs de comportamento do agente neste arquivo (FIX-36, topic-picker).

---

## Resumo das escolhas

- **FIX-76:** decidi **prompt anti-alucinação + reabertura do gate via `revealValueTargetChanged`**
  em vez de só-prompt, porque o card pede a reabertura e o prompt sozinho deixa o agente
  livre pra mentir; e via sinal derivado (não reset de flag) pra não dar efeito colateral
  nos gates downstream.
- **FIX-77:** decidi **Opção A (threadar pro builder)** em vez de suprimir o warning,
  porque suprimir mantém a duplicação Letta e o uso não-idiomático; o builder é o dono do
  cache e garante o prefixo byte-idêntico.
- **FIX-78:** decidi **reforço de prompt** em vez de injeção em runtime, porque injetar o
  `comparison_table` exigiria remontar payload a partir de um stub — fabricar número em
  runtime viola Bevi fonte única.
