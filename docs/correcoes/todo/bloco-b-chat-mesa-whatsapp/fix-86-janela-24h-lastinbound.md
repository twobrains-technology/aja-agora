---
id: FIX-86
titulo: "Controle da janela de 24h do WhatsApp (lastInboundAt + isWindowOpen)"
status: todo
bloco: bloco-b-chat-mesa-whatsapp
arquivos:
  - src/db/schema.ts
  - src/lib/whatsapp/window.ts
  - src/app/api/webhook/whatsapp/route.ts
rodada: 2026-06-28 — chat da mesa pelo Kanban (continuar conversa com o cliente)
---

## Palavras do operador
> "teria que ter um passo ali de descobrir se a janela está off e se tiver tem que dar opção de
> enviar o template. Quando tiver liberado a conversa habilita o chat de verdade pra ele."

## Cenário (estado atual)
Não há QUALQUER tratamento da janela de 24h: sem `lastInboundAt`, sem cálculo de aberta/fechada.
Hoje texto livre é enviado a qualquer hora (a Meta rejeitaria fora da janela, mas o app não sabe).

## Root cause (investigado)
Falta a fonte do "último inbound do cliente" e o helper que decide se a janela está aberta.
Sem isso, o chat do operador (FIX-87) não consegue escolher entre texto-livre e template.

## Correção proposta
| O quê | Onde |
|---|---|
| Coluna `lastInboundAt timestamptz` em `conversations` (migration via drizzle-kit) | `src/db/schema.ts` |
| Webhook inbound atualiza `lastInboundAt = now()` ao receber mensagem do cliente (text/interactive) | `src/app/api/webhook/whatsapp/route.ts` |
| `isWindowOpen(conversationId): Promise<{open: boolean, expiresAt: Date \| null}>` — aberta se `now - lastInboundAt < 24h` | `src/lib/whatsapp/window.ts` (novo) |

⚠️ Conflito nível 2 com bloco-a em `schema.ts` (tabela vs coluna). Merge mecânico.

## Regressão exigida
- **Camada 1 (structural):** `conversations` tem `lastInboundAt`; o webhook seta `lastInboundAt`
  no inbound; `isWindowOpen` usa o limiar de 24h.
- **Unit:** `isWindowOpen` → aberta com inbound recente; fechada após 24h; sem inbound → fechada.
  Não-agêntico → sem cassette.
