---
bloco: bloco-pnpm
branch: chore/migracao-pnpm-arquitetura-dev
workspace: chore-migracao-pnpm-arquitetura-dev
onda: 1
depends_on: []
paralelo_com: [demais repos P0 — repos isolados, zero conflito de merge]
itens: [migracao-pnpm-arquitetura-dev]
escopo_arquivos: [package.json, pnpm-lock.yaml, pnpm-workspace.yaml, .npmrc, Dockerfile.dev, Dockerfile, docker-compose.yml, CLAUDE.md, .github/workflows]
---
# Bloco pnpm — migração aja-agora

Migração mecânica padronizada (runbook A-F no `_prompt.md`): pnpm único +
dev sem build de deps (volumes nomeados + store `tb-pnpm-store-shared` externo)
+ CLAUDE.md do projeto. Repo isolado → paralelo total com os outros blocos pnpm
(cada bloco é um repo distinto, zero overlap). Pré-requisito global (volume +
template tb-local-dev) já feito no host em 2026-06-16.
