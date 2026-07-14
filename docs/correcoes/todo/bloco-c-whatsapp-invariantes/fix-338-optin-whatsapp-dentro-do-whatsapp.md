---
id: FIX-338
titulo: "P0 — o agente pede o WhatsApp do cliente DENTRO do WhatsApp"
status: todo
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/agent/orchestrator/whatsapp-optin-guard.ts
  - src/lib/agent/orchestrator/index.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
---

# FIX-338 — pedido de WhatsApp dentro do próprio WhatsApp

## Cenário (3 das 4 jornadas que fecham, whatsapp)
O agente pede o número de WhatsApp do cliente… no canal WhatsApp. Absurdo de contexto — o
número JÁ é conhecido (é o `waId`).

## Root cause
`shouldEmitWhatsappOptin` (`whatsapp-optin-guard.ts:22-35`) **não checa o `channel`**.

## Correção proposta
| O quê | Onde |
|---|---|
| O opt-in de WhatsApp só existe no canal `web`. No canal `whatsapp` ele nunca dispara | `whatsapp-optin-guard.ts` (guard por canal) |

## Regressão exigida
- Unit: `shouldEmitWhatsappOptin({channel:"whatsapp", ...})` → sempre false.
