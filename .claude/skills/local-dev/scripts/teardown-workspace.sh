#!/usr/bin/env bash
# Derruba os containers do workspace atual. Default: mantém volume.
# Com --nuke: apaga o volume aja-pg-<workspace>-data (DESTRUTIVO).

source "$(dirname "$0")/_lib.sh"

ROOT="$(repo_root)"
WORKSPACE="$(workspace_name)"

NUKE=false
if [ "${1:-}" = "--nuke" ]; then
  NUKE=true
fi

cd "$ROOT"

if [ "$NUKE" = "true" ]; then
  warn "MODO --nuke: vai apagar volume aja-pg-${WORKSPACE}-data (dados deste workspace)"
  read -p "Tem certeza? (yes/n) " confirm
  if [ "$confirm" != "yes" ]; then
    log "Cancelado."
    exit 0
  fi
  docker compose --env-file .env.local down -v
  ok "Workspace $WORKSPACE derrubado e volume apagado."
else
  docker compose --env-file .env.local down
  ok "Workspace $WORKSPACE derrubado. Volume preservado."
  ok "Pra apagar dados também: $0 --nuke"
fi
