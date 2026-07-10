---
bloco: bloco-motor-calculo
branch: feat/motor-calculo-contemplacao
workspace: feat-motor-calculo-contemplacao
onda: 1
depends_on: []
paralelo_com: [bloco-cards-ui, bloco-jornada-conversa]
itens: [FIX-225, FIX-226, FIX-227]
escopo_arquivos:
  - src/lib/consorcio/contemplation-dial.ts
  - src/lib/consorcio/contemplation-dial.test.ts
  - src/lib/consorcio/plan-estimate.ts
  - src/lib/agent/recommendation.ts
  - src/lib/agent/recommendation.test.ts
conflitos_esperados:
  - "nível 3 (contrato) com bloco-cards-ui: o shape ContemplationDialResult muda (remove `likelihood`). Este bloco é DONO do contrato. Ver contrato abaixo."
---

# Bloco motor-calculo — o coração numérico (PR0 + PR2 + PR8)

Substitui a curva de lance errada, adiciona o guardrail de crédito líquido e a
âncora de dinheiro. É a fundação: todo número que a agulha, os cenários e a copy
exibem depende disto. Sem UI, sem prompt — só módulos puros e testes.

Spec: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/docs/03-regras-calculo.md`
e a implementação de referência em `.../docs/03c-implementacao-referencia.ts`.

## Ordem interna
FIX-225 (curva — base de tudo) → FIX-226 (guardrail netCredit) → FIX-227 (âncora dinheiro).

## CONTRATO DE SAÍDA (nível 3 — os blocos irmãos dependem disto)

`ContemplationDialResult` MANTÉM todos os campos atuais EXCETO `likelihood`, que é
**removido** (heurística sem base de dado — ver spec `05`). Campos garantidos:
`targetMonth, mode, requiredLancePct, requiredLanceValue, embeddedBidPct,
embeddedBidValue, ownCashPct, ownCashValue, receivedCredit,
paymentAfterContemplation?, disclaimer`. `admSobreEmbutido?` é adicionado (custo do
embutido; `undefined` quando `adminFee` ausente — Trilho A). O bloco-cards-ui remove
o consumo de `likelihood` no componente; se este bloco mergear antes, o campo some e
o componente (ainda não adaptado) leria `undefined` — por isso a ordem de merge
recomendada é: **motor ANTES de cards**.
