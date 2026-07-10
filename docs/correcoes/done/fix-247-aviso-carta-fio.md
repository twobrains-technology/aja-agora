---
id: FIX-247
titulo: "Aviso de ajuste de carta morto em integração — requestedCreditValue descartado no destructuring"
status: done
bloco: bloco-r3-serverside-cards
arquivos:
  - src/app/api/chat/route.ts
  - src/lib/whatsapp/contract-capture.ts
  - src/lib/whatsapp/formatter.ts
  - src/components/chat/artifacts/real-offer.tsx
rodada: 2026-07-10 rodada 3 (Fable r2, gap #2 PARCIAL)
commit: 8653571
executado_em: "2026-07-10"
---

## Gap (veredito Fable r2, gap #2 — PARCIAL)
O clamp funciona (visto ao vivo: 157.845 em vez de 211k), MAS o aviso de ajuste (FIX-197) está
MORTO na integração: `route.ts:676` remonta `{proposalId, offer, noOffer}` DESCARTANDO
`requestedCreditValue`, e `contract-capture.ts` não passa `rawCreditValue` ao `real_offer`. Os
testes novos são só de folha (componente) — a integração não fia o campo. Oferta vinculante (CDC art. 30).

## Correção
- Fiar `requestedCreditValue`/`rawCreditValue` ponta-a-ponta: preservar no destructuring de
  `route.ts:676` e passar em `contract-capture.ts` até o payload do `real_offer`.
- Corrigir a copy do aviso (o Fable notou semântica invertida quando renderiza).

## Regressão (TESTE DE INTEGRAÇÃO, não só folha)
- integração: carta real ≠ valor pedido → `real_offer.rawCreditValue` presente → aviso renderiza.
- E2E: Fluxo A (120k) com carta ajustada → aviso visível antes de "confere e confirma".
