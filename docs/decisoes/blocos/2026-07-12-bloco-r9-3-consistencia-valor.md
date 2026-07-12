# ADR — Bloco r9-3 consistência-valor: creditValue divergente entre comparison_table e simulation_result

- **Data:** 2026-07-12
- **Branch:** `fix/r9-3-consistencia-valor`
- **Item:** FIX-287 (veredito r9pos2, Sonnet 5, Cálculo 6/10 — P1-2)
- **Natureza:** item único, bloco isolado (onda 1, paralelo a `bloco-r9-3-reveal-guard` e
  `bloco-r9-3-latencia-percebida`; overlap textual declarado em `ai-sdk.ts`, regiões distintas).

---

## FIX-287 — creditValue divergente entre comparison_table e simulation_result (decisão de design real)

### Contexto

`present_comparison_table`/`present_recommendation_card` são coagidos a partir de
`revealGroupsById` (`recommendation-payload.ts`), que só é alimentado pelos resultados de
`search_groups`/`recommend_groups` — o valor-ALVO que a própria Bevi "aproxima" na busca
(`offer.finalValue`, `offer-mapper.ts:141`), não necessariamente o nominal fixo real do grupo.
`simulate_quota` (`executeSimulateQuota`, `ai-sdk.ts:441-467`, FIX-255) já detecta e sinaliza essa
divergência via `creditAdjustmentNotice`, mas isso só chega no `simulation_result` daquele turno —
nunca retroage pra nenhum `comparison_table` (do mesmo turno ou de turnos seguintes).

### Opções levantadas

1. **(Recomendada, escolhida) Memória de sessão (DB)** — sempre que um `groupId` já foi
   simulado em QUALQUER turno anterior da conversa (via artifacts `simulation_result`
   persistidos), toda `comparison_table`/`recommendation_card` subsequente usa o `creditValue`
   REAL conhecido pra aquele grupo (+ marca `rawCreditValue` = valor-alvo divergente, mesmo
   padrão já usado no hero pelo FIX-197/261). Mesmo mecanismo de query já usado por
   `shown-groups.ts` (`loadShownGroups`, artifacts persistidos por `conversationId`).
2. Só dentro do turno (sem DB) — propaga o `creditAdjustmentNotice` só pro `revealGroupsById` do
   turno corrente (via `lastQuotaSimulation`-like). Mais barato, mas não fecha o cenário exato do
   dossiê (turno único: `present_comparison_table` roda ANTES de `simulate_quota` nesse turno —
   a divergência só é conhecida DEPOIS que a tabela já foi renderizada).
3. Patch retroativo ao vivo — corrige a tabela JÁ renderizada na tela via novo evento de
   streaming quando a simulação prova divergência no MESMO turno. Fecha 100% dos casos, mas exige
   novo protocolo de streaming + consumo no frontend — invasivo/arriscado pra um item P1 isolado.

### Decisão

**Escolhida a Opção 1.** Quem decidiu: Kairo, via `AskUserQuestion` com a opção recomendada em
1º lugar (sessão de execução do bloco, 2026-07-12).

**Porquê:** fecha o cenário real do dossiê (turno 8 reaproveita o conhecimento de uma simulação
de turno anterior — o padrão mais comum na jornada: recomenda → simula → cliente questiona
depois) sem exigir mudança de protocolo de streaming. Reusa o mesmo padrão de query já validado
(`shown-groups.ts`) — baixo risco, sem schema novo (o `creditValue` real já está persistido em
qualquer `simulation_result` artifact).

**Gap residual (aceito, documentado):** se a tabela E a 1ª simulação daquele grupo específico
acontecem pela 1ª vez dentro do MESMO turno, nessa ordem exata (tabela antes da simulação
existir), a tabela desse turno específico ainda sai com o valor-alvo — mas a fala do agente já
avisa (o `creditAdjustmentNotice` já força a narração via `system-prompt.ts:541`), e a PRÓXIMA
`comparison_table`/`recommendation_card` (mesmo turno ou turnos seguintes) já corrige. Fechar esse
gap exigiria a Opção 3 (patch retroativo ao vivo) — fora de escopo deste item P1.

### Implementação

- Novo `loadKnownGroupCreditValues(conversationId)` (`shown-groups.ts`) — carrega, de TODOS os
  `simulation_result` persistidos da conversa, `Map<groupId, creditValue real>` (última simulação
  vence).
- `runner.ts`: mescla esse mapa com o resultado do(s) `simulate_quota` do PRÓPRIO turno corrente
  (mesma fonte que já alimenta `lastQuotaSimulation`) — turno corrente sempre tem prioridade sobre
  histórico.
- `recommendation-payload.ts` (`coerceRevealCota`): aceita o mapa de valores reais conhecidos;
  quando o `id` da cota tem um valor real conhecido que diverge do `creditValue` que seria exibido
  (busca/recomendação), reescreve `creditValue` pro real e marca `rawCreditValue` com o valor-alvo
  divergente (mesmo contrato UI do FIX-197/261 — `hasCreditAdjustment`/aviso).
- `comparison-table.tsx` (`QuotaChip`): reusa o aviso discreto já existente no
  `recommendation-card.tsx` (`rawCreditValue` × `creditValue`) — mesma copy, mesmo padrão visual.
- Teste novo: reproduz os 4 grupos do dossiê (todos `creditValue:120000`), um deles (BB) já
  simulado ANTES (creditValue real 160000) — `comparison_table` coagido reflete 160000 pro BB +
  `rawCreditValue:120000`; os outros 3 grupos permanecem intocados em 120000, sem `rawCreditValue`.

### Consequências

- `comparison_table`/`recommendation_card` deixam de contradizer um `simulation_result` já
  conhecido da mesma conversa — fecha o P1-2 do veredito r9pos2 pro caso majoritário da jornada.
- Achado aberto pra rodada seguinte (não implementado aqui): patch retroativo ao vivo (Opção 3)
  pro caso raro de tabela+1ª-simulação-do-grupo na mesma ordem dentro do mesmo turno.
