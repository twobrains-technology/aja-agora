---
bloco: bloco-rev-e-fundacao-ui
branch: rev/fundacao-ui
workspace: rev-fundacao-ui
onda: 1
depends_on: []
paralelo_com: [bloco-rev-a-agente-nucleo, bloco-rev-b-jornada-bevi, bloco-rev-c-mesa-kanban, bloco-rev-d-whatsapp-chat]
itens: []
escopo_arquivos:
  - src/db/**
  - drizzle/**
  - src/lib/storage/**
  - src/lib/middleware/**
  - src/lib/workers/**
  - src/lib/telemetry/**
  - src/lib/validations/**
  - src/lib/email/**
  - src/lib/pdf/**
  - src/components/landing/**
  - src/components/ui/**
  - src/components/brand/**
  - src/app/onboarding/**
---
# Bloco REV-E — Auditoria da fundação técnica + UI/ortografia

Revisão adversarial (Opus) da fundação (schema, migrations, **meta do Drizzle**, storage S3,
middleware, workers, telemetry) e da superfície (landing, onboarding, ui, brand, templates).
**ESTE bloco é o ÚNICO dono de `src/db/schema.ts` e `drizzle/**`** — consolida os PENDENTE-REV-E
dos outros blocos. Inclui o **bloco-g/FIX-100**: reconstruir os snapshots do meta do Drizzle
(`db:generate` quebrado). Foco transversal: **ortografia PT-BR plena** em todo texto de UI.
