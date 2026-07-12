---
bloco: bloco-r9-4-valor-honestidade
branch: fix/r9-4-valor-honestidade
workspace: fix-r9-4-valor-honestidade
onda: 1
depends_on: []
paralelo_com: [bloco-r9-4-reveal-serverside, bloco-r9-4-bevi-degradacao]
itens: [FIX-292, FIX-293]
escopo_arquivos:
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/agent/tools/known-credit-values.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/directives.ts
---
# Bloco r9-4 — valor & honestidade da justificativa (FIX-292 + FIX-293)

Dois itens P1/I2 pequenos e afins (mesmo tema: exatidão do que o agente afirma sobre a
recomendação) agrupados num pacote só. Ordem interna: **FIX-292 primeiro** (fonte única de
`monthlyPayment` por groupId), **FIX-293 depois** (directive de justificativa reaproveita o dado
já consistente do FIX-292 quando cita parcela/score no texto). Sem dependência de código real
entre os dois — é ordem lógica, não bloqueio.

## ⚠️ Overlap nível 2 (paralelo mesmo assim)

- **`src/lib/agent/orchestrator/recommendation-payload.ts`** × `bloco-r9-4-reveal-serverside`
  (FIX-290): ver overlap espelhado no `_bloco.md` daquele bloco. Este bloco mexe em
  `coerceRevealCota` (~82-148) + possivelmente o tipo de `knownCreditValueByGroupId` (passa a
  carregar `monthlyPayment`, não só `creditValue`) — isso muda a ASSINATURA usada também por
  `coerceComparisonPayload` (que o outro bloco toca). **Ordem de merge:
  `bloco-r9-4-reveal-serverside` PRIMEIRO**, este bloco ajusta a assinatura por cima e resolve o
  conflito mecânico.

## Disjunção confirmada
Sem overlap com `bloco-r9-4-bevi-degradacao` (arquivos totalmente diferentes — bevi adapter/
client vs system-prompt/directives/recommendation-payload/known-credit-values).
