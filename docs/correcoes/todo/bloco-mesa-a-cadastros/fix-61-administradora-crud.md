---
id: FIX-61
titulo: "Administradora — entidade + CRUD admin"
status: todo
bloco: bloco-mesa-a-cadastros
arquivos:
  - src/app/admin/(dashboard)/administradoras/
  - src/app/api/admin/administradoras/
  - src/lib/validations/mesa.ts
  - src/components/admin/administradoras/
  - src/components/admin/app-sidebar.tsx
rodada: 2026-06-21 feature mesa de operação (Kairo, autônomo)
---
# FIX-61 — Administradora (entidade + CRUD admin)

**Spec:** `docs/visao/mesa-de-operacao.md` §3.1. Eleva a administradora (hoje `varchar` solto em
`beviProposals.administradora`) a entidade própria com CRUD admin.

## O quê × onde
- Tabela `administradoras` (JÁ no schema): nome (unique), slug, codigoBevi (match opcional Bevi),
  isActive. CRUD admin completo (`requireRole("admin")`).
- Casa por nome/código com `beviProposals.administradora`.

## Invariante (regressão)
- A entidade é **dossiê de operação** — NÃO fonte de oferta/grupo/número ao cliente (Bevi fonte
  única). Nenhuma rota pública a consome. Assert estrutural + integration CRUD com valor no DB.
