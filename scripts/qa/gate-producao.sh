#!/usr/bin/env bash
# Gate no MODELO DE PRODUÇÃO — um comando, e ele devolve o ambiente como achou.
#
# Por que existe: o túnel do LiteLLM de produção depende de SSO (`tb-prod`). Quando o SSO expira,
# `aws sso login` exige login Microsoft interativo e esta sessão não fecha o gate no modelo de
# produção — mas o resto da cadeia (subir o túnel, apontar o app, rodar a bateria, medir, restaurar)
# não precisa ser refeito à mão. Rodar assim:
#
#   bash scripts/qa/gate-producao.sh            # roda a bateria e mede
#   bash scripts/qa/gate-producao.sh --so-tunel  # só sobe o túnel e confere
#
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

CONTA=438465163995
INSTANCIA=i-049f3f20ad5d3cadb
PORTA_LOCAL=4101
MODELO=claude-haiku-5-5-alan-brow-twobrains
APP=aja-app-chefe-criterio-do-chat
SHA=$(git rev-parse --short HEAD)

echo "== 1/6 · SSO do tb-prod"
if ! AWS_PROFILE=tb-prod aws sts get-caller-identity --query Account --output text 2>/dev/null | grep -q "$CONTA"; then
	echo "SSO EXPIRADO — rode 'aws sso login --profile tb-prod' no navegador (a sessão não faz isso por você)."
	exit 2
fi

echo "== 2/6 · abrindo o túnel SSM para o LiteLLM de produção"
pkill -f "session-manager-plugin" 2>/dev/null
sleep 2
AWS_PROFILE=tb-prod aws ssm start-session --target "$INSTANCIA" \
	--document-name AWS-StartPortForwardingSessionToRemoteHost \
	--parameters "{\"host\":[\"127.0.0.1\"],\"portNumber\":[\"4000\"],\"localPortNumber\":[\"$PORTA_LOCAL\"]}" \
	> /tmp/ssm-gate.log 2>&1 &
for _ in $(seq 1 20); do
	sleep 3
	code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:$PORTA_LOCAL/health/liveliness")
	[ "$code" = "200" ] && break
done
if [ "${code:-000}" != "200" ]; then
	echo "TÚNEL NÃO SUBIU (health=$code). Veja /tmp/ssm-gate.log"
	exit 3
fi
[ "${1:-}" = "--so-tunel" ] && { echo "túnel OK em 127.0.0.1:$PORTA_LOCAL"; exit 0; }

echo "== 3/6 · chave de produção (efêmera, em /tmp e apagada no fim)"
AWS_PROFILE=tb-prod aws secretsmanager get-secret-value --secret-id tb/prod/aja-agora/env \
	--query SecretString --output text 2>/dev/null |
	python3 -c 'import sys,json;d=json.load(sys.stdin);open("/tmp/prod-llm-key","w").write(d["LITELLM_API_KEY"])'
chmod 600 /tmp/prod-llm-key

cat > /tmp/prod-llm-override.yml <<YML
services:
  app:
    environment:
      LITELLM_BASE_URL: http://host.docker.internal:$PORTA_LOCAL
      LITELLM_API_KEY: \${LITELLM_API_KEY}
      AI_MODEL: $MODELO
YML

echo "== 4/6 · app com o modelo de produção"
LITELLM_API_KEY=$(cat /tmp/prod-llm-key) docker compose --env-file .env.local \
	-f docker-compose.yml -f /tmp/prod-llm-override.yml --profile containerized up -d app >/dev/null
sleep 25
docker exec "$APP" sh -lc 'echo "   AI_MODEL=$AI_MODEL  BASE=$LITELLM_BASE_URL"'

echo "== 5/6 · bateria (sha $SHA, modelo $MODELO)"
docker exec -e AJA_BASE_URL=http://localhost:3000 -e EVAL_GIT_SHA="$SHA" "$APP" \
	sh -lc 'cd /app && pnpm eval' | tee ".orientacao/logs/gate-producao-$SHA.log" | tail -5

echo "== 6/6 · devolvendo o ambiente ao gateway local"
docker compose --env-file .env.local --profile containerized up -d --force-recreate app >/dev/null
sleep 20
docker exec "$APP" sh -lc 'echo "   AI_MODEL=$AI_MODEL  BASE=$LITELLM_BASE_URL"'
pkill -f "session-manager-plugin" 2>/dev/null
rm -f /tmp/prod-llm-key /tmp/prod-llm-override.yml
echo "pronto. medidor do toque: psql -v minutos=60 -f scripts/qa/medidor-toque.sql"
