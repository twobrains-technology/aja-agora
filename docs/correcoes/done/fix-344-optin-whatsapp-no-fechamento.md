---
id: FIX-344
titulo: "P0 — 'me manda um oi no WhatsApp' DENTRO do WhatsApp (100% dos fechos) — outro caminho, não o guard"
status: done
bloco: bloco-e-fallback-residual
arquivos:
  - src/lib/bevi/closing-presentation.ts
  - src/lib/bevi/closing-presentation.test.ts
  - src/lib/whatsapp/interactive-handlers.ts
  - src/app/api/chat/route.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 2
---

# FIX-344 — o pedido de WhatsApp dentro do WhatsApp voltou por OUTRA porta

## Cenário
Em **100% dos 4 fechos no WhatsApp**, o agente diz que "acabou de mandar uma mensagenzinha no seu
WhatsApp" e pede pro cliente "responder com um oi" — **dentro do próprio WhatsApp**.

## Root cause (localizado pelo juiz)
O FIX-338 (rodada 1) blindou `shouldEmitWhatsappOptin` — mas **este texto vem de outro lugar**:
`src/lib/bevi/closing-presentation.ts:120-180` monta a copy do fecho **sem nenhum parâmetro de
canal**, e `src/lib/whatsapp/interactive-handlers.ts:169` a chama de dentro do fluxo WhatsApp.

Lição: blindar UM caminho não resolve quando a copy é montada em outro.

## Correção aplicada
`closingPresentation` ganhou `opts.channel?: "web" | "whatsapp"`. Os dois itens do beat ("acabei de
te mandar uma mensagenzinha no seu WhatsApp" + 'responde por lá com um "oi"') só entram na lista
quando `channel !== "whatsapp"` — extraídos num array `whatsappPingBeat` spreadado no ponto exato do
docx (depois do "Parabéns!", antes da linha da especialista). O resto do fecho (reserva de cota,
booking, Parabéns, especialista chama em seguida) é igual nos dois canais — só o beat "vai até o
WhatsApp" é específico de canal.

- `src/lib/whatsapp/interactive-handlers.ts:169` (fecho por clique, `handleOfferConfirm` — o cliente
  já está na conversa de WhatsApp) → `closingPresentation(res, { channel: "whatsapp" })`.
- `src/app/api/chat/route.ts` (fecho web, ação `offer-confirm`) → `channel: "web"` explícito (Lei 1:
  não depender do default implícito), mantendo `whatsappChannel` intacto (FIX-265, "mandei" vs "vou
  mandar").

Sem opts (nenhum caller usa hoje, mas a assinatura permite) o default segue sendo o comportamento
antigo (beat presente) — retrocompatibilidade proposital, não regra-no-prompt.

## Regressão
- Unit NOVO (`closing-presentation.test.ts`, describe "FIX-344"): canal "whatsapp" nunca contém
  "oi"/"mensagenzinha"/"whatsapp" no texto, mas mantém reserva/Parabéns/especialista; canal "web"
  continua com o beat.
- Sem regressão: `closing-presentation.test.ts` (36/36), `interactive-handlers.template-routing`,
  `interactive-handlers.contract`, `offer-confirm-whatsapp-channel-gate`,
  `route.closing-persistence`, `system-prompt.fix-112`, `template-dispatch.test.ts` — todos verdes.
