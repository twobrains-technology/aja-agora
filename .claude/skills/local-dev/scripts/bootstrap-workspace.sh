#!/usr/bin/env bash
# Bootstrap do workspace atual: stack inteira em containers segregados.
#
# Sobe:
#   - aja-pg-<workspace>   (Postgres do workspace, isolado)
#   - aja-app-<workspace>  (Next.js do workspace, build local)
# Conecta na tb-local-net (onde está o tb-letta-shared, alias 'letta').
#
# Idempotente.
#
# Uso:
#   ./bootstrap-workspace.sh              # bootstrap normal (db + app)
#   ./bootstrap-workspace.sh --with-dump  # bootstrap + dump do dev AWS
#   ./bootstrap-workspace.sh --db-only    # só Postgres, sem app
#   ./bootstrap-workspace.sh --no-build   # pula --build (usa imagem existente)

source "$(dirname "$0")/_lib.sh"

ROOT="$(repo_root)"
WORKSPACE="$(workspace_name)"
WITH_DUMP=false
DB_ONLY=false
NO_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --with-dump) WITH_DUMP=true ;;
    --db-only)   DB_ONLY=true ;;
    --no-build)  NO_BUILD=true ;;
    *) warn "flag desconhecida: $arg" ;;
  esac
done

log "Bootstrap workspace: $WORKSPACE (em $ROOT)"

# 1. Pré-requisitos
ensure_orb
ensure_network

# 2. Letta shared rodando
if ! docker ps --filter "name=tb-letta-shared" --filter "status=running" --format '{{.Names}}' | grep -q tb-letta-shared; then
  warn "tb-letta-shared não está rodando. Subindo primeiro..."
  "$(dirname "$0")/shared-up.sh"
fi

# 3. Gerar .env.local se não existir
ENV_LOCAL="${ROOT}/.env.local"
if [ ! -f "$ENV_LOCAL" ]; then
  log "Gerando $ENV_LOCAL a partir de .env.example..."
  cp "${ROOT}/.env.example" "$ENV_LOCAL"
fi

# Pegar LETTA_SERVER_PASS do shared e preencher LETTA_API_KEY no .env.local
SHARED_PASS="$(grep '^LETTA_SERVER_PASS=' "${TB_SHARED_DIR}/.env.shared" | cut -d= -f2-)"
if [ -z "$SHARED_PASS" ]; then
  err "LETTA_SERVER_PASS vazio em ${TB_SHARED_DIR}/.env.shared"
fi

update_env_var() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
    rm -f "${file}.bak"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

update_env_var "WORKSPACE_NAME" "$WORKSPACE" "$ENV_LOCAL"
update_env_var "LETTA_API_KEY" "$SHARED_PASS" "$ENV_LOCAL"
update_env_var "LETTA_NAMESPACE" "${PROJECT_NAME}-local-${WORKSPACE}" "$ENV_LOCAL"

ok ".env.local OK (WORKSPACE_NAME=$WORKSPACE)"

# Pegar portas do .env.local
WORKSPACE_DB_PORT="$(grep '^DB_HOST_PORT=' "$ENV_LOCAL" | cut -d= -f2- | tr -d '"' || true)"
WORKSPACE_DB_PORT="${WORKSPACE_DB_PORT:-5433}"
WORKSPACE_APP_PORT="$(grep '^APP_HOST_PORT=' "$ENV_LOCAL" | cut -d= -f2- | tr -d '"' || true)"
WORKSPACE_APP_PORT="${WORKSPACE_APP_PORT:-3000}"

# 4. Subir Postgres do workspace
log "Subindo Postgres do workspace ($WORKSPACE) na porta ${WORKSPACE_DB_PORT}..."
cd "$ROOT"
docker compose --env-file "$ENV_LOCAL" up -d db

# Aguardar healthcheck
log "Aguardando Postgres healthcheck..."
for i in $(seq 1 30); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "aja-pg-${WORKSPACE}" 2>/dev/null || echo "starting")"
  if [ "$status" = "healthy" ]; then
    ok "Postgres aja-pg-${WORKSPACE} healthy (em ${i}s)"
    break
  fi
  sleep 1
done

if [ "$DB_ONLY" = "true" ]; then
  ok "DB_ONLY=true — pulando app."
  if [ "$WITH_DUMP" = "true" ]; then
    "$(dirname "$0")/dump-from-dev.sh"
  fi
  exit 0
fi

# 5. Build + subir App
BUILD_FLAG="--build"
[ "$NO_BUILD" = "true" ] && BUILD_FLAG=""

log "Subindo App (container aja-app-${WORKSPACE}, porta ${WORKSPACE_APP_PORT})..."
log "Build do Next.js standalone pode levar 1-3 min na primeira vez..."
docker compose --env-file "$ENV_LOCAL" --profile containerized up -d ${BUILD_FLAG} app

APP_DNS="aja-${WORKSPACE}.local"
APP_URL="http://${APP_DNS}"

# Aguardar app responder (entrypoint roda migrations antes)
log "Aguardando app responder em ${APP_URL} (ou http://localhost:${WORKSPACE_APP_PORT})..."
APP_OK=false
for i in $(seq 1 60); do
  for endpoint in "${APP_URL}" "http://localhost:${WORKSPACE_APP_PORT}"; do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' "$endpoint" 2>/dev/null || echo "000")"
    if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then
      ok "App respondendo (HTTP $code) em $endpoint"
      APP_OK=true
      break 2
    fi
  done
  sleep 2
done

if [ "$APP_OK" != "true" ]; then
  warn "App não respondeu em 120s. Logs:"
  docker logs --tail 50 "aja-app-${WORKSPACE}" 2>&1 | sed 's/^/  /'
  err "Bootstrap incompleto — verifique logs"
fi

# 6. Opcional: dump do dev AWS
if [ "$WITH_DUMP" = "true" ]; then
  "$(dirname "$0")/dump-from-dev.sh"
fi

ok "Bootstrap completo!"
echo ""
log "Stack do workspace '$WORKSPACE':"
docker ps --filter "name=aja-pg-${WORKSPACE}" --filter "name=aja-app-${WORKSPACE}" --format "  {{.Names}}\t{{.Status}}\t{{.Ports}}"
log "Letta shared: tb-letta-shared (porta 8283)"
log "Acesse via DNS local: ${APP_URL}"
log "Fallback (porta):     http://localhost:${WORKSPACE_APP_PORT}"
log "DB via DNS local:     db.aja-${WORKSPACE}.local:5432 (psql -h db.aja-${WORKSPACE}.local -U postgres aja_agora)"
