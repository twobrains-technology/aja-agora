---
bloco: bloco-mesa-a-cadastros
branch: feat/mesa-cadastros
workspace: feat-mesa-cadastros
onda: 2
depends_on: []
paralelo_com: [bloco-mesa-b-transbordo, bloco-mesa-c-copiloto]
itens: [FIX-61, FIX-62, FIX-63]
escopo_arquivos:
  - src/app/admin/(dashboard)/administradoras/**
  - src/app/admin/(dashboard)/atendentes-mesa/**
  - src/app/api/admin/administradoras/**
  - src/app/api/admin/administradora-docs/**
  - src/app/api/admin/mesa-attendants/**
  - src/lib/storage/**
  - src/lib/pdf/**
  - src/lib/validations/mesa.ts
  - src/components/admin/administradoras/**
  - src/components/admin/mesa-attendants/**
  - src/components/admin/app-sidebar.tsx
---
# Bloco Mesa-A — backoffice de cadastros (Administradora + Docs PDF + Atendente de mesa)

A fundação (schema das 5 tabelas mesa) já está na base. Este bloco constrói o CRUD admin
das 3 entidades de cadastro + storage de PDF + extração de texto. **Não toca WhatsApp, kanban
nem agente** — esses são os blocos B e C, em paralelo.

## Nível de paralelismo
- Disjunto de B e C em arquivos (nível 1), exceto `app-sidebar.tsx` (só A toca → sem conflito).
- A entidade Administradora e o `texto_extraido` dos docs são CONSUMIDOS por B/C, mas via DB
  (schema já fixado) — contrato estável, sem dependência de código.

## Ordem interna
FIX-61 (Administradora) → FIX-62 (Docs/PDF, depende da Administradora) → FIX-63 (Atendente de mesa).
