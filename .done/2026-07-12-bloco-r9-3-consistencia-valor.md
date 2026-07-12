# Bloco r9-3 consistência-valor — FIX-287

## Resumo

Item único (P1 — Cálculo 6/10 no veredito r9pos2, sonda `probe-i2-justificativa` turno 8):
`comparison_table` mostrava `creditValue: 120000` (o valor-alvo pedido) pro grupo BANCO DO
BRASIL, mas o `simulation_result` do MESMO `groupId`, no MESMO turno, mostrava
`creditValue: 160000` (nominal real do grupo, que não aceita ajuste livre) — 33% de diferença,
silenciosa na tabela, sem qualquer aviso até o cliente questionar.

## Root cause (já investigado no card, confirmado no código)

`present_comparison_table`/`present_recommendation_card` são coagidos server-side a partir do
grupo indexado do `search_groups`/`recommend_groups` do turno (`revealGroupsById`) — que só
carrega o valor-ALVO que a Bevi aproxima na busca (`offer-mapper.ts:141`,
`offer.finalValue`). `simulate_quota` (`executeSimulateQuota`, `ai-sdk.ts:441-467`, FIX-255) já
detecta e sinaliza a divergência via `creditAdjustmentNotice`, mas esse fato nunca retroagia
pra nenhum `comparison_table`/`recommendation_card` — nem do mesmo turno, nem de turnos
seguintes da mesma conversa.

## Decisão de design

Ver ADR completa: [`docs/decisoes/blocos/2026-07-12-bloco-r9-3-consistencia-valor.md`](../docs/decisoes/blocos/2026-07-12-bloco-r9-3-consistencia-valor.md).

**Decidi** (Opção "memória de sessão via DB", recomendada, via `AskUserQuestion`) fazer o
`creditValue` REAL de um `groupId` já simulado em QUALQUER turno anterior da conversa prevalecer
sobre o valor-alvo da busca em toda `comparison_table`/`recommendation_card` subsequente, **em
vez de** (a) propagar só dentro do turno corrente (mais barato, mas não fecha o cenário real do
dossiê — a tabela do turno 8 sai ANTES do `simulate_quota` rodar) ou (b) um patch retroativo ao
vivo via novo evento de streaming (fecha 100% dos casos, mas exige mudar o protocolo de
streaming — desproporcional pra um item P1 isolado), **porque** fecha o caso majoritário e
realista da jornada (recomenda → simula → cliente questiona depois, reaproveitando conhecimento
de turno anterior) sem tocar streaming, reusando o mesmo padrão de query já validado em
`shown-groups.ts`.

**Gap residual aceito:** se a tabela E a 1ª simulação daquele grupo específico acontecem pela 1ª
vez dentro do MESMO turno, nessa ordem exata, a tabela desse turno específico ainda sai com o
valor-alvo — mas a fala do agente já avisa (`creditAdjustmentNotice` força a narração via
`system-prompt.ts:541`), e a PRÓXIMA tabela (mesmo turno ou seguintes) já corrige.

## Implementação

- Novo `loadKnownGroupCreditValues(conversationId)` (`known-credit-values.ts`) — mina, de TODOS
  os `simulation_result` já persistidos na conversa, `Map<groupId, creditValue real>`. Extrator
  puro `extractKnownCreditValue` (mesmo padrão split pure/IO de `shown-groups.ts`), reaproveitado
  também pra capturar o `simulate_quota` do turno CORRENTE ao vivo.
- `runner.ts`: `turnKnownCreditValues` (turno corrente, atualizado a cada `tool-result` de
  `simulate_quota`) mesclado com o histórico da conversa (memoizado, carregado só quando o turno
  realmente emite `comparison_table`/`recommendation_card`, igual ao padrão já usado pros logos
  de administradora) — turno corrente prevalece sobre histórico.
- `recommendation-payload.ts` (`coerceRevealCota`): aceita o mapa de valores reais conhecidos;
  quando o `groupId` da cota tem um valor real conhecido que diverge do que seria exibido,
  reescreve `creditValue` pro real e marca `rawCreditValue` com o valor-alvo divergente (mesmo
  contrato de aviso já usado no hero desde o FIX-197/261).
- `comparison-table.tsx` (`QuotaChip`): novo aviso discreto (`Info` + "Não aceita ~X") reusando
  o mesmo critério `hasCreditAdjustment` do `recommendation-card.tsx` — só aparece quando a
  divergência é real e conhecida, nunca fabricada.

## Testes

- **TDD strict**: `recommendation-payload.test.ts` — RED confirmado (reverti só o fix,
  mantendo o teste; a tabela do dossiê mentia — `120000` em vez de `160000`), GREEN depois.
  Cenário exato do dossiê: 4 grupos com `creditValue:120000`, BB já simulado com nominal real
  `160000` → tabela reflete `160000` + `rawCreditValue:120000` pro BB; os outros 3 grupos
  permanecem intocados, sem `rawCreditValue`. Casos extras: sem divergência conhecida (não
  reescreve), grupo nunca simulado (não inventa aviso), hero (`coerceRecommendationPayload`)
  também corrige.
- `known-credit-values.test.ts` — extrator puro (tipo errado, payload malformado,
  creditValue ≤0/NaN → nunca contamina o mapa).
- `known-credit-values.integration.test.ts` — DB real (gate `HAS_DB`, mesmo padrão de
  `shown-groups.integration.test.ts`): mina o `creditValue` real de todos os turnos da
  conversa, ignora `comparison_table` (nunca é fonte de verdade), grupo nunca simulado ausente
  do mapa, conversa vazia não quebra.
- Suíte completa: `pnpm test:unit` rodado em container transitório do workspace (host sem
  `node_modules`, migração via `drizzle-kit migrate`) — **357 arquivos, 3312 testes, 100%
  verde** (1 flake pré-existente e não relacionado em `migrate-guard.test.ts` na 1ª rodada da
  suíte completa, confirmado como flake de ordem — passou sozinho e na 2ª rodada completa).
  `biome check` limpo nos arquivos tocados.

## Incidente durante a execução (registrado por transparência)

`git stash push/pop` num arquivo isolado colidiu com `refs/stash` — que é **compartilhado entre
todos os worktrees do mesmo repositório Git**, não isolado por worktree. Como o bloco irmão
(`bloco-r9-3-latencia-percebida`) rodava ao vivo em paralelo no mesmo momento, o `pop` trouxe o
WIP dele (FIX-289, `ai-sdk.ts`/`recommendation.ts`) pro meu working tree, e possivelmente meu
WIP apareceu no dele. Detectado via `git status`/`git worktree list` antes de qualquer commit;
resolvido restaurando os 2 arquivos alheios (`git checkout -- <path>`, seguro porque o commit
deles já estava salvo na branch/worktree própria) e reaplicando meu fix via `Edit` direto (sem
depender do stash). Nenhum commit contaminado chegou a acontecer nesta branch. Lição: evitar
`git stash` em setups multi-worktree do mesmo repo quando há sessões concorrentes — preferir
edição direta ou `git diff`/backup de arquivo pra validações RED/GREEN.

## Gaps honestos

- Gap residual documentado acima (tabela+1ª-simulação do mesmo grupo, mesma ordem, mesmo
  turno) — fechar exigiria patch retroativo ao vivo (Opção 3 da decisão), fora de escopo deste
  item P1.
- Push feito (`fix/r9-3-consistencia-valor` → origin). Merge/integração na base é do
  orquestrador da onda (`merge-wave.sh`), conforme protocolo do bloco.
