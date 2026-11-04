#!/usr/bin/env bash
# Acorda a dev (scale-to-zero): PRD 2026-11-04, §6.3.
#
#   bash scripts/qa/acordar-dev.sh [URL_DA_DEV]     # URL também por E2E_BASE
#
# Credencial/perfil TwoBrains já do ambiente (AWS_PROFILE ou variáveis AWS_*).
# Se desired=0, sobe para 1; espera running=1 e a URL responder (teto de 10 min);
# imprime os horários (pedido, primeiro 200, desiredCount final).
set -uo pipefail

CLUSTER=tb-cluster
SERVICO=aja-agora-dev
REGIAO=sa-east-1
URL="${1:-${E2E_BASE:-}}"
LIMITE=600

agora() { date -u +%Y-%m-%dT%H:%M:%SZ; }
estado() {
  aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICO" --region "$REGIAO" \
    --query 'services[0].[desiredCount,runningCount]' --output text
}

INICIO=$(agora)
echo "inicio: $INICIO"
read -r DESEJADO RODANDO < <(estado) || { echo "falha ao consultar o ECS (credencial?)" >&2; exit 1; }
echo "estado inicial: desired=$DESEJADO running=$RODANDO"

PEDIDO="(não foi preciso)"
if [ "$DESEJADO" = "0" ]; then
  aws ecs update-service --cluster "$CLUSTER" --service "$SERVICO" --desired-count 1 \
    --region "$REGIAO" --query 'service.desiredCount' --output text >/dev/null \
    || { echo "update-service falhou (IAM?)" >&2; exit 1; }
  PEDIDO=$(agora)
  echo "pedido de acordar: $PEDIDO"
fi

T0=$(date +%s)
while :; do
  read -r DESEJADO RODANDO < <(estado) || true
  [ "${RODANDO:-0}" -ge 1 ] 2>/dev/null && break
  [ $(( $(date +%s) - T0 )) -ge "$LIMITE" ] && { echo "TIMEOUT: running=$RODANDO após ${LIMITE}s" >&2; exit 1; }
  sleep 10
done
echo "running=1 em: $(agora)"

PRIMEIRO_200="(sem URL: informe E2E_BASE ou o 1º argumento)"
if [ -n "$URL" ]; then
  PRIMEIRO_200=""
  while :; do
    CODIGO=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${URL%/}/api/auth/get-session" || echo 000)
    if [ "$CODIGO" != "000" ] && [ "$CODIGO" -lt 500 ]; then PRIMEIRO_200=$(agora); break; fi
    [ $(( $(date +%s) - T0 )) -ge "$LIMITE" ] && { echo "TIMEOUT: URL não respondeu em ${LIMITE}s (último HTTP $CODIGO)" >&2; exit 1; }
    sleep 10
  done
fi

read -r DESEJADO RODANDO < <(estado) || true
echo "---"
echo "inicio:          $INICIO"
echo "pedido acordar:  $PEDIDO"
echo "primeiro 200:    $PRIMEIRO_200"
echo "desiredCount:    $DESEJADO (running=$RODANDO)"
