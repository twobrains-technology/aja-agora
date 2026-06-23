---
bloco: bloco-d-resimula-faixa-reveal
branch: fix/resimula-faixa-reveal
workspace: fix-resimula-faixa-reveal
onda: 2
depends_on: []
paralelo_com: [bloco-e-sweep-multifaixa]
itens: [FIX-68]
escopo_arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/tool-policy.test.ts
  - src/lib/agent/system-prompt.ts
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "src/lib/agent/system-prompt.ts — bloco-e PODE tocar (orquestração do sweep). Regiões diferentes (seção de re-busca vs descoberta). Nível 2 — mergear D primeiro."
  - "tests/regression/agent-trajectory.test.ts — append-only de cassettes com bloco-e. Nível 2."
ordem_merge: "Mergear D ANTES de E (D é o fix focado de tool-policy; E rebase depois resolve o append-only de cassettes/prompt)."
# Onda 2 é rótulo de ISOLAMENTO, não dependência: os blocos a/b/c (onda 1) são
# backlog parado desde 2026-06-19 (aguardam Bernardo) e NÃO são lançados nesta leva.
# Marcar D/E como onda 2 evita que merge-wave --wave 1 trave esperando tags de a/b/c.
---
# Bloco D — Re-descoberta por mudança de valor na fase reveal (BUG que trava a jornada)

Bug crítico isolado na investigação dos logs do agent na develop (2026-06-22,
conversa `a8b0a80d`). Um item só, focado em `tool-policy.ts` — região exclusiva,
sem conflito com o sweep (bloco-e, que vive no adapter/discovery).

- **FIX-68** — na fase `reveal`, a tool-policy remove `search_groups` (comentário
  BUG-REVEAL-LOOP). Depois da 1ª descoberta o usuário NÃO consegue trocar de faixa
  de valor: o agent perde a ferramenta de buscar, fabrica um groupId sintético
  (`auto-130k-60m`) e trava em loop de "instabilidade". Reabilitar a re-descoberta
  QUANDO o valor-alvo muda, sem reabrir o re-reveal de cards.

Bug de comportamento do agent → as 3 camadas de regressão são OBRIGATÓRIAS
(structural em `tool-policy.test.ts` + cassette em `agent-trajectory.test.ts`).
TDD strict: o teste falha ANTES do fix.
