#!/usr/bin/env bash
# Derruba serviços compartilhados. Default: mantém dados. Com --nuke: apaga
# o volume tb-letta-shared-data (DESTRUTIVO — apaga memória de TODOS os
# projetos que usam Letta local).

source "$(dirname "$0")/_lib.sh"

NUKE=false
if [ "${1:-}" = "--nuke" ]; then
  NUKE=true
fi

if [ "$NUKE" = "true" ]; then
  warn "MODO --nuke: vai apagar tb-letta-shared-data (memória Letta de TODOS projetos)"
  read -p "Tem certeza? (yes/n) " confirm
  if [ "$confirm" != "yes" ]; then
    log "Cancelado."
    exit 0
  fi
  log "Derrubando shared services + volumes..."
  docker compose -f "${TB_SHARED_DIR}/docker-compose.shared.yml" \
    --env-file "${TB_SHARED_DIR}/.env.shared" \
    down -v
  ok "Shared services derrubados e volumes apagados."
else
  log "Derrubando shared services (volumes preservados)..."
  docker compose -f "${TB_SHARED_DIR}/docker-compose.shared.yml" \
    --env-file "${TB_SHARED_DIR}/.env.shared" \
    down
  ok "Shared services derrubados. Volumes preservados."
  ok "Pra apagar memória Letta também: $0 --nuke"
fi
