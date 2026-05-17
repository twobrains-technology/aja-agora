---
name: aja-agora-local-dev
description: Operar o ambiente local do aja-agora (Postgres por workspace + Letta compartilhado via ~/.tb-local/_shared/). Bootstrap de novo worktree, dump do aja-agora-dev AWS, teardown isolado. Segue a convenção TwoBrains `local-dev-workspaces` documentada em ~/.tb-local/CONVENTIONS.md.
---

# Skill — Local dev do aja-agora

Operações de dev local do aja-agora seguindo a convenção
[local-dev-workspaces][pattern] do TwoBrains. **Workspace** = nome do
diretório do worktree atual (ex: `nebula-submarine`). Cada workspace tem
Postgres isolado; Letta é compartilhado entre todos os projetos
TwoBrains via `~/.tb-local/_shared/`.

## Quando usar

| Cenário | Ação |
|---|---|
| Worktree novo / primeira vez no Mac | `scripts/bootstrap-workspace.sh` |
| Subir só os shared services (Letta) | `scripts/shared-up.sh` |
| Derrubar shared services | `scripts/shared-down.sh` |
| Resetar memória Letta global (CUIDADO) | `scripts/shared-down.sh --nuke` |
| Trazer dados do aja-agora-dev AWS | `scripts/dump-from-dev.sh` |
| Reset do banco do workspace atual | `scripts/teardown-workspace.sh --nuke` |

Todos os scripts são **idempotentes** — rodar 2x não quebra.

## Fluxo: primeira vez no Mac

```bash
# 1. (one-time global) Criar network + subir Letta compartilhado
~/.superset/worktrees/tb-aja-agora/nebula-submarine/.claude/skills/local-dev/scripts/shared-up.sh

# 2. (one-time global) Configurar ~/.tb-local/_shared/.env.shared se ainda não existe
#    (o script avisa e abre $EDITOR se faltar)

# 3. (por worktree) Bootstrap deste workspace
./.claude/skills/local-dev/scripts/bootstrap-workspace.sh
#    - Gera .env.local com WORKSPACE_NAME=<dir>
#    - Sobe Postgres do workspace
#    - Roda npm run db:migrate
#    - (opcional) pergunta se quer dumpar do dev AWS

# 4. Trabalhar
npm run dev
```

## Fluxo: worktree novo

```bash
cd ~/.superset/worktrees/tb-aja-agora/<novo-workspace>
./.claude/skills/local-dev/scripts/bootstrap-workspace.sh
```

A skill detecta o nome do diretório atual, gera `.env.local` derivado,
sobe `aja-pg-<workspace>` (Postgres isolado deste worktree), roda
migrations. Letta global é reutilizado automaticamente — o
`LETTA_NAMESPACE` no `.env.local` garante que agents deste worktree não
veem os de outros.

## Convenções aplicadas

| Recurso | Nome neste workspace |
|---|---|
| Container Postgres | `aja-pg-<workspace>` |
| Volume Postgres | `aja-pg-<workspace>-data` |
| Container Letta (compartilhado) | `tb-letta-shared` |
| Network Docker | `tb-local-net` (external) |
| Letta namespace | `aja-agora-local-<workspace>` |
| DB name | `aja_agora` (canônico, isolado pelo container) |
| Porta DB no host | `5433` (override via `DB_HOST_PORT`) |
| Porta Letta no host | `8283` (do compose shared) |

## Para outros projetos TwoBrains

Esta skill é **template**. Pra adotar em outro projeto:

1. Copie `.claude/skills/local-dev/` pro repo do projeto.
2. Em `scripts/_lib.sh`, mude `PROJECT_NAME=aja-agora`, `PROJECT_DB_NAME=aja_agora` pra os valores do projeto.
3. Em `scripts/dump-from-dev.sh`, mude `AWS_DB_NAME`, `AWS_PG_ROLE`, `AWS_SECRET_NAME` pros valores do projeto.
4. Atualize `docker-compose.yml` no padrão do pattern.

## Anti-padrões

- ❌ **NUNCA** criar um Letta dentro do `docker-compose.yml` do projeto.
- ❌ **NUNCA** rodar `docker compose -f ~/.tb-local/_shared/... down -v` no dia a dia (apaga memória de todos os projetos).
- ❌ **NUNCA** commitar `.env.local`, `.env.shared`, ou paths com `LETTA_API_KEY` exposto.
- ❌ Migrations rodam dentro do container/app (entrypoint), não direto contra o RDS via tunnel. Dump+restore é uma operação só pra trazer DADOS — schema vem com o dump, não rodar migrations depois.

## Ver também

- Pattern oficial: `~/obsidian-vault/00 - System/Patterns/local-dev-workspaces.md`
- Doc operacional: `~/.tb-local/CONVENTIONS.md`
- ADR da decisão: `~/obsidian-vault/01 - TwoBrains/decisions/2026-05-16-local-dev-shared-letta.md`
- Skill AWS espelho: `twobrains-aws-platform/skills/shared-letta/`

[pattern]: ../../../../../obsidian-vault/00\ -\ System/Patterns/local-dev-workspaces.md
