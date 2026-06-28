---
bloco: bloco-a-funil-qualificacao
branch: fix/funil-qualificacao-v2
workspace: fix-funil-qualificacao-v2
onda: 1
depends_on: []
paralelo_com: [bloco-c-infra-teste, bloco-d-chat-render]
itens: [FIX-83, FIX-82, FIX-84, FIX-85, FIX-86]
escopo_arquivos:
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/orchestrator/analyze.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/HARD_RULES.md
conflitos_esperados:
  - "system-prompt.ts + HARD_RULES.md: FIX-85 e FIX-86 tocam ambos → resolver pela ORDEM INTERNA (FIX-85 antes, FIX-86 depois), edição sequencial no mesmo worktree = zero merge."
  - "system-prompt.ts também é tocado pelo Bloco B (FIX-88, regra de recomendações), mas o Bloco B está SEGURADO fora da onda 1 (aguarda aval do Bernardo) — sem conflito ativo agora."
---
# Bloco A — Saneamento do funil de qualificação (jornada v2)

Todos os itens são o mesmo tema: **realinhar o funil de qualificação ao docx da
jornada v2 / FIX-53** (que reorganizou a ordem dos gates e subiu `identify` pra
antes do valor). São defeitos que o QA noturno de 21/06 isolou na travessia E2E do
funil, mais a defesa-em-profundidade do fallback proibido.

Estão juntos porque (a) compartilham o domínio (orchestrator + prompt + classifier
do funil) e (b) **FIX-85 e FIX-86 tocam os mesmos 2 arquivos** (`system-prompt.ts`,
`HARD_RULES.md`) — no mesmo bloco viram edição sequencial sem conflito de merge.

## Ordem interna (executar nesta sequência)
1. **FIX-83** — remover auto-sets de `experiencePrev`/`qualifyConsented` em `analyze.ts` (disjunto).
2. **FIX-82** — endurecer prompt do classifier (`turn-analyzer.ts`) contra inferir prazo de "X/mês" (disjunto).
3. **FIX-84** — handler do gate `lance` no `route.ts` dispara `lance-embutido` pra "não/talvez" (disjunto).
4. **FIX-85** — corrigir a ordem de gates descrita no `system-prompt.ts` + `HARD_RULES.md` (toca os 2 compartilhados).
5. **FIX-86** — adicionar veto anti-"atualiza a página" no `system-prompt.ts` + `HARD_RULES.md` (toca os 2 compartilhados — DEPOIS do FIX-85).

## Regressão
TDD 3 camadas onde for comportamento do agente (structural + cassette em
`tests/regression/agent-trajectory.test.ts` para FIX-86; structural de prompt para
FIX-82/85; determinístico de `analyzeAndMerge`/handler para FIX-83/84). Os cards
trazem o detalhe por item.
