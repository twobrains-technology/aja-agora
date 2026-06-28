---
id: FIX-87
titulo: "Chat do operador no Kanban → WhatsApp oficial (com gate de janela/template)"
status: todo
bloco: bloco-b-chat-mesa-whatsapp
arquivos:
  - src/components/admin/pipeline/lead-detail-panel.tsx
  - src/app/api/admin/conversations/[id]/message/route.ts
rodada: 2026-06-28 — chat da mesa pelo Kanban (continuar conversa com o cliente)
---

## Palavras do operador
> "o usuário na mesa teria que entrar pelo WhatsApp pessoal dele, porque ficaria bem ruim. A
> gente não quer isso (...) precisamos que dentro do Kanban tenha um chat de texto ali pra
> continuar a conversa com o cliente. E aí na hora que mandar vai mandar pro WhatsApp do cliente."

## Cenário (estado atual)
`lead-detail-panel.tsx` → aba "Conversa" = `ConversationTimeline` **read-only**. Não há input de
envio. Hoje o atendente responde pelo **WhatsApp pessoal** via proxy (`proxy.ts:449-551`).

## Root cause (investigado)
Não há chat bidirecional no admin. O operador depende do WhatsApp pessoal — o que o Kairo quer
eliminar (desconfiança do cliente + ruim pro back-office).

## Correção proposta
| O quê | Onde |
|---|---|
| Input de chat no lead-detail (aba "Conversa" ou nova "Atendimento"): operador digita e envia | `src/components/admin/pipeline/lead-detail-panel.tsx` |
| Endpoint `POST /api/admin/conversations/[id]/message` (operador autenticado): consulta `isWindowOpen` (FIX-86) → se ABERTA, `sendTextMessage` (FIX-85 não, esse é texto livre já existente) e persiste message (role=assistant, channel=whatsapp, autor=operador); se FECHADA, NÃO envia texto livre — responde `windowClosed` + oferece enviar template (`sendTemplate` FIX-85) | `src/app/api/admin/conversations/[id]/message/route.ts` (novo) |
| UI: janela fechada → input desabilitado + botão "Reabrir conversa (template)"; ao enviar template e o cliente responder (webhook atualiza `lastInboundAt`), o input de texto livre reabilita | `lead-detail-panel.tsx` |

Cliente→operador: o inbound já é persistido pelo webhook e aparece no timeline (read já existe).
⚠️ Conflito nível 2 com bloco-a em `lead-detail-panel.tsx`. Merge mecânico (áreas diferentes).
Nota: NÃO remover o proxy WhatsApp-pessoal nesta feature (compat) — só oferecer o caminho Kanban; a aposentadoria do proxy é decisão posterior do Kairo.

## Regressão exigida
- **Camada 1 (structural):** o endpoint exige sessão de admin; chama `isWindowOpen`; janela aberta
  → texto livre; janela fechada → bloqueia texto + caminho de template; persiste a msg enviada.
- **Integration:** operador envia com janela aberta → `sendTextMessage` chamado + message
  persistida (channel=whatsapp); janela fechada → resposta `windowClosed` (sem texto livre) +
  template disponível. Não-agêntico → sem cassette.
