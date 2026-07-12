# Bloco r9-3 latência percebida — FIX-288 + FIX-289

## Resumo

Os 2 itens deste bloco mitigam a **latência do reveal** (busca+recomendação+simulação+
comparação, turno 7), que ficou em 59-64s em TODOS os 4 reveals completos do veredito r9pos2
(Sonnet 5, UX 5/10) — o item mais pesado do gap G-E/P3-6. Um item é percebido (frontend, Eixo B,
100% seguro), o outro é real (backend, Eixo A-seguro, dedupe sem tocar o contrato sequencial com
a Bevi).

- **FIX-288** — o chip de status ("Buscando grupos") ficava com o MESMO texto por até ~1 minuto
  enquanto uma tool de descoberta real estava em voo — só os 3 pontos animavam, sem sinal de
  progresso. Pro usuário, a tela parecia travada.
- **FIX-289** — `recommend_groups` rebuscava do zero na Bevi os mesmos grupos que `search_groups`
  já tinha trazido no MESMO turno — um round-trip inteiro desperdiçado, contribuindo direto pros
  59-64s.

## FIX-288 — chip evolui a copy com o tempo (frontend)

### Decisão de design

Ver ADR completa: [`docs/decisoes/blocos/2026-07-12-bloco-r9-3-latencia-percebida.md`](../docs/decisoes/blocos/2026-07-12-bloco-r9-3-latencia-percebida.md).

- **Decidi** (via `AskUserQuestion`, opção recomendada) dar estágios progressivos de copy
  (0s/8s/18s) só pras 4 tools de descoberta real (search_groups, recommend_groups,
  simulate_quota, get_rates) — **em vez de** aplicar o mesmo tratamento às 13 tools do mapa
  (incluindo `present_*`/`capture_lead`), **porque** essas últimas são server-side
  determinísticas e rápidas (Lei 1/4) — nunca acumulariam tempo suficiente pra ver um 2º
  estágio; estender o timer a elas seria código morto na prática.

### Implementação

`TOOL_LABELS` (mapa estático `tool → {text, icon}`) virou `TOOL_LABEL_STAGES` (mapa
`tool → Array<{afterMs, text, icon}>`). `StreamingDots` ganhou `useState`/`useEffect` com
`setInterval` de 1s que avança `elapsedMs`, resetado sempre que o prop `tool` muda (nunca conta
do tool anterior); só agenda o interval quando a tool tem mais de 1 estágio. A `key` do
`AnimatePresence` passou a incluir o texto do estágio atual, não só o nome do tool — permite a
transição animar também na evolução dentro do MESMO tool.

**TDD:** `streaming-dots.test.tsx` (RTL + `vi.useFakeTimers`) — RED confirmado (4/6 casos
falhavam antes do fix: sem evolução de estágio, sem reset ao trocar de tool) — GREEN depois.
Gotcha de teste: o Framer Motion usa `requestAnimationFrame` internamente, que não avança com
`vi.advanceTimersByTime` — as asserções leem o `aria-label` do `<output role="status">` (que
atualiza sincronamente a cada render) em vez do texto interno animado pelo `AnimatePresence`.

## FIX-289 — recommend_groups reaproveita a busca de search_groups (backend, sem decisão de design em aberto)

Root cause e correção já travados no card (closure por-turno, mesmo padrão de `hasLance`/
`discoveryFailed` já existentes em `buildConsorcioTools`).

- `executeSearchGroups` passou a expor os grupos crus (`raw`) ao lado do tool-result dietado
  (FIX-23) — `raw` nunca vaza pro modelo, fica só no cache do closure.
- Novo closure `lastSearchGroups` em `buildConsorcioTools` (fresco por turno) — `search_groups`
  grava `{params, groups}`; `recommend_groups` reaproveita quando `category`/`creditMin`/
  `creditMax` batem EXATAMENTE; parâmetros divergentes continuam disparando busca real.
- `recommendWithFallback` ganhou `seedGroups` opcional — pula a busca estrita quando presente; a
  expansão (`EXPANSION_STEPS`) segue intacta se o conjunto reaproveitado for insuficiente.
- **Não paraleliza chamadas à Bevi** — só elimina uma rebusca redundante dentro do fluxo
  sequencial já existente (paralelizar de verdade é PENDENTE-KAIRO à parte, fora de escopo —
  exige confirmar com Bevi/AGX se um PATCH concorrente na mesma proposta é seguro).

**TDD:** `ai-sdk.fix-289-recommend-reaproveita.test.ts` (integration, adapter de fixtures reais
da Bevi + spy em `adapter.searchGroups`) — RED confirmado (2 chamadas com parâmetros
equivalentes) — GREEN depois (1 chamada). Caso de borda coberto: parâmetros divergentes
continuam disparando ≥2 chamadas reais (o dedupe não esconde uma busca genuinamente necessária).

### Efeito colateral corrigido no mesmo commit

`recommendation.fix193.test.ts` fazia match literal de string no source de
`executeRecommendGroups(adapter, args, { hasLance })` — quebrou com a adição de `seedGroups` ao
mesmo call. Regex atualizada, preservando a garantia original que o teste protege (hasLance
segue vindo só do contexto/closure, nunca do input schema da tool).

## Testes

- `pnpm test:unit` (bootstrap completo da stack local deste workspace — DB não existia ainda;
  subida via `bootstrap-workspace.sh` + `db:migrate` + backfill de `ADMIN_EMAIL`/
  `ADMIN_PASSWORD`/`BETTER_AUTH_SECRET`/`IDENTITY_ENC_KEY`/`ANTHROPIC_API_KEY` reais do clone
  principal — `.env.example` não os declara, gap de bootstrap pré-existente já registrado em
  memória): **358 arquivos, 3313 testes, 100% verde**, incluindo Camada 3 (eval real com LLM,
  obrigatória por tocar `src/lib/agent/tools/`).
- 2 falhas observadas isoladamente (`builder.lead-capture.test.ts`,
  `runner.contract-guard.integration.test.ts`) são de ISOLAMENTO de teste (dependem de setup de
  outro arquivo) — confirmado pré-existente via `git stash` (falham mesmo sem minhas mudanças) e
  não aparecem quando a suíte roda completa. Não é regressão deste bloco.

## Incidente operacional — colisão de `git stash` entre sessões concorrentes

Durante a execução, tentei usar `git stash`/`git stash pop` pra isolar as duas falhas acima —
`refs/stash` é **compartilhado entre TODOS os worktrees do mesmo repositório** (`.git` bare
comum), não é por-worktree. O `stash pop` trouxe o WIP do bloco IRMÃO `fix/r9-3-consistencia-valor`
(FIX-287, rodando concorrentemente noutro worktree) pro meu working directory, e meu próprio
stash ficou órfão. Recuperado sem perda:

1. Preservei o WIP alheio (`recommendation-payload.ts`, mudanças FIX-287) num branch local
   `backup-wip-fix-r9-3-consistencia-valor` (aponta pro commit dangling recuperado via
   `git fsck --unreachable`) — não fica dependente de garbage collection.
2. Restaurei meu working directory (`git checkout --`) e reapliquei minhas próprias edições
   manualmente (Edit tool, não `git stash`), verificando que o diff final batia exatamente com o
   que eu tinha antes.
3. Testes rerodados do zero, tudo verde.

**Não commitei nem toquei o branch da sessão irmã** — só criei um ponteiro local de segurança.
Detalhe completo no ADR do bloco. Sugestão registrada lá: evitar `git stash` em worktrees quando
há sessões concorrentes no mesmo repo compartilhado.

## Gaps honestos

- **Paralelizar as chamadas reais à Bevi** (search_groups/recommend_groups/simulate_quota
  concorrentes) continua fora de escopo — é o `PENDENTE-KAIRO` declarado no `_bloco.md`, exige
  confirmação Bevi/AGX antes de qualquer implementação (decisão de arquitetura, não autônoma).
- O `branch backup-wip-fix-r9-3-consistencia-valor` (local, não pushado) precisa de limpeza
  depois que o bloco irmão mergear normalmente — confirmar antes que o WIP recuperado não é
  necessário (pode já ter sido commitado pela sessão deles nesse meio tempo).
- Gap de bootstrap do worktree (não deste bloco, mas bloqueava o TDD): `.env.example` não
  declara `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`BETTER_AUTH_SECRET`/`ANTHROPIC_API_KEY` reais que o
  `docker-compose.yml`/pre-commit Camada 3 exigem — mesmo padrão já registrado em memória
  (`project_aja_worktree_env_bootstrap`). Corrigi localmente (backfill do clone principal) pra
  destravar este bloco; nada disso foi commitado (segredos de dev, fora do escopo).
