---
id: FIX-287
titulo: "comparison_table e simulation_result do MESMO groupId, no MESMO turno, mostram creditValue divergente (120k vs 160k) sem aviso na tabela"
status: done
severidade: media
projeto: aja-agora
bloco: bloco-r9-3-consistencia-valor
arquivos:
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/tools/known-credit-values.ts
  - src/components/chat/artifacts/comparison-table.tsx
rodada: "2026-07-12 loop r9 ONDA 3 (pós-onda-2 Sonnet 4/10, P1-2, veredito-r9pos2-sonnet.md §3)"
commit: d73037b
executado_em: "2026-07-12"
---
## Palavras do juiz (veredito r9pos2, Sonnet 5 — P1-2, Cálculo 6/10)
> "em `probe-i2` turno 8, o artifact `comparison_table` mostra BANCO DO BRASIL com `creditValue:
> 120000` (mesmo valor pedido, groupId `6a3e6ceb...932d7`), mas o `simulation_result` do MESMO
> groupId, no MESMO turno, mostra `creditValue: 160000` — 33% de diferença pro mesmo registro
> dentro da mesma resposta [...] isso deixa uma tabela comparativa mostrando um número que a
> própria simulação desmente, sem qualquer aviso na tabela em si (só se o cliente perguntar)."
> — `.processo/loop/evidencias-r9/veredito-r9pos2-sonnet.md` §3 (P1-2) + §1 (Cálculo)

## Cenário exato
- **Rota/tela:** chat web, turno 8 de `probe-i2-justificativa` (pergunta de exatidão do usuário
  sobre a carta recomendada).
- **Passos:** usuário pergunta "essa carta que você recomendou é de 120 mil como pedi?" → agente
  chama `search_groups` de novo → `present_comparison_table` com 4 grupos, todos
  `creditValue: 120000` (BB incluso, `groupId 6a3e6ceb419653c0a99932d7`) → chama `simulate_quota`
  para ESSE MESMO groupId → `present_simulation_result` retorna `creditValue: 160000` pro mesmo
  groupId.
- **Dados usados:** `.processo/loop/evidencias-r9/dossies-r9pos2/probe-i2-justificativa/dossie.json`
  turno 8, artifacts `comparison_table.payload.groups[0]` (BB, `creditValue: 120000`) vs
  `simulation_result.payload` (mesmo `groupId`, `creditValue: 160000`).

## Esperado × Atual
- **Esperado:** `creditValue` do mesmo `groupId` é o MESMO número em qualquer artifact que o
  exiba na mesma janela de dados (fonte única) — ou, se a Bevi realmente não permite ajuste
  livre pra esse grupo, a divergência aparece JÁ na tabela comparativa (não só quando o cliente
  questiona).
- **Atual:** `comparison_table` mostra 120.000 (valor-ALVO da busca); `simulation_result` do
  mesmo grupo mostra 160.000 (valor NOMINAL real do grupo) — 33% de diferença, silenciosa na
  tabela.

## Root cause (INVESTIGADO — provado no código)
1. **`present_comparison_table`/`present_simulation_result` são preenchidos pela LLM, não pelo
   servidor.** Diferente de `present_recommendation_card` (que tem `coerceRecommendationPayload`
   reescrevendo os campos a partir de `revealGroupsById`, `runner.ts:654-666`),
   `present_comparison_table` (`ai-sdk.ts:1131-1138`) e `present_simulation_result`
   (`ai-sdk.ts:1158-1171`) só fazem `markShown`/`evaluateActionPrecondition` e devolvem uma
   string de confirmação — o `payload` que a UI recebe é literalmente o `args` que o MODELO
   escreveu na chamada da tool (nenhuma reescrita/validação server-side do `creditValue`).
   Runner (`runner.ts:667-673`) só coage `comparison_table` via `coerceComparisonPayload`, mas
   isso reescreve campos a partir de `revealGroupsById` indexado por `groupId` — SE o
   `revealGroupsById` daquele turno já tinha essa entrada como 120.000 (da busca que rodou
   ANTES do `simulate_quota`), a coerção NÃO CORRIGE, só confirma o número que já estava errado.
2. **A raiz real do 120.000 × 160.000 é uma DIVERGÊNCIA ADMITIDA pelo próprio adapter.**
   `executeSimulateQuota` (`ai-sdk.ts:441-467`) já detecta e sinaliza isso: quando
   `Math.abs(args.creditValue - details.creditValue) > 1` (ou seja, o valor que a busca indicava
   ≠ o nominal real do grupo), ele anexa `creditAdjustmentNotice` com a mensagem "esse grupo não
   permite ajuste livre de crédito [...] a simulação abaixo é do valor NOMINAL do grupo
   (160.000), não do valor pedido" (comentário FIX-255, `ai-sdk.ts:450-465`) — ESSE aviso existe
   e é anexado ao retorno de `simulate_quota`, mas SÓ chega no `simulation_result`; o
   `comparison_table` (emitido ANTES, a partir da busca/recomendação, `beviOfferToGroupSummary`
   → `offer-mapper.ts:141` `creditValue: offer.finalValue`) nunca é corrigido/marcado
   retroativamente quando a simulação subsequente prova que aquele grupo específico não aceita
   o valor-alvo.
3. **Por que a busca mostra 120.000 pra um grupo cujo nominal é 160.000:** o adapter chama
   `client.simulate({ simulationValue: value, ... })` (`bevi-self-contract-adapter.ts:268-272`)
   com o valor-ALVO (120.000); a Bevi devolve ofertas "candidatas" àquele alvo — inclusive grupos
   com denominação fixa que NÃO bate exatamente, e o mapper (`offer-mapper.ts:141`,
   `beviOfferToGroupSummary`) usa `offer.finalValue` como está no retorno da API pra ESSA query
   (aparentemente já normalizado/aproximado pra perto do alvo pela própria Bevi ou pelo adapter
   nesse ponto do pipeline — não há coerção adicional no lado Aja entre a busca e o
   `comparison_table`). Só quando `simulate_quota` roda uma consulta DEDICADA
   (`adapter.getGroupDetails`/`adapter.simulateQuota`, que resolvem pelo `offerIndex` já
   atualizado) o valor NOMINAL real (160.000, fixo, sem ajuste) aparece — e é aí que a
   diferença "estoura".

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Fonte única de `creditValue` por `groupId`: quando `simulate_quota`/`executeSimulateQuota` detectar `creditAdjustmentNotice` (grupo não aceita o valor-alvo), propagar esse fato de volta pro `revealGroupsById`/estado do turno ANTES de qualquer `comparison_table` subsequente ser coagido — ou, no mínimo, anexar um campo `creditValueDivergesFromRequested`/aviso visível na LINHA da tabela pra aquele grupo específico | `ai-sdk.ts` (`executeSimulateQuota`, ~441-467) + `runner.ts` (`coerceComparisonPayload`/`revealGroupsById`, ~667-673) |
| `coerceComparisonPayload` (chamada em `runner.ts:667-673`) reescrever `creditValue` da linha do grupo com o valor REAL conhecido (se já simulado nesse turno/sessão), não só os campos que hoje já reescreve | `runner.ts` / `recommendation-payload.ts` (função de coerção da tabela) |
| Testar contra os 4 grupos do dossiê (BB diverge, CANOPUS/ÂNCORA/RODOBENS batem exato) — a correção não pode achatar TODOS os grupos pro mesmo aviso, só o que realmente diverge | novo teste de `recommendation-payload`/`server-cards` |

## Regressão exigida
- Novo teste (unit, `recommendation-payload.test.ts` ou arquivo dedicado
  `comparison-payload.fix-287-creditvalue-divergente.test.ts`): dado um `revealGroupsById`/oferta
  cujo `simulate_quota` já sinalizou `creditAdjustmentNotice` pro `groupId` X, o
  `comparison_table` coagido pro MESMO `groupId` X reflete o valor REAL (ou um aviso explícito),
  nunca o valor-alvo desmentido; os OUTROS grupos do mesmo comparativo (sem divergência)
  permanecem com o `creditValue` deles intocado.
- Reproduzir o cenário exato do dossiê: 4 grupos com `creditValue:120000`, um deles (BB)
  simulado com nominal real 160.000 — o teste falha ANTES do fix (tabela mente), passa depois.
- `pnpm test:unit` verde.
