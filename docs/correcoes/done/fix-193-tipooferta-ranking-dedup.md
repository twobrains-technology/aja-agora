---
id: FIX-193
titulo: "tipoOferta como critério invisível de ranking + dedup por administradora+grupo"
status: done
commit: d9b670e7
executado_em: 2026-07-02
bloco: bloco-a-reveal-dados
arquivos:
  - src/lib/agent/recommendation.ts
  - src/lib/adapters/bevi/offer-mapper.ts
rodada: "2026-07-01 · onda reveal-refino · qa-dono-produto (carro web, conv fe2e8a09) + refino spec"
---

## Palavras do operador
Refino D2: "tipoOferta = critério invisível de ranking/dedup, sem jargão de tipo na UI".

## Cenário exato
O mesmo grupo aparece em mais de uma modalidade (ex.: CANOPUS 8120 como SPECIAL_OFFER **e** FREE_BID) — hoje pode duplicar. `tipoOferta` nem chega ao `GroupSummary` da descoberta (só existe no `RealOffer`).

## Root cause investigado (spec §3.2)
`tipoOferta` não é propagado ao `GroupSummary`/ranking; dedup atual (FIX-56) é só por administradora. Falta usar a modalidade como (a) dedup por administradora+grupo e (b) desempate por afinidade de lance.

## Correção proposta
| O quê | Onde |
|---|---|
| Propagar `tipoOferta` ao `GroupSummary` | `offer-mapper.ts` |
| Dedup por (administradora + grupo) — nunca o mesmo grupo 2x por vir em 2 modalidades | `recommendation.ts` |
| Desempate: usuário com apetite de lance → priorizar modalidade coerente (FREE_BID/embutido) | `recommendation.ts` |
| NUNCA exibir rótulo de tipo na UI (critério interno) | — (garantir que não vaza pro payload de UI) |

## Regressão exigida
- Camada 1: mesmo grupo em SPECIAL_OFFER + FREE_BID aparece 1x; nenhum rótulo de tipo no payload de UI (cenário §7.5).
