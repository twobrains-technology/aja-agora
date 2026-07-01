#!/usr/bin/env bash
# Roda a spec E2E de tela da FRENTE 2 — paridade WhatsApp (simulador
# /admin/simulator/whatsapp). Mesmo padrão do run-e2e-recomendacao.sh: seed
# FORA do container (docker exec não existe dentro dele) → injeta via env →
# Playwright dentro do container.
#
# Uso:
#   SEED_CPF=... SEED_CELULAR=... ./scripts/run-e2e-whatsapp.sh
set -euo pipefail

APP_CONTAINER="${APP_CONTAINER:-aja-app-frente-2-recomendacao-fechamento}"
SEED_CREDIT_MAX="${SEED_CREDIT_MAX:-80000}"
SEED_CATEGORY="${SEED_CATEGORY:-auto}"
SPEC_PATH="${1:-tests/e2e/specs/recomendacao-fechamento/whatsapp-paridade.spec.ts}"
shift || true

if [ -z "${SEED_CPF:-}" ] || [ -z "${SEED_CELULAR:-}" ]; then
  echo "SEED_CPF/SEED_CELULAR obrigatórios (conta de teste real — secrets.sh decrypt contas-teste)." >&2
  exit 1
fi

# Nome único (a lista do simulador é compartilhada — várias sessões/frentes
# podem estar semeando conversas simuladas ao mesmo tempo).
TAG="QA-E2E-WA-$(date +%s)"

echo "[seed] semeando conversa whatsapp (fora do container)..."
SEED_JSON="$(docker exec \
  -e SEED_CPF="$SEED_CPF" -e SEED_CELULAR="$SEED_CELULAR" -e SEED_NOME="$TAG" \
  -e SEED_CREDIT_MAX="$SEED_CREDIT_MAX" -e SEED_CATEGORY="$SEED_CATEGORY" \
  -e SEED_CHANNEL="whatsapp" \
  "$APP_CONTAINER" pnpm dlx tsx scripts/seed-recomendacao.ts | tail -1)"
echo "[seed] $SEED_JSON"

CONV_ID="$(echo "$SEED_JSON" | grep -oE '"conversationId":"[^"]+"' | cut -d'"' -f4)"
if [ -z "$CONV_ID" ]; then
  echo "Falha ao extrair conversationId do seed. JSON bruto: $SEED_JSON" >&2
  exit 1
fi

echo "[e2e] conversationId=$CONV_ID tag=$TAG"
echo "[e2e] rodando Playwright dentro do container..."

docker exec \
  -e PLAYWRIGHT_TEST_BASE_URL="http://localhost:3000" \
  -e PW_EXECUTABLE_PATH="/usr/bin/chromium-browser" \
  -e SEED_WA_CONVERSATION_ID="$CONV_ID" \
  -e ADMIN_EMAIL="${ADMIN_EMAIL:-admin@ajaagora.com.br}" \
  -e ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}" \
  "$APP_CONTAINER" sh -c "cd /app && pnpm exec playwright test $SPEC_PATH --project=chromium --workers=1 $*"
