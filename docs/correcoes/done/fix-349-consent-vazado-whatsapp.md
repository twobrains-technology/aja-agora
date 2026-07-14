---
id: FIX-349
titulo: "P1 — o reveal em dois tempos (consentimento) vazou no WhatsApp: número específico sem consent (2/8)"
status: todo
bloco: bloco-g-consent-wa-fallback
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/whatsapp/adapter.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 4
---

# FIX-349 — o consentimento do reveal não vale no WhatsApp

## Cenário (imovel-whatsapp t6, servicos-whatsapp t6)
O agente entrega **número específico da oferta top-1 sem o consentimento** ("Posso te mostrar a
opção que eu recomendo?"). Em `servicos-whatsapp` o gate de consentimento **nunca aparece na
conversa inteira**.

Contraria decisão explícita do cliente (Rodada 10: "reveal em dois tempos — a lista sozinha; o
hero só depois do consent"). O canal web respeita; o WhatsApp não.

## Root cause a investigar (PROVE)
`isPrematureTopOfferClaim` (`sanitizer.ts:517-530`) depende de `ctx.recoConsentPending`, que vem de
`meta.recoConsentAnswered !== true`. Duas hipóteses:
1. O gate `reco-consent` **não dispara** no WhatsApp em alguns caminhos (então `recoConsentPending`
   fica true mas o gate nunca é entregue → o usuário nunca consente → e ainda assim o número sai).
2. O contexto do guard não chega no caminho WhatsApp.

Rode a jornada de serviços no WhatsApp e olhe `nextGate`/`turn-trace`. **Descubra por que o gate
some** — em `servicos-whatsapp` ele nunca aparece.

## Correção proposta
| O quê | Onde |
|---|---|
| O gate `reco-consent` tem que existir no WhatsApp em TODOS os caminhos em que existe na web (menos o `so_parcela`, que pula o hero por design) | `qualify-state.ts` / `whatsapp/adapter.ts` |
| O guard `isPrematureTopOfferClaim` tem que valer nos 2 canais | `sanitizer.ts` |
| Teste de paridade: nenhum canal pode entregar o hero/número do top-1 sem consentimento | novo teste |

## Regressão exigida
- Integração (WhatsApp): pós-`search`, a fala NÃO contém administradora/parcela do top-1 até o
  consentimento ser dado.
- Integração: o gate `reco-consent` é entregue no WhatsApp (exceto no ramo `so_parcela`).
