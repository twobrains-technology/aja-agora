---
id: FIX-228
titulo: "Card novo: lance embutido (present_embedded_bid)"
status: todo
bloco: bloco-cards-ui
arquivos:
  - src/lib/chat/types.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/tools/schemas.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/components/chat/artifacts/embedded-bid.tsx
  - src/components/chat/artifacts/artifact-renderer.tsx
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR5/D3)
---

## Palavras do operador (handoff)
> "Card dedicado, curto, explicando o conceito ANTES da agulha. Regra dura: este card
> SEMPRE diz que o crédito recebido diminui. Não é opcional — é o que separa consultoria
> de venda enganosa." — `docs/02`

## Root cause / estado atual
Lance embutido hoje só existe como chip/gate `lance-embutido` + seção dentro de
`simulation_result`/`contemplation_dial`. Não há card dedicado (confirmado no inventário
de `artifacts/`).

## Correção proposta (checklist de card novo)
| Ponto | Detalhe |
|---|---|
| Payload `EmbeddedBidPayload` | `{ maxEmbutidoPct, creditValue, embeddedBidValue, netCredit, disclaimer }` — `chat/types.ts` union |
| Tool `present_embedded_bid` + schema Zod | `tools/ai-sdk.ts` + `tools/schemas.ts` |
| Coerção server-side | `runner.ts` — números vêm da oferta real (embeddedBidValue = maxEmbutido×carta; netCredit = carta − embutido), a LLM só escolhe o grupo |
| Componente `embedded-bid.tsx` + case | `artifact-renderer.tsx` |
| Fase `reveal` | `tool-policy.ts` `allowedTools` |

Copy: título "Lance embutido — sem tirar do bolso"; corpo "você usa parte da própria
carta como lance e antecipa a contemplação, sem desembolsar. O embutido sai da carta,
então o crédito recebido diminui um pouco."

## Regressão exigida
- o card SEMPRE renderiza a consequência "o crédito recebido diminui" (teste que falha se ausente).
- payload coagido: `netCredit === creditValue - embeddedBidValue` (server, não LLM).
- tool só disponível na fase `reveal` (tool-policy).
