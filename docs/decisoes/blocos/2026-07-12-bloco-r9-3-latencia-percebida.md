# ADR — Bloco r9-3 latência percebida: chip evolutivo (FIX-288) + reuso de busca (FIX-289)

- **Data:** 2026-07-12
- **Branch:** `fix/r9-3-latencia-percebida`
- **Itens:** FIX-288, FIX-289 (veredito r9pos2, Sonnet 5 — P3-6/G-E, UX 5/10)
- **Natureza:** latência percebida (Eixo B, frontend) + latência real (Eixo A-seguro, backend
  dedupe) do reveal (59-64s em todos os 4 reveals completos da rodada). Bloco isolado (onda 1,
  paralelo a `bloco-r9-3-reveal-guard` e `bloco-r9-3-consistencia-valor`).

---

## FIX-288 — chip de status evolui a copy com o tempo (decisão de design real)

### Contexto

`StreamingDots` (`streaming-dots.tsx`) era uma função pura do prop `tool` — 1 texto fixo por
tool (`TOOL_LABELS`), sem timer/estado interno. Enquanto `search_groups`/`recommend_groups`/
`simulate_quota`/`get_rates` estavam em voo (15-64s, latências reais do dossiê), o chip ficava
com o MESMO texto o tempo todo — só os 3 pontos animavam, sem sinal de progresso real.

### A decisão em aberto

O card já trazia a correção proposta (timer interno que evolui a copy) mas não travava (a)
quais tools ganham estágios progressivos e (b) os limiares de tempo/copy exatos — decisão de
UX/produto, não implementação técnica óbvia.

### Opções levantadas

1. **(Recomendada, escolhida) Só as 4 tools de descoberta real** (search_groups,
   recommend_groups, simulate_quota, get_rates) ganham 3 estágios (0s/8s/18s); as demais
   (present_*, capture_lead etc. — server-side determinísticas, Lei 1/4) mantêm 1 único texto,
   já que nunca chegariam ao 2º estágio na prática.
2. Todas as 13 tools do `TOOL_LABELS` ganham os mesmos estágios — mais uniforme, mas estágio
   morto na maioria dos casos.

### Decisão

**Escolhida a Opção 1.** Quem decidiu: Kairo, via `AskUserQuestion` (sessão de execução do
bloco, 2026-07-12).

**Porquê:** as tools rápidas nunca acumulam tempo suficiente pra ver um 2º estágio — adicionar
estágios a elas seria código morto na prática, sem ganho de UX real.

### Implementação

- `TOOL_LABELS` → `TOOL_LABEL_STAGES: Record<string, ToolLabelStage[]>` — as 4 tools de
  descoberta real ganham `[{afterMs:0}, {afterMs:8_000}, {afterMs:18_000}]`; as demais mantêm
  array de 1 estágio (`afterMs:0`, texto de hoje — sem regressão).
- Timer via `useState`/`useEffect` com `setInterval` de 1s, resetado sempre que `tool` muda
  (nunca continua contando do tool anterior); só agenda o interval quando a tool tem >1 estágio.
- `key` do `AnimatePresence` passou a incluir o texto do estágio (`tool:${tool}:${label.text}`),
  não só o nome do tool — permite a transição animar também na evolução de estágio dentro do
  MESMO tool.
- Teste (`streaming-dots.test.tsx`, RTL + `vi.useFakeTimers`) assere via `aria-label` do
  `<output role="status">` em vez do texto interno animado — o Framer Motion usa
  `requestAnimationFrame` (não avança com `vi.advanceTimersByTime`), então a asserção síncrona
  no `aria-label` é a forma robusta de testar sem depender da animação de saída completar.

---

## FIX-289 — recommend_groups reaproveita a busca de search_groups no mesmo turno (sem decisão de design aberta)

Root cause e correção já travados no card (closure por-turno, mesmo padrão de `hasLance`/
`discoveryFailed` em `buildConsorcioTools`). Implementação:

- `executeSearchGroups` (`ai-sdk.ts`) passou a expor os grupos crus (`raw`, com
  `tipoOferta`/`grupo`/`embeddedVariant` intactos) ao lado do tool-result já dietado (FIX-23) —
  `raw` NUNCA vaza pro modelo, fica só no cache do closure.
- Novo closure `lastSearchGroups` em `buildConsorcioTools` (fresco por turno, já que
  `buildConsorcioTools` é reconstruído a cada turno) — `search_groups` grava
  `{ params, groups }`; `recommend_groups` reaproveita quando `category`/`creditMin`/`creditMax`
  batem EXATAMENTE (`sameSearchParams`); parâmetros divergentes (ex.: faixa de expansão que
  `search_groups` nunca buscou) continuam disparando busca real.
- `recommendWithFallback` (`recommendation.ts`) ganhou parâmetro opcional `seedGroups` — quando
  presente, substitui a busca estrita (`adapter.searchGroups(params)`); a lógica de expansão
  (`EXPANSION_STEPS`) segue intacta, batendo a Bevi de verdade se o conjunto reaproveitado for
  insuficiente (`< MIN_OPTIONS`).
- **Não paraleliza chamadas à Bevi** — o contrato sequencial não muda; a economia vem de NÃO
  refazer uma chamada já feita, nunca de rodar 2 chamadas ao mesmo tempo (PENDENTE-KAIRO à parte,
  fora de escopo, ver `_bloco.md`).
- Teste (`ai-sdk.fix-289-recommend-reaproveita.test.ts`, integration com fixture real da Bevi +
  spy em `adapter.searchGroups`): 1 chamada com parâmetros equivalentes, ≥2 com parâmetros
  divergentes, comportamento preservado sem `search_groups` prévio no turno.

### Efeito colateral corrigido no mesmo commit

`recommendation.fix193.test.ts` fazia match literal de string no source de
`executeRecommendGroups(adapter, args, { hasLance })` — quebrou com a adição de `seedGroups` ao
mesmo call. Regex atualizada pra `{ hasLance, seedGroups }`, preservando a garantia original (o
CONTEXTO/closure segue sendo a única fonte de `hasLance`, nunca o input schema da tool).

---

## Incidente cross-sessão (registrar pro Kairo — não é decisão de produto, é operacional)

Durante a execução, um `git stash` + `git stash pop` colidiu com uma sessão CONCORRENTE do bloco
irmão `fix/r9-3-consistencia-valor` (FIX-287) — `refs/stash` é **compartilhado entre todos os
worktrees do mesmo repositório** (`.git` bare comum), não é por-worktree. O `stash pop` trouxe o
WIP alheio (mudanças em `recommendation-payload.ts`, FIX-287) pro meu working directory e deixou
meu próprio stash órfão. Recuperado sem perda: o WIP do outro bloco foi preservado num branch
`backup-wip-fix-r9-3-consistencia-valor` (aponta pro commit dangling `18a86905...`) antes de
restaurar meu working directory e reaplicar minhas edições manualmente (sem tocar `git stash` de
novo). **Ação sugerida:** o branch `backup-wip-fix-r9-3-consistencia-valor` pode ser apagado
depois que o bloco `fix/r9-3-consistencia-valor` mergear normalmente (confirmar que o WIP
recuperado não é necessário — pode já ter sido commitado pela própria sessão deles). Lição pra
memória: evitar `git stash` em worktrees quando há sessões concorrentes no mesmo repo — preferir
`git diff > patch`/edição manual ou `git worktree` dedicado sem stash compartilhado.
