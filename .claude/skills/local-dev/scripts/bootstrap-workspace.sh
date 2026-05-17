#!/usr/bin/env bash
# Bootstrap do workspace atual: gera .env.local, sobe Postgres do
# workspace, conecta na tb-local-net. Idempotente.
#
# Uso:
#   ./bootstrap-workspace.sh           # bootstrap normal
#   ./bootstrap-workspace.sh --with-dump   # após bootstrap, dumpa do dev AWS

source "$(dirname "$0")/_lib.sh"

ROOT="$(repo_root)"
WORKSPACE="$(workspace_name)"
WITH_DUMP=false

if [ "${1:-}" = "--with-dump" ]; then
  WITH_DUMP=true
fi

log "Bootstrap workspace: $WORKSPACE (em $ROOT)"

# 1. Pré-requisitos: orb, network, shared
ensure_orb
ensure_network

# 2. Verificar se Letta shared está rodando
if ! docker ps --filter "name=tb-letta-shared" --filter "status=running" --format '{{.Names}}' | grep -q tb-letta-shared; then
  warn "tb-letta-shared não está rodando. Subindo primeiro..."
  "$(dirname "$0")/shared-up.sh"
fi

# 3. Gerar .env.local se não existir (ou se WORKSPACE_NAME estiver desalinhado)
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

# Substituições inline no .env.local (idempotentes)
update_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -q "^${key}=" "$file"; then
    # macOS sed precisa de '' depois do -i
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
    rm -f "${file}.bak"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

update_env_var "WORKSPACE_NAME" "$WORKSPACE" "$ENV_LOCAL"
update_env_var "LETTA_API_KEY" "$SHARED_PASS" "$ENV_LOCAL"
update_env_var "LETTA_NAMESPACE" "${PROJECT_NAME}-local-${WORKSPACE}" "$ENV_LOCAL"

ok ".env.local gerado/atualizado (WORKSPACE_NAME=$WORKSPACE)"

# 4. Subir Postgres do workspace
log "Subindo Postgres do workspace ($WORKSPACE)..."
cd "$ROOT"
docker compose --env-file "$ENV_LOCAL" up -d db

# Aguardar healthcheck
log "Aguardando Postgres healthcheck..."
for i in $(seq 1 20); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "aja-pg-${WORKSPACE}" 2>/dev/null || echo "starting")"
  if [ "$status" = "healthy" ]; then
    ok "Postgres aja-pg-${WORKSPACE} healthy (em ${i}s)"
    break
  fi
  sleep 1
done

# 5. Rodar migrations (Drizzle, via npm script local — não tocar no entrypoint)
log "Rodando migrations Drizzle..."
( cd "$ROOT" && DATABASE_URL="postgresql://postgres:postgres@localhost:${DB_HOST_PORT:-5433}/${PROJECT_DB_NAME}" npm run db:migrate )
ok "Migrations aplicadas"

# 6. Opcional: dump do dev AWS
if [ "$WITH_DUMP" = "true" ]; then
  "$(dirname "$0")/dump-from-dev.sh"
fi

ok "Bootstrap completo!"
echo ""
log "Pra iniciar o app: cd $ROOT && npm run dev"
log "Pra dumpar do dev AWS depois: ./.claude/skills/local-dev/scripts/dump-from-dev.sh"
