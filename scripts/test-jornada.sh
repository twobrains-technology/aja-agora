#!/usr/bin/env bash
# Roda os CENÁRIOS DE JORNADA (camada 1 — grafo LangGraph real + Postgres real,
# com as duas fronteiras LLM roteirizadas).
#
# Por que este script existe: o `.env.local` aponta `DATABASE_URL` pro DNS de
# CONTAINER (`aja-shared-pg:5432`), que é o certo pro app rodando em container —
# mas não resolve do HOST. Rodar `pnpm vitest` direto no host fazia os cenários
# FALHAREM por conexão (não pular), e o `describeIfDb` deles não protege disso:
# `DATABASE_URL` existe, só não é alcançável. Aqui o host é reescrito pra
# `.orb.local`, que o OrbStack resolve do Mac.
#
# Pré-requisito: shared do projeto de pé (skill local-dev):
#   ~/.claude/skills/local-dev/scripts/project-shared-up.sh
#   ~/.claude/skills/local-dev/scripts/workspace-db.sh ensure
#
# Uso:
#   pnpm test:jornada                 # todos os cenários
#   pnpm test:jornada fix-387         # filtra por nome de arquivo
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "✗ .env.local ausente — rode o bootstrap da skill local-dev primeiro." >&2
  exit 1
fi

BASE_URL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$BASE_URL" ]; then
  echo "✗ DATABASE_URL não encontrado em .env.local." >&2
  exit 1
fi

# Container DNS → DNS do host (OrbStack). Idempotente: se já for .orb.local,
# o sed não casa e a URL segue igual.
HOST_URL=$(printf '%s' "$BASE_URL" | sed -E 's#@([a-z0-9-]+):([0-9]+)/#@\1.orb.local:\2/#')

# O database do .env.local pode ser de OUTRO workspace (worktree). O cenário
# tem que rodar no database DESTE workspace, senão testa contra schema alheio.
WS_DB=$(~/.claude/skills/local-dev/scripts/workspace-db.sh name 2>/dev/null || true)
if [ -n "$WS_DB" ]; then
  HOST_URL=$(printf '%s' "$HOST_URL" | sed -E "s#/[^/?]+(\?|$)#/${WS_DB}\1#")
fi

echo "▶ cenários de jornada — DB: ${HOST_URL##*@}"

FILTRO="${1:-cenario-}"
DATABASE_URL="$HOST_URL" exec npx vitest run \
  --reporter=verbose \
  --no-file-parallelism \
  "src/lib/agent/langgraph/${FILTRO}"
