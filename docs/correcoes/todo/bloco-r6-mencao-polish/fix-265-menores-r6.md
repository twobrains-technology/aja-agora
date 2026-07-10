---
id: FIX-265
titulo: "Menores r6: acento ITAU no fecho, snapshot ancora what-if, 'te mandei WhatsApp' só enfileirou, dial repete no clique"
status: todo
bloco: bloco-r6-mencao-polish
arquivos: [src/lib/adapters/bevi/partner-offer-mapper.ts, src/lib/web/adapter.ts, src/lib/agent/orchestrator/index.ts, src/lib/bevi/fecho-pedir-oi.ts]
rodada: 2026-07-10 rodada 6 (Fable r5, menores)
---
## Gaps (veredito r5, menores)
- "ITAU" sem acento na copy do fecho (catálogo parceiro) — normalizar acentuação (inviolável PT).
- snapshot ancorou em what-if de 161k não pedido — snapshot só de oferta confirmada.
- "te mandei WhatsApp" dito quando só ENFILEIROU (sem janela) — copy condicional ao envio real.
- dial repete 1× no próximo afirmativo (clique não seta `simulatorOfferAnswered`) — setar no clique.
## Regressão (TDD)
- acento correto nos nomes de administradora no fecho.
- clique simulator-offer seta simulatorOfferAnswered → dial não repete.
- copy de WhatsApp condicional (enviado vs enfileirado).
