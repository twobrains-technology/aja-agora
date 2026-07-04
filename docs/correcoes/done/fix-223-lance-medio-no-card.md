---
id: FIX-223
titulo: "Lance médio no card de recomendação (propagar do fechamento pro shape de descoberta)"
status: todo
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/lib/adapters/bevi/partner-offer-mapper.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/adapters/types.ts
  - src/lib/chat/types.ts
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/group-card.tsx
bloco: bloco-cards-recomendacao
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 4.2, P1)
---
## Palavras do operador
> Ata 4.2: *"Exibir o lance médio no card (hoje falta — info importante)."*

## Cenário exato
- Card de recomendação/grupo deve mostrar o **lance médio** do grupo (referência de quanto costuma contemplar).

## Esperado × Atual
- **Esperado:** o card exibe o "lance médio" da oferta.
- **Atual:** o `recommend_groups` **não** carrega lance médio; o dado existe só no **trilho de fechamento**.

## Root cause (INVESTIGADO)
- `lanceMedio` (Bevi) → `parseMoney` → `avgBidValue` já é parseado em `partner-offer-mapper.ts:70,84`; chega em `RealOfferPayload.avgBidValue` (`chat/types.ts:269-272`) e `ContemplationDialPayload.avgBidValue` (`chat/types.ts:311-313`).
- Mas `toModelGroupSummary` (`offer-mapper.ts:144-151`) — usado na **descoberta** — **não** carrega `avgBid` → o card de recomendação não tem o dado.
- Números do card são **coagidos server-side** (`recommendation-payload.ts:110-124` `coerceRecommendationPayload`) pra a LLM não fabricar.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Propagar `lanceMedio`/`avgBidValue` no shape de descoberta (`GroupSummary` + `toModelGroupSummary`) | `adapters/types.ts:7-26`, `offer-mapper.ts:144-151`, `offer-mapper.ts:109`-região |
| Coagir o `avgBidValue` server-side (não deixar a LLM inventar) | `recommendation-payload.ts:110-124` |
| Exibir "lance médio" no card | `recommendation-card.tsx`, `group-card.tsx` |

⚠️ Se a oferta de descoberta (self-contract) não trouxer `lanceMedio`, exibir só quando presente (não fabricar) — coerência com a regra de números reais.

## Regressão exigida (TDD strict)
1. Teste que `avgBidValue` é propagado no shape de descoberta e **coagido** server-side.
2. Teste que o card exibe "lance médio" quando presente e **omite** quando ausente (nunca fabrica).
