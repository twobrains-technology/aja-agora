#!/usr/bin/env bash
# Roda a spec E2E de tela da FRENTE 2 (recomendação/simulador/fechamento):
#   1. Semeia o estado (FORA do container — docker exec não existe dentro dele)
#   2. Injeta o resultado do seed como env vars
#   3. Roda o Playwright DENTRO do container (chromium do sistema, Alpine)
#
# Uso:
#   SEED_CPF=... SEED_CELULAR=... ./scripts/run-e2e-recomendacao.sh [spec-path] [-- extra playwright args]
set -euo pipefail

APP_CONTAINER="${APP_CONTAINER:-aja-app-frente-2-recomendacao-fechamento}"
SEED_NOME="${SEED_NOME:-Kairo}"
SEED_CREDIT_MAX="${SEED_CREDIT_MAX:-80000}"
SEED_CATEGORY="${SEED_CATEGORY:-auto}"
SPEC_PATH="${1:-tests/e2e/specs/recomendacao-fechamento/}"
shift || true

if [ -z "${SEED_CPF:-}" ] || [ -z "${SEED_CELULAR:-}" ]; then
  echo "SEED_CPF/SEED_CELULAR obrigatórios (conta de teste real — secrets.sh decrypt contas-teste)." >&2
  exit 1
fi

seed_one() {
  local channel="${1:-web}"
  docker exec \
    -e SEED_CPF="$SEED_CPF" -e SEED_CELULAR="$SEED_CELULAR" -e SEED_NOME="$SEED_NOME" \
    -e SEED_CREDIT_MAX="$SEED_CREDIT_MAX" -e SEED_CATEGORY="$SEED_CATEGORY" \
    -e SEED_CHANNEL="$channel" \
    "$APP_CONTAINER" pnpm dlx tsx scripts/seed-recomendacao.ts | tail -1
}

extract() {
  echo "$1" | grep -oE "\"$2\":\"[^\"]+\"" | cut -d'"' -f4
}

echo "[seed] semeando estado #1 (fora do container)..."
SEED_JSON_1="$(seed_one web)"
echo "[seed] $SEED_JSON_1"
CONV_ID_1="$(extract "$SEED_JSON_1" conversationId)"
WEB_COOKIE_1="$(extract "$SEED_JSON_1" webCookie)"

echo "[seed] semeando estado #2 (fora do container)..."
SEED_JSON_2="$(seed_one web)"
echo "[seed] $SEED_JSON_2"
CONV_ID_2="$(extract "$SEED_JSON_2" conversationId)"
WEB_COOKIE_2="$(extract "$SEED_JSON_2" webCookie)"

if [ -z "$CONV_ID_1" ] || [ -z "$WEB_COOKIE_1" ] || [ -z "$CONV_ID_2" ] || [ -z "$WEB_COOKIE_2" ]; then
  echo "Falha ao extrair conversationId/webCookie do seed." >&2
  exit 1
fi

echo "[e2e] conversationId#1=$CONV_ID_1 conversationId#2=$CONV_ID_2"
echo "[e2e] rodando Playwright dentro do container..."

# DATABASE_URL NÃO é sobrescrita — o container já a tem correta (injetada pelo
# compose, aponta pro Postgres do workspace via DNS interno da rede Docker).
docker exec \
  -e PLAYWRIGHT_TEST_BASE_URL="http://localhost:3000" \
  -e PW_EXECUTABLE_PATH="/usr/bin/chromium-browser" \
  -e SEED_CONVERSATION_ID="$CONV_ID_1" \
  -e SEED_WEB_COOKIE="$WEB_COOKIE_1" \
  -e SEED_CONVERSATION_ID_2="$CONV_ID_2" \
  -e SEED_WEB_COOKIE_2="$WEB_COOKIE_2" \
  -e SEED_CATEGORY="$SEED_CATEGORY" \
  -e SEED_CREDIT_MAX="$SEED_CREDIT_MAX" \
  "$APP_CONTAINER" sh -c "cd /app && pnpm exec playwright test $SPEC_PATH --project=chromium --workers=1 $*"
