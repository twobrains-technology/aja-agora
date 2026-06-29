---
bloco: bloco-rev-b-jornada-bevi
branch: rev/jornada-bevi
workspace: rev-jornada-bevi
onda: 1
depends_on: []
paralelo_com: [bloco-rev-a-agente-nucleo, bloco-rev-c-mesa-kanban, bloco-rev-d-whatsapp-chat, bloco-rev-e-fundacao-ui]
itens: []
escopo_arquivos:
  - src/lib/adapters/**
  - src/lib/bevi/**
  - src/lib/consorcio/**
  - src/lib/finance/**
  - src/lib/diagnose/**
---
# Bloco REV-B — Auditoria da jornada Bevi / consórcio / finança

Revisão adversarial (Opus) dos adapters Bevi (Trilho A/B), fulfillment, matching de ofertas,
cálculo financeiro e descoberta/simulação. Foco número 1: **PROIBIDO dado mockado em runtime**
(Bevi é fonte única). NÃO toca `src/db/schema.ts`/`drizzle/**` (dono = rev-e).
