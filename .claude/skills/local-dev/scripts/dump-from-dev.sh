#!/usr/bin/env bash
# Dump do aja-agora-dev (RDS AWS) → Postgres local do workspace.
#
# Estratégia:
#   1. SSM port-forward (sem VPN no host — convenção TwoBrains)
#   2. pg_dump --clean --if-exists --no-owner --no-acl (streaming)
#   3. DROP DATABASE local + CREATE + restore (clean slate)
#
# DESTRUTIVO no DB local do workspace. Pede confirmação.

source "$(dirname "$0")/_lib.sh"

ROOT="$(repo_root)"
WORKSPACE="$(workspace_name)"
PG_CONTAINER="aja-pg-${WORKSPACE}"
LOCAL_PORT="${LOCAL_TUNNEL_PORT:-15432}"   # porta local pro tunnel (não colide com 5432/5433)
DB_HOST_PORT="${DB_HOST_PORT:-5433}"

log "Dump aja-agora-dev → $PG_CONTAINER (workspace: $WORKSPACE)"

# Pre-flight
ensure_orb
if ! docker ps --filter "name=^${PG_CONTAINER}$" --filter "status=running" --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  err "Container $PG_CONTAINER não está rodando. Rode bootstrap-workspace.sh primeiro."
fi
command -v pg_dump >/dev/null 2>&1 || err "pg_dump não instalado. Instale: brew install libpq && brew link --force libpq"
command -v psql >/dev/null 2>&1 || err "psql não instalado. brew install libpq && brew link --force libpq"

aws_sso_ensure "$AWS_PROFILE_DEFAULT"
export AWS_PROFILE="$AWS_PROFILE_DEFAULT" AWS_REGION="$AWS_REGION"

# Confirmação destrutiva (pula com --yes ou FORCE=1)
FORCE="${FORCE:-0}"
if [ "${1:-}" = "--yes" ] || [ "${1:-}" = "-y" ]; then
  FORCE=1
fi
warn "Isso vai APAGAR todos os dados do banco local $PROJECT_DB_NAME (container $PG_CONTAINER) e substituir pelo dump do dev AWS."
if [ "$FORCE" != "1" ]; then
  read -p "Tem certeza? (yes/n) " confirm
  if [ "$confirm" != "yes" ]; then
    log "Cancelado."
    exit 0
  fi
fi

# 1. Buscar credenciais do secret
# Convenção TwoBrains: secrets de DB role podem vir como JSON {username,password}
# OU como string pura (a senha — username está implícito no AWS_PG_ROLE).
log "Buscando credenciais do Secrets Manager ($AWS_SECRET_NAME)..."
SECRET_VALUE="$(aws secretsmanager get-secret-value --secret-id "$AWS_SECRET_NAME" --query SecretString --output text)"
if echo "$SECRET_VALUE" | jq -e . >/dev/null 2>&1; then
  PG_USER="$(echo "$SECRET_VALUE" | jq -r '.username // .user // .USERNAME // empty')"
  PG_PASS="$(echo "$SECRET_VALUE" | jq -r '.password // .PASSWORD // empty')"
else
  # secret é string pura — assume que é a senha
  PG_PASS="$SECRET_VALUE"
  PG_USER=""
fi
[ -z "$PG_USER" ] && PG_USER="$AWS_PG_ROLE"
[ -z "$PG_PASS" ] && err "Não consegui extrair password do secret $AWS_SECRET_NAME"
ok "Credenciais carregadas (user=$PG_USER)"

# 2. Pegar instance ID de uma ECS container instance
log "Localizando ECS container instance pro SSM tunnel..."
ECS_HOST_ARN="$(aws ecs list-container-instances --cluster tb-cluster --query 'containerInstanceArns[0]' --output text)"
[ -z "$ECS_HOST_ARN" ] || [ "$ECS_HOST_ARN" = "None" ] && err "Nenhuma ECS container instance disponível no tb-cluster"
INSTANCE_ID="$(aws ecs describe-container-instances --cluster tb-cluster --container-instances "$ECS_HOST_ARN" --query 'containerInstances[0].ec2InstanceId' --output text)"
ok "Tunnel via $INSTANCE_ID → $RDS_ENDPOINT:$RDS_PORT"

# 3. Iniciar port-forward em background
log "Iniciando SSM port-forward (local:$LOCAL_PORT → $RDS_ENDPOINT:$RDS_PORT)..."
SSM_LOG="$(mktemp)"
aws ssm start-session \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$RDS_ENDPOINT\"],\"portNumber\":[\"$RDS_PORT\"],\"localPortNumber\":[\"$LOCAL_PORT\"]}" \
  > "$SSM_LOG" 2>&1 &
SSM_PID=$!

# Cleanup tunnel quando o script termina
cleanup() {
  if kill -0 "$SSM_PID" 2>/dev/null; then
    log "Encerrando tunnel SSM (pid=$SSM_PID)..."
    kill "$SSM_PID" 2>/dev/null || true
    wait "$SSM_PID" 2>/dev/null || true
  fi
  rm -f "$SSM_LOG"
}
trap cleanup EXIT INT TERM

# Aguardar tunnel ficar pronto
log "Aguardando tunnel..."
for i in $(seq 1 30); do
  if nc -z localhost "$LOCAL_PORT" 2>/dev/null; then
    ok "Tunnel ativo (porta local $LOCAL_PORT)"
    break
  fi
  if ! kill -0 "$SSM_PID" 2>/dev/null; then
    cat "$SSM_LOG" >&2
    err "Tunnel SSM morreu antes de ficar pronto"
  fi
  sleep 1
done

# 4. DROP/CREATE DB local (clean slate)
log "Recriando DB local $PROJECT_DB_NAME no container $PG_CONTAINER..."
docker exec "$PG_CONTAINER" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"$PROJECT_DB_NAME\";"
docker exec "$PG_CONTAINER" psql -U postgres -d postgres -c "CREATE DATABASE \"$PROJECT_DB_NAME\";"
ok "DB local recriado limpo"

# 5. Dump → Restore (streaming)
# Filter: pg_dump local pode ser de versão > server (ex: 18 vs 16 server).
# Algumas diretivas (SET transaction_timeout, SET row_security em alguns
# casos) só existem em versões mais novas. Strip antes de aplicar no destino.
log "Dumpando $AWS_DB_NAME do dev AWS e restaurando local (streaming)..."
PGPASSWORD="$PG_PASS" pg_dump \
  --host=localhost \
  --port="$LOCAL_PORT" \
  --username="$PG_USER" \
  --dbname="$AWS_DB_NAME" \
  --no-owner \
  --no-acl \
  --no-privileges \
  --clean \
  --if-exists \
  --format=plain \
  --verbose 2>/tmp/pg_dump.log \
  | sed -E '/^SET transaction_timeout/d' \
  | PGPASSWORD=postgres psql \
      --host=localhost \
      --port="$DB_HOST_PORT" \
      --username=postgres \
      --dbname="$PROJECT_DB_NAME" \
      --quiet \
      --set ON_ERROR_STOP=on

if [ $? -eq 0 ]; then
  ok "Dump+restore concluído."
else
  warn "Restore retornou erro. Veja /tmp/pg_dump.log"
fi

# 6. Sumário (contagem de rows)
log "Sumário do banco local:"
docker exec "$PG_CONTAINER" psql -U postgres -d "$PROJECT_DB_NAME" -c "
  SELECT
    table_schema,
    table_name,
    (xpath('/row/cnt/text()',
     query_to_xml(format('SELECT count(*) AS cnt FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS row_count
  FROM information_schema.tables
  WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    AND table_type='BASE TABLE'
  ORDER BY row_count DESC NULLS LAST
  LIMIT 30;"

ok "Pronto. DATABASE_URL no .env.local:"
echo "  postgresql://postgres:postgres@localhost:${DB_HOST_PORT}/${PROJECT_DB_NAME}"
