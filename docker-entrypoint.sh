#!/bin/sh
# Entrypoint padrão TwoBrains — roda migrations do ORM antes de iniciar o app.
#
# Convenção: o container é responsável por garantir que o schema está atualizado
# no startup. Sem dependência de step externo (RunTask, init container, manual).
# Ver `reference/conventions.md` seção "Migrations".
#
# Detecção (em ordem):
#   1. $MIGRATE_CMD             — override explícito (qualquer comando shell)
#   2. npm run db:migrate:runtime — convenção pra apps Drizzle/runtime-only
#                                   (sem drizzle-kit no runtime; usa drizzle-orm/migrator)
#   3. npx prisma migrate deploy  — apps Prisma (precisam de `prisma` em deps,
#                                   não devDeps, pra estar no runtime)
#
# Opt-out: SKIP_MIGRATIONS=true   — pra rebuild emergencial / rollback de schema.
#
# Lock: cabe ao ORM. Drizzle (`__drizzle_migrations`) e Prisma (`_prisma_migrations`)
# já têm advisory lock + tracking table. Race condition entre múltiplas tasks é
# tratada pelo ORM. Pra desired_count > 1 com migrations destrutivas, considere
# o pattern "RunTask one-shot" — ver skills/00-app-zero-to-prod.md.
#
# Safety: o runner `migrate-guard.mjs` (chamado por `db:migrate:runtime`) detecta
# statements destrutivos (DROP TABLE/COLUMN, TRUNCATE, DELETE sem WHERE, etc.) e
# **aborta em prod** a menos que `ALLOW_DESTRUCTIVE_MIGRATION=true` esteja no
# secret do app. Container falha startup → ECS rollback automático.

set -e

if [ "${SKIP_MIGRATIONS}" = "true" ]; then
  echo "[entrypoint] SKIP_MIGRATIONS=true — pulando migrations"
  exec "$@"
fi

CMD=""
if [ -n "${MIGRATE_CMD}" ]; then
  CMD="${MIGRATE_CMD}"
elif [ -f /app/package.json ] && grep -q '"db:migrate:runtime"' /app/package.json 2>/dev/null; then
  CMD="npm run --silent db:migrate:runtime"
elif [ -f /app/prisma/schema.prisma ]; then
  CMD="npx --no-install prisma migrate deploy"
fi

if [ -n "${CMD}" ]; then
  echo "[entrypoint] running migrations: ${CMD}"
  cd /app
  # shellcheck disable=SC2086
  sh -c "${CMD}"
  echo "[entrypoint] migrations done"
else
  echo "[entrypoint] no migrate command detected — skipping (set MIGRATE_CMD ou crie script db:migrate:runtime)"
fi

exec "$@"
