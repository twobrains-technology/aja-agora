---
id: FIX-85
titulo: "Implementar sendTemplate (HSM) na API oficial do WhatsApp"
status: todo
bloco: bloco-b-chat-mesa-whatsapp
arquivos:
  - src/lib/whatsapp/api.ts
rodada: 2026-06-28 — chat da mesa pelo Kanban (continuar conversa com o cliente)
---

## Palavras do operador
> "pela API oficial a gente precisa de liberar janela então para liberar a janela precisa
> enviar um template caso a janela esteja off."

## Cenário (estado atual — mapa 2026-06-28)
`src/lib/whatsapp/api.ts` tem `sendTextMessage`, `sendReplyButtons`, `sendListMessage`,
`markAsRead`, `sendTypingIndicator`. **Não existe** `sendTemplate`/HSM.

## Root cause (investigado)
Sem `sendTemplate`, não há como reabrir a janela de 24h quando ela está fechada — a API oficial
da Meta só aceita texto livre dentro da janela; fora dela, exige template aprovado.

## Correção proposta
| O quê | Onde |
|---|---|
| `sendTemplate(to, templateName, languageCode, components?)` — POST `messaging_product:whatsapp, type:"template", template:{name, language:{code}, components}` no graph v21.0; mesmo padrão de auth/erro dos outros sends; respeita o intercept de simulação (`SIM-<uuid>` → bus) | `src/lib/whatsapp/api.ts` |

Nome/idioma do template via env (ex.: `WHATSAPP_REOPEN_TEMPLATE`, default razoável). O template
em si é **PENDENTE-KAIRO** (aprovar na Meta Business).

## Regressão exigida
- **Camada 1 (structural):** `sendTemplate` monta o payload `type:"template"` com name+language;
  respeita o intercept de simulação; usa o mesmo header/token dos outros sends.
- **Integration:** chamada com `to` real monta o body correto (fetch mockado); `to=SIM-...` publica
  no simulator-bus sem bater na Meta. Não-agêntico → sem cassette.
