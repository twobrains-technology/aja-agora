---
name: aja-agora-local-dev
description: Operar o ambiente local do aja-agora segregado por branch (Postgres + app em containers do workspace, Letta compartilhado via ~/.tb-local/_shared/). Bootstrap, dump do aja-agora-dev AWS, teardown isolado. Convenção TwoBrains local-dev-workspaces.
---

# Skill — Local dev do aja-agora

Operações de dev local seguindo a convenção
[local-dev-workspaces][pattern] do TwoBrains.

**Princípio:** a **stack inteira do projeto** roda em containers
segregados por **workspace** (= nome da branch git atual, ou do diretório
do worktree). **Apenas o Letta** é compartilhado entre todos os projetos
TwoBrains via `~/.tb-local/_shared/`.

Sem `pnpm dev`/`next dev` no host. Sem Postgres no host. Sem nada do
projeto no host. **Tudo em container.** (E `pnpm` é o único gestor de
pacotes — `npm`/`yarn` proibidos. Ver CLAUDE.md → "Package manager — pnpm ÚNICO".)

## Workspace = branch

| Situação | Workspace |
|---|---|
| Clone principal (`/Users/kairo/code/aja-agora`) | nome da branch atual (`develop`, `feature/x`, etc.) |
| Worktree (`~/.superset/worktrees/tb-aja-agora/<nome>`) | nome do diretório do worktree |
| Override explícito | `WORKSPACE_NAME=foo` no env |

`/` em nome de branch vira `-` (Docker name-safe).

## Quando usar

| Cenário | Ação |
|---|---|
| Primeira vez no Mac (subir Letta shared) | `scripts/shared-up.sh` |
| Subir/recriar stack do workspace atual | `scripts/bootstrap-workspace.sh` |
| Trazer dados do aja-agora-dev AWS | `scripts/dump-from-dev.sh` |
| Reset destrutivo do workspace atual | `scripts/teardown-workspace.sh --nuke` |
| Derrubar Letta shared (não dia a dia) | `scripts/shared-down.sh` |
| Resetar memória Letta global (CUIDADO) | `scripts/shared-down.sh --nuke` |

Todos os scripts são **idempotentes** — rodar 2x não quebra.

## Fluxo: primeira vez no Mac

```bash
# 1. (one-time global) Criar network + subir Letta compartilhado
./.claude/skills/local-dev/scripts/shared-up.sh

# 2. (one-time global) Configurar ~/.tb-local/_shared/.env.shared se faltar
#    (o script avisa e abre $EDITOR se faltar)

# 3. (por workspace) Bootstrap deste workspace — sobe DB + builda + sobe app
./.claude/skills/local-dev/scripts/bootstrap-workspace.sh

# 4. Acessar
open http://localhost:$APP_HOST_PORT
```

## Fluxo: nova branch / novo worktree

```bash
# Em qualquer branch da pasta principal OU em qualquer worktree
./.claude/skills/local-dev/scripts/bootstrap-workspace.sh
```

A skill detecta o workspace (branch ou nome do worktree), gera
`.env.local` derivado, sobe `aja-pg-<workspace>` e `aja-app-<workspace>`,
conecta ambos na `tb-local-net` (onde já está o Letta shared).
`LETTA_NAMESPACE=aja-agora-local-<workspace>` garante que agents de
branches diferentes nunca se cruzam.

## Convenções aplicadas

| Recurso | Nome neste workspace |
|---|---|
| Container Postgres | `aja-pg-<workspace>` |
| Container App | `aja-app-<workspace>` |
| Volume Postgres | `aja-pg-<workspace>-data` |
| Container Letta (compartilhado) | `tb-letta-shared` (alias DNS: `letta`) |
| Network Docker | `tb-local-net` (external, criada one-time) |
| Letta namespace | `aja-agora-local-<workspace>` |
| DB name | `aja_agora` (canônico, isolado pelo container) |
| Porta DB no host | definida no `.env.local` por workspace (ex: 5434) |
| Porta App no host | definida no `.env.local` por workspace (ex: 3010) |
| Porta Letta no host | `8283` (do compose shared) |

**Cada workspace usa portas distintas no host** — escolha porta livre por
workspace pra rodar várias branches simultâneas sem colisão. Convenção:
DB começa em 5433 e App em 3000, incrementando por workspace.

## Dump do dev AWS

```bash
./.claude/skills/local-dev/scripts/dump-from-dev.sh        # interativo
./.claude/skills/local-dev/scripts/dump-from-dev.sh --yes  # sem prompt
```

Estratégia: SSM port-forward (sem VPN no host) → `pg_dump` streaming →
`psql` no Postgres do workspace. **DESTRUTIVO** no DB local: faz DROP +
CREATE + restore. Lê `DB_HOST_PORT` do `.env.local` automaticamente.

## Para outros projetos TwoBrains

Esta skill é **template**. Pra adotar em outro projeto:

1. Copie `.claude/skills/local-dev/` pro repo do projeto.
2. Em `scripts/_lib.sh`: `PROJECT_NAME`, `PROJECT_DB_NAME`, `AWS_*`.
3. Garanta `docker-compose.yml` com:
   - service `db` (Postgres, container `<prefix>-pg-${WORKSPACE_NAME}`)
   - service `app` (profile `containerized`, build local, container `<prefix>-app-${WORKSPACE_NAME}`)
   - network `tb-local-net` external
4. `.env.example` com `WORKSPACE_NAME`, `DB_HOST_PORT`, `APP_HOST_PORT`, `LETTA_BASE_URL=http://letta:8283`.

## Anti-padrões

- ❌ **NUNCA** rodar `pnpm dev`, `pnpm build`, `next start`/`next dev` no host. Stack inteira em container, sempre.
- ❌ **NUNCA** usar `npm`/`yarn` (lockfile, store e dev local dependem de pnpm). `pnpm` é o único.
- ❌ **NUNCA** rodar Postgres do projeto no host (Postgres.app, brew). Sempre em container do workspace.
- ❌ **NUNCA** criar um Letta dentro do `docker-compose.yml` do projeto.
- ❌ **NUNCA** rodar `docker compose -f ~/.tb-local/_shared/... down -v` no dia a dia (apaga memória de todos os projetos).
- ❌ **NUNCA** commitar `.env.local`, `.env.shared`, ou paths com `LETTA_API_KEY` exposto.
- ❌ Migrations rodam dentro do container do app (entrypoint via `db:migrate:runtime`), não direto contra o RDS via tunnel. Dump+restore é uma operação só pra trazer DADOS — schema vem com o dump.
- ❌ Duas branches usando a mesma `DB_HOST_PORT`/`APP_HOST_PORT` no host (colisão de bind). Convenção: incremente por workspace.

## Ver também

- Pattern oficial: `~/obsidian-vault/00 - System/Patterns/local-dev-workspaces.md`
- Doc operacional: `~/.tb-local/CONVENTIONS.md`
- ADR da decisão: `~/obsidian-vault/01 - TwoBrains/decisions/2026-05-16-local-dev-shared-letta.md`
- Skill AWS espelho: `twobrains-aws-platform/skills/shared-letta/`

[pattern]: ../../../../../obsidian-vault/00\ -\ System/Patterns/local-dev-workspaces.md
