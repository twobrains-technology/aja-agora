---
bloco: bloco-a-agente-passos-obrigatorios
branch: fix/agente-passos-obrigatorios
workspace: fix-agente-passos-obrigatorios
onda: 1
depends_on: []
paralelo_com: [bloco-b-bevi-fechamento, bloco-c-estudo-remocao-letta]
itens: [FIX-76, FIX-77, FIX-78]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/system-context.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/memory/orchestrator-bridge.ts
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "src/lib/agent/orchestrator/runner.ts — FIX-76 reabre o gate de busca, FIX-77 remove os system de `messages` no `agent.stream`. Regiões próximas; ordem interna evita reescrever 2×. Nível 2."
  - "src/lib/agent/agents/builder.ts — FIX-76 injeta regra anti-alucinação no prompt; FIX-77 threada systemContext/examplesBlock pra `instructions`. Regiões distintas do mesmo arquivo. Nível 2."
  - "tests/regression/agent-trajectory.test.ts — append-only de 3 cassettes novos (um por item). Nível 2."
ordem_merge: "Bloco interno sequencial (1 dev): FIX-76 → FIX-77 → FIX-78. Merge externo: este bloco é o que mais toca orchestrator/builder; se rebasar contra outros, este lado resolve."
---
# Bloco A — Robustez do agente / orchestrator: passos obrigatórios da jornada

Reúne os 3 achados da rodada de QA manual do Kairo que vivem na **mesma região**
(orchestrator + prompt builder + cassettes de trajetória). São bugs de **comportamento
não-determinístico do modelo** — o agente pula ou inventa passos obrigatórios da jornada:

- **FIX-76** — agente ALUCINA "instabilidade na busca" sem ter chamado `search_groups`
  e ressuscita um valor STALE do histórico como "dado real disponível". Dupla causa:
  (1) nada no prompt do `builder.ts` proíbe narrar falha de busca inexistente; (2) o gate
  de busca (`decideShowGate` em `runner.ts:505` + `turn-analyzer` + `qualify-state`) é
  suprimido por intent fraco numa retomada com valor-alvo já definido. **Viola regra
  inviolável Bevi fonte única** (proibido número stale/fictício em runtime).
- **FIX-77** — o orchestrator injeta mensagens `role:"system"` DENTRO do array `messages`
  passado a `agent.stream(...)` → warning de prompt-injection da AI SDK a cada turno.
  Achado colateral: a memória Letta é injetada EM DOBRO (campo `system` via `builder.ts`
  E array `messages` via `index.ts`). Correção (Opção A do card): threadar systemContext +
  examplesBlock pra dentro do builder (em `instructions`, SEM `cacheControl`, depois de
  stable/dynamic/memory) e parar de prepender em `messages` — **sem destruir o prompt
  caching por bloco** (o `stable` continua 1º item, byte-idêntico, único com ephemeral).
- **FIX-78** — no ramo 2+ grupos (`directives.ts:236-241`) o agente chama
  `present_recommendation_card` mas DROPA `present_comparison_table` → usuário vê só 1
  proposta, sem o carrossel comparativo. Reforçar inseparabilidade no prompt E/OU
  artifact-guard de defesa-em-profundidade no orchestrator.

## Por que agrupar (justificativa do empacotamento)

Os 3 são da **mesma região** (orchestrator/prompt/cassettes) e os 3 tocam
`runner.ts`/`builder.ts`/`agent-trajectory.test.ts`. Agrupar num dev só **elimina o
conflito de merge** que existiria se fossem blocos paralelos no mesmo arquivo, e é o
**pacote de 1 dev** (princípio-mãe: bloco = pacote, não tarefa única). Os 3 exigem
**Camada 2 obrigatória** (cassette novo em `agent-trajectory.test.ts`, append-only) — por
isso a ordem de merge INTERNA é sequencial: FIX-76 → FIX-77 → FIX-78, cada um adiciona seu
`describe` sem colidir com o anterior.

FIX-76 e FIX-78 são a mesma classe (passo obrigatório da jornada omitido pelo modelo) —
candidatos a um artifact-guard comum no orchestrator; fazê-los no mesmo dev permite
compartilhar a defesa-em-profundidade.

Disjunto dos Blocos B (adapter Bevi) e C (estudo/ADR) — nível 1.
