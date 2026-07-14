---
id: FIX-344
titulo: "P0 — 'me manda um oi no WhatsApp' DENTRO do WhatsApp (100% dos fechos) — outro caminho, não o guard"
status: todo
bloco: bloco-e-fallback-residual
arquivos:
  - src/lib/bevi/closing-presentation.ts
  - src/lib/whatsapp/interactive-handlers.ts
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

## Correção proposta
| O quê | Onde |
|---|---|
| `closing-presentation` recebe o CANAL e, no WhatsApp, **não** emite o beat de "te mandei uma mensagem lá / responde com um oi" (o cliente já está lá) | `closing-presentation.ts` |
| Teste de paridade: nenhuma copy do canal WhatsApp pode pedir o WhatsApp do cliente | novo teste |

## Regressão exigida
- Unit: `closing-presentation` no canal "whatsapp" não contém "oi"/"mensagem no seu WhatsApp".
- Unit: no canal "web", o beat continua existindo (é lá que ele faz sentido).
