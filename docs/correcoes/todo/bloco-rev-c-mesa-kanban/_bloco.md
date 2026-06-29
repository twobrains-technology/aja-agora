---
bloco: bloco-rev-c-mesa-kanban
branch: rev/mesa-kanban
workspace: rev-mesa-kanban
onda: 1
depends_on: []
paralelo_com: [bloco-rev-a-agente-nucleo, bloco-rev-b-jornada-bevi, bloco-rev-d-whatsapp-chat, bloco-rev-e-fundacao-ui]
itens: []
escopo_arquivos:
  - src/lib/mesa/**
  - src/lib/lead/**
  - src/lib/leads/**
  - src/lib/contacts/**
  - src/components/admin/**
  - src/app/admin/**
  - src/app/actions/**
---
# Bloco REV-C — Auditoria da mesa / kanban / atendente

Revisão adversarial (Opus) do back-office: CRUD de atendente, transbordo, copiloto, kanban,
lead-detail. Foco número 1: **contrato de shape entre UI e API** (transbordo já quebrou por ler
chave errada da resposta) + auth/permissão das actions de admin. NÃO toca `src/db/schema.ts`/
`drizzle/**` (dono = rev-e).
