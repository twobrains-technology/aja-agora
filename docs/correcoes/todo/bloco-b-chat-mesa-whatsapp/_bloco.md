---
bloco: bloco-b-chat-mesa-whatsapp
branch: feat/chat-mesa-whatsapp
workspace: feat-chat-mesa-whatsapp
onda: 1
depends_on: []
paralelo_com: [bloco-a-documentos-cliente, bloco-c-fechamento-trilho-b]
itens: [FIX-85, FIX-86, FIX-87]
escopo_arquivos:
  - src/lib/whatsapp/api.ts
  - src/lib/whatsapp/window.ts
  - src/app/api/webhook/whatsapp/route.ts
  - src/db/schema.ts
  - src/app/api/admin/conversations/[id]/message/route.ts
  - src/components/admin/pipeline/lead-detail-panel.tsx
conflitos_esperados:
  - "src/db/schema.ts — nível 2: bloco-a adiciona TABELA client_documents; aqui adiciono a COLUNA lastInboundAt em `conversations`. Regiões diferentes; merge mecânico."
  - "src/components/admin/pipeline/lead-detail-panel.tsx — nível 2: bloco-a adiciona aba 'Documentos'; aqui adiciono o chat/input do operador. Áreas diferentes; merge mecânico."
---
# Bloco B — Chat da mesa no Kanban → WhatsApp oficial (janela 24h + template)

WhatsApp já é **Meta Cloud API oficial** (`graph.facebook.com/v21.0`, webhook HMAC). Hoje o
atendente responde pelo **WhatsApp pessoal** (proxy `src/lib/whatsapp/proxy.ts`) — é isso que o
Kairo quer ELIMINAR. O operador deve conversar pelo Kanban; o sistema envia pelo número oficial.

Ordem interna:
1. **FIX-85** — `sendTemplate` (HSM) na api oficial (reabre janela quando fechada).
2. **FIX-86** — controle de janela 24h: `lastInboundAt` em `conversations` + `isWindowOpen()`.
3. **FIX-87** — chat do operador no Kanban (UI + endpoint de envio + fluxo template-quando-fechada).

PENDENTE-KAIRO: o template HSM precisa ser CRIADO/APROVADO na Meta Business (externo); o bloco
implementa o `sendTemplate` + a lógica e usa o nome do template via env.
