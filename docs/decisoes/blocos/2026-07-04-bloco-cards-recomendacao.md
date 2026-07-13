# ADR — Bloco Cards-Recomendação: mesmo peso, parcela antes/depois, logo, lance médio, reorder

- **Data:** 2026-07-04
- **Branch:** `feat/cards-recomendacao-lance`
- **Itens:** FIX-220, FIX-221, FIX-223, FIX-222, FIX-224 (Ata de alinhamento com o cliente,
  2026-07-04 — [`docs/jornada/atas/2026-07-04-mudancas-cliente.md`](../../jornada/atas/2026-07-04-mudancas-cliente.md))
- **Natureza:** display de recomendação (cards + simulador + coerção server-side). Cinco
  itens do mesmo bloco de superfície; FIX-224 (reorder) depende de FIX-221 (parcela no card)
  já estar pronto.

---

## FIX-224 — ordem dos 3 blocos do reveal + consolidação de lance no card

### Contexto

A Ata (item 4.2) apontou que a sequência de artifacts do reveal — `recommendation_card` →
`comparison_table` → `simulation_result` — estava confusa, e pediu pra **avaliar consolidar**
a informação de lance dentro do próprio card em vez de deixá-la num 3º bloco solto.

Antes desta decisão, o FIX-221 já tinha absorvido pro `recommendation_card` boa parte do que
antes só existia no `contemplation-dial`/`simulation_result`: o bloco "até contemplar → após
receber" (parcela antes/depois, modelo AMORTIZA) e o enunciado "usar lance embutido = recebe
menos crédito". O `simulation_result` continuou com conteúdo que **não** dá pra remover sem
mexer numa regra de compliance (ver abaixo): cenário com lance detalhado (`lanceScenario`,
`necessaryBidToContemplate`) e correção prevista (INCC/IPCA).

A regra **Bv2-07** (CMN 4.927/2021, já existente no `system-prompt.ts`) **exige** que
`present_recommendation_card`/`present_group_card` seja sempre seguido de `simulate_quota` +
`present_simulation_result` no mesmo fluxo — é o disclosure regulatório pré-assinatura. Isso
significa que **`simulation_result` não pode deixar de existir como artifact separado** nesta
onda; a única alavanca segura era a **ORDEM** dos 3 blocos, não a eliminação de um deles.

### Opções levantadas

Apresentadas ao Kairo via `AskUserQuestion` (opção recomendada em 1º):

1. **(Recomendada, escolhida) Card → detalhamento → comparar outras.**
   `recommendation_card` (opção completa: parcela, logo, lance médio, antes/depois) →
   `simulation_result` (aprofunda: cenário com lance, correção prevista) → `comparison_table`
   (convite pra comparar, por último, mesmo peso pra todas). Resolve uma inconsistência que já
   existia no código: o `system-prompt.ts` já documentava a "sequência correta" geral como
   card→simulate→simulation_result (sem mencionar onde `comparison_table` entra); o reveal
   específico intercalava `comparison_table` no meio. As duas fontes agora concordam.
2. Card + comparar juntos (como hoje) → detalhamento por último. Mudança mínima; mantém a
   experiência de ver todas as opções lado a lado primeiro.
3. Manter a ordem atual, só suavizar as transições de texto. Não resolve a confusão apontada
   pela Ata.

### Decisão

**Opção 1.** Motivos:
- Conta uma história linear: mostra a opção completa primeiro (o card já rico pós-FIX-220/221/
  222/223), aprofunda os números financeiros dela, e só then convida a comparar — em vez de
  interromper a narrativa da opção recomendada com o carrossel de alternativas no meio.
- Bate com o "estágio 1" da recomendação em 2 estágios da jornada canônica (item 6: "carta
  exata pedida, com briefing honesto") — mostrar UMA opção completa antes de abrir pra
  comparação, sem prometer curadoria que ainda não existe (isso é onda 2).
- Não mexe na regra de compliance (Bv2-07) nem na inseparabilidade `recommendation_card`↔
  `comparison_table` (FIX-78) — só reordena a POSIÇÃO de `comparison_table`, sem soltar a regra
  "os dois saem no mesmo turno".
- Resolve a divergência silenciosa entre `system-prompt.ts` ("sequência correta") e
  `directives.ts` (ordem do reveal) que provavelmente contribuiu pra confusão original.

### Alternativas descartadas
- Opção 2: mudança mínima demais — não separa claramente "ver a opção" de "comparar", que era
  o cerne da reclamação da Ata.
- Consolidar `simulation_result` inteiro dentro do card (eliminar o 3º artifact): rejeitada
  sem confirmação — mexeria na regra Bv2-07 (compliance CMN 4.927/2021) sem sinal de que isso
  é seguro; risco alto demais pra decidir sozinho nesta sessão.

### Implementação
- `directives.ts` (`buildSearchSummaryDirective`): passos renumerados — 3 (card) → 4 (simulate
  + simulation_result) → 5 (comparison_table, "por ÚLTIMO, como convite pra comparar"). Linha
  "A ORDEM dos cards no reveal" reescrita. REGRA DURA do FIX-78 (inseparabilidade) preservada
  literalmente (só ganhou a nota "mesmo saindo por ÚLTIMO na ordem").
- `system-prompt.ts` ("Sequência correta da apresentação"): `present_comparison_table` entra
  explicitamente como passo 4 (antes da frase de fechamento), com a mesma ressalva de não
  obrigar simulação de cada alternativa.
- Testes: `directives.fix-224.test.ts` (nova ordem: `simulation_result` antes de
  `comparison_table` no texto da diretiva + "A ORDEM dos cards" documentando a sequência +
  FIX-78 intacto). A consolidação de lance no card (regressão #2 do card) já está coberta por
  `recommendation-card.fix-221.test.tsx` (parcela antes/depois + enunciado "recebe menos"
  dentro do card).

### Consequências
- ✅ Sequência única e coerente entre prompt geral e diretiva do reveal.
- ✅ Nenhuma regra de compliance (Bv2-07) ou de anti-regressão (FIX-78) foi enfraquecida.
- ⚠️ A consolidação completa (fundir `simulation_result` no card, se algum dia fizer sentido)
  fica em aberto — precisa de aval sobre a regra Bv2-07 antes de qualquer tentativa.
- **Reversibilidade:** fácil (mudança de texto de prompt/diretiva, sem migração nem shape de
  dado novo).
- **Status:** aceita e implementada. **Evidência:** FIX-224.
