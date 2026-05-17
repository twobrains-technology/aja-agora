#!/usr/bin/env bash
# Sobe os serviços compartilhados em ~/.tb-local/_shared/ (Letta).
# Idempotente: rodar 2x não quebra.

source "$(dirname "$0")/_lib.sh"

ensure_orb
ensure_network
ensure_shared_env

log "Subindo serviços compartilhados (Letta)..."
docker compose -f "${TB_SHARED_DIR}/docker-compose.shared.yml" \
  --env-file "${TB_SHARED_DIR}/.env.shared" \
  up -d

# Aguardar healthcheck
log "Aguardando Letta healthcheck..."
for i in $(seq 1 30); do
  status="$(docker inspect --format='{{.State.Health.Status}}' tb-letta-shared 2>/dev/null || echo "starting")"
  if [ "$status" = "healthy" ]; then
    ok "Letta healthy (em ${i}s)"
    break
  fi
  sleep 1
done

if [ "$status" != "healthy" ]; then
  warn "Letta ainda não está healthy após 30s. Status: $status"
  warn "Veja logs: docker logs tb-letta-shared"
  exit 1
fi

# Smoke test do endpoint
pass="$(grep '^LETTA_SERVER_PASS=' "${TB_SHARED_DIR}/.env.shared" | cut -d= -f2-)"
if curl -fsS -H "Authorization: Bearer $pass" http://localhost:8283/v1/health/ | grep -q '"status"'; then
  ok "Letta API respondendo em http://localhost:8283"
else
  err "Letta API não respondeu como esperado"
fi
