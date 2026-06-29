---
bloco: bloco-rev-d-whatsapp-chat
branch: rev/whatsapp-chat
workspace: rev-whatsapp-chat
onda: 1
depends_on: []
paralelo_com: [bloco-rev-a-agente-nucleo, bloco-rev-b-jornada-bevi, bloco-rev-c-mesa-kanban, bloco-rev-e-fundacao-ui]
itens: []
escopo_arquivos:
  - src/lib/whatsapp/**
  - src/lib/chat/**
  - src/lib/web/**
  - src/components/chat/**
  - src/app/api/whatsapp/**
  - src/app/api/chat/**
---
# Bloco REV-D — Auditoria do WhatsApp / chat / multi-canal

Revisão adversarial (Opus) do canal WhatsApp oficial (janela 24h, sendTemplate HSM, webhook,
processor) e do chat web (render, multi-canal). ⚠️ `window.ts` JÁ foi consertado no chat-mesa
mergeado — confirme + cace o MESMO padrão de erro em outros arquivos da área. NÃO toca
`src/db/schema.ts`/`drizzle/**` (dono = rev-e).
