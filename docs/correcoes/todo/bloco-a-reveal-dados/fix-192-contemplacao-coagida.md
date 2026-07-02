---
id: FIX-192
titulo: "Contemplação coagida a dado real (availableSlots real ou 0; nunca taxaContemplacao como %)"
status: todo
bloco: bloco-a-reveal-dados
arquivos:
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/lib/agent/orchestrator/runner.ts
rodada: "2026-07-01 · onda reveal-refino · qa-dono-produto (carro web, conv fe2e8a09) + refino spec"
---

## Palavras do operador
Refino: "não exibir nenhum sinal de contemplação até haver dado real ancorado" (D1 da spec).

## Cenário exato
O retorno REAL enxuto da Bevi (10 campos, `_evidencia/2026-07-01-bevi-simulation-130k-auto.json`) **não** traz `monthlyAwardedQuotas`. O único campo de contemplação é `taxaContemplacao` (fração 0..1, semântica TBD) — NÃO é contagem mensal.

## Root cause investigado (spec §1.1, §2, §3.1)
`offer-mapper.ts:107-108` faz `availableSlots/contemplationRate = offer.monthlyAwardedQuotas ?? 0` — sem o campo, vira 0, e o "36" entrava pela LLM (FIX-191). `taxaContemplacao` não deve virar "%": semântica não confirmada com a AGX.

## Correção proposta
| O quê | Onde |
|---|---|
| `availableSlots` coagido = `monthlyAwardedQuotas` real, senão 0 (nunca da LLM) | `offer-mapper.ts` + coerção no runner (FIX-191) |
| Não derivar contemplação de `taxaContemplacao` (fração ≠ contagem); não expor como % | `offer-mapper.ts` |
| Quando/se a Bevi trouxer a contagem real, o valor coagido reflete o real | `offer-mapper.ts` |

Obs: a OCULTAÇÃO do slot na UI quando `availableSlots` ausente/0 é do bloco-b (FIX-196, render). Aqui é só a coerção do dado.

## Regressão exigida
- Camada 1: retorno sem `monthlyAwardedQuotas` → `availableSlots` coagido = 0 (cenário §7.1). Retorno com `monthlyAwardedQuotas:2` → `availableSlots` = 2 (§7.3).
