---
id: FIX-261
titulo: "Hero do reveal +25% do pedido sem aviso; rawCreditValue no recommendation_card; truncamento 'Perfeito, Madal'"
status: parcial (rawCreditValue fechado; truncamento investigado, sem fix de código — ver nota)
bloco: bloco-r5-fechamento-gates
arquivos: [src/lib/agent/orchestrator/recommendation-payload.ts, src/lib/agent/orchestrator/runner.ts]
rodada: 2026-07-10 rodada 5 (Fable r4, menores)
---
## Gaps (veredito r4, menores)
- hero do reveal veio +25% do pedido SEM aviso de ajuste (o aviso só está no real_offer, não no reveal).
- `rawCreditValue` falta no recommendation_card (aviso de ajuste desde o reveal).
- truncamento "Perfeito, Madal" (nome cortado numa bolha).
## Correção
- Propagar `rawCreditValue` (valor pedido) ao recommendation_card e renderizar o aviso de ajuste
  também no reveal quando a carta difere do pedido (>~15%).
- Corrigir o truncamento do nome na bolha.
## Regressão (TDD)
- recommendation_card com carta ≠ pedido → tem rawCreditValue + aviso.
- nome não truncado.

## Implementado (2026-07-10, rodada 5)

### rawCreditValue no recommendation_card — FECHADO
- `recommendation-payload.ts`: `coerceRecommendationPayload` ganha 4º parâmetro
  `requestedCreditValue?: number`; quando presente e diverge (arredondado) do `creditValue`
  coagido, seta `out.rawCreditValue` — aciona o aviso que o componente
  (`recommendation-card.tsx`) JÁ sabia renderizar (`hasCreditAdjustment`, sem threshold — não
  precisou mexer no componente, o gap era só o servidor nunca propagar o dado).
- `runner.ts`: no call site do `recommendation_card`, passa
  `meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax` (mesma
  precedência "lastRequested" do FIX-68 em analyze.ts).
- Escopo deliberadamente restrito ao HERO (recommendation_card) — o card pede isso
  explicitamente; `comparison_table`/`coerceRevealCota` NÃO tocados (evita floodar a tabela
  de comparação com avisos por linha, fora do escopo pedido).
- Testes: `recommendation-payload.test.ts` (3 casos: diverge/igual/ausente — RED confirmado).

### Truncamento "Perfeito, Madal" — INVESTIGADO, SEM FIX DE CÓDIGO (regra epistêmica)
Fork de investigação (só leitura) checou e DESCARTOU bug determinístico de split/chunk:
`src/lib/web/adapter.ts` não tem NENHUMA lógica de bolha/split (passa text-delta cru via SSE);
o `EphemeralTextFilter` (sanitizer.ts) sempre libera o resto no `flush()` final — não perde
conteúdo por bug de parsing. O achado mais forte: `finishReason` anômalo (candidato: "length",
limite de tokens) só era LOGADO sem contexto suficiente pra confirmar a hipótese
(`runner.ts` ~600) — não há evidência de reprodução determinística contra a API real. Implementar
retry ou correção especulativa sem confirmar a causa violaria a regra epistêmica ("não crave o
que não verificou") e teria blast radius alto (mexe no loop de geração pra TODO turno, não só o
caso raro). Ação tomada: enriquecido o log (`runner.ts`) com a cauda do `fullResponse` quando
`finishReason` foge de stop/tool-calls — puramente observabilidade (zero mudança de
comportamento), pra a PRÓXIMA rodada confirmar/descartar a hipótese com evidência real antes de
qualquer fix. PENDENTE-KAIRO: decidir se vale investir num retry bounded quando confirmado.
- `pnpm test:unit` verde (330 arquivos / 3133 testes) após as duas mudanças.
