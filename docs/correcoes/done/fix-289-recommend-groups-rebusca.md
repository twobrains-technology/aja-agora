---
id: FIX-289
titulo: "recommend_groups rebusca do zero o que search_groups já trouxe no mesmo turno (Eixo A-seguro — latência real, backend, SEM paralelizar Bevi)"
status: done
severidade: media
projeto: aja-agora
bloco: bloco-r9-3-latencia-percebida
arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/recommendation.ts
  - src/lib/agent/tools/ai-sdk.fix-289-recommend-reaproveita.test.ts
  - src/lib/agent/recommendation.fix193.test.ts
rodada: "2026-07-12 loop r9 ONDA 3 (pós-onda-2 Sonnet 4/10, P3-6/G-E, veredito-r9pos2-sonnet.md §3)"
commit: b35a7622
executado_em: 2026-07-12
---
## Palavras do juiz (veredito r9pos2, Sonnet 5 — P3-6, UX 5/10)
> "Latência do reveal (busca+recomendação+simulação+comparação, turno 7) ficou em 59-64s em
> TODOS os 4 reveals completos desta rodada [...] consistente, não é ruído."
> — `.processo/loop/evidencias-r9/veredito-r9pos2-sonnet.md` §1 (UX) + §3 (P3-6)

**⚠️ Escopo travado (decisão do Kairo já registrada na spec da onda):** este item é o **Eixo
A-seguro** — dedupe de chamada redundante. **NÃO paralelizar as chamadas reais à Bevi**
(`search_groups`/`recommend_groups`/`simulate_quota` continuam sequenciais) — isso é um
`PENDENTE-KAIRO` à parte que exige confirmar com Bevi/AGX se um PATCH concorrente na mesma
proposta é seguro (o código hoje assume sequencial, `bevi-self-contract-adapter.ts`). Este item
NÃO decide isso — só elimina uma rebusca redundante.

## Cenário exato
- **Rota/tela:** chat web, turno de reveal — o modelo tipicamente chama `search_groups` (1ª
  impressão) e, na sequência do MESMO turno, `recommend_groups` (ranking pra escolher a
  recomendação âncora).
- **Passos:** `search_groups` → adapter já buscou/cacheou os grupos reais pro
  `segmento:valor:embutido` daquele turno → `recommend_groups` roda
  `executeRecommendGroups` → `recommendWithFallback` (`recommendation.ts:301-338`) → chama
  `adapter.searchGroups(searchParams)` de novo, do zero.
- **Dados usados:** latências reais do dossiê (reveal completo 59-64s, atribuídas
  majoritariamente a `search_groups`/`recommend_groups` sequenciais, spec da onda 3 + G-E da
  onda 2).

## Esperado × Atual
- **Esperado:** `recommend_groups`, quando chamado no MESMO turno logo após `search_groups` com
  parâmetros equivalentes, reaproveita os grupos JÁ buscados (rankeia sobre o que já existe) em
  vez de disparar uma busca nova e independente.
- **Atual:** `executeRecommendGroups` (`ai-sdk.ts:503-521`) chama incondicionalmente
  `recommendWithFallback(adapter, searchParams)` (`recommendation.ts:301-338`), que sempre
  invoca `adapter.searchGroups(params)` — uma chamada de descoberta completa e independente,
  sem checar se o MESMO adapter (mesma conversa) já tem esses grupos por causa da
  `search_groups` tool-call anterior no turno.

## Root cause (INVESTIGADO — provado no código)
- `recommend_groups` (`ai-sdk.ts:1320-1331`) → `executeRecommendGroups` (`ai-sdk.ts:503-521`) →
  `recommendWithFallback(adapter, searchParams)` (`recommendation.ts:301-338`), que SEMPRE chama
  `adapter.searchGroups(params)` (linha 305) como primeiro passo — e, se a busca estrita não
  atingir `MIN_OPTIONS`, ainda dispara chamadas ADICIONAIS de expansão de faixa
  (`EXPANSION_STEPS`, linhas 320-331) — cada uma um novo round-trip potencial.
- `search_groups` (a tool separada, `ai-sdk.ts:1261-1271`) chama `executeSearchGroups` →
  `adapter.searchGroups(args)` diretamente — o MESMO método de adapter, mas invocado de forma
  totalmente independente do que `recommend_groups` fará depois no mesmo turno.
- O adapter (`BeviSelfContractAdapter`) tem cache por chave `${segmento}:${valor}:${embutido}`
  (`bevi-self-contract-adapter.ts:246-248`, `ensureOffers`) — quando os parâmetros batem
  EXATAMENTE, a 2ª chamada pode ser absorvida pelo cache; mas essa é uma propriedade INCIDENTAL
  do adapter, não um contrato garantido pela tool: `recommendGroupsSchema` (`ai-sdk.ts:289-310`)
  exige `budget` (campo que `search_groups`/`searchGroupsSweepInput` não tem) e não tem `sweep` —
  se o modelo passar `creditMin`/`creditMax` com QUALQUER diferença do que passou em
  `search_groups` (arredondamento, ausência de um dos dois campos, sweep ligado numa chamada e
  não na outra), a chave de cache diverge e o `recommend_groups` dispara uma consulta Bevi
  NOVA e completa — nenhum código verifica/força que os dois parâmetros sejam idênticos, e o
  fallback de expansão (`EXPANSION_STEPS`) do `recommendWithFallback` NUNCA está coberto pelo
  cache do `search_groups` simples (que não expande faixa).
- Ou seja: a arquitetura trata `recommend_groups` como uma busca de descoberta
  INDEPENDENTE (ela mesma decide buscar, expandir e rankear) em vez de uma etapa de RE-RANKING
  sobre o resultado que o PRÓPRIO turno já obteve via `search_groups` — não há nenhum contrato
  de reuso entre as duas tools dentro do mesmo turno, mesmo com `runner.ts:430-432` já indexando
  ambas em `revealGroupsById` (estrutura que poderia ser essa fonte compartilhada, mas hoje só é
  usada DEPOIS, para coagir os cards de apresentação — nunca para alimentar `recommend_groups`).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `recommend_groups`/`executeRecommendGroups` aceitar (via closure, mesmo padrão de `hasLance`) os grupos JÁ buscados no turno atual (ex.: a partir de um `revealGroupsById`/cache por-turno compartilhado entre as tools do mesmo `buildConsorcioTools`) e, se disponíveis e com parâmetros equivalentes, RANQUEAR sobre eles em vez de chamar `adapter.searchGroups` de novo | `ai-sdk.ts` (`executeRecommendGroups`, ~503-521) — novo parâmetro/closure de grupos já buscados |
| `recommendWithFallback` (`recommendation.ts:301-338`) ganha uma variante/overload que recebe grupos JÁ buscados como ponto de partida (pulando a chamada estrita `adapter.searchGroups(params)` da linha 305 quando já tem os dados), mantendo a lógica de expansão (`EXPANSION_STEPS`) só se o conjunto reaproveitado for insuficiente | `recommendation.ts` |
| Não mudar o contrato sequencial com a Bevi (sem paralelizar chamadas reais) — a economia vem de NÃO refazer uma chamada que já foi feita, não de rodar 2 chamadas ao mesmo tempo | decisão de escopo, registrar no `_bloco.md`/ADR se necessário |

## Regressão exigida
- Novo teste (integration, `recommendation.fix-289-reaproveita-busca.test.ts` ou
  `ai-sdk.fix-289-recommend-reaproveita.test.ts`): mocka o adapter com um spy em `searchGroups`;
  chama `search_groups` seguido de `recommend_groups` no MESMO turno com parâmetros
  equivalentes; assevera que `adapter.searchGroups` foi chamado **1 vez** (não 2+), e que o
  ranking final ainda reflete os grupos reais retornados.
- Caso de borda: parâmetros DIVERGENTES entre as duas chamadas (ex.: `recommend_groups` com
  faixa de expansão que `search_groups` nunca buscou) continuam disparando uma nova busca real —
  o dedupe não pode esconder uma busca genuinamente necessária.
- `pnpm test:unit` verde.
