#!/usr/bin/env bash
# Roda os cenários do baseline r9 SEQUENCIAL (não paralelo — evita re-wedgar o engine),
# com health-check do app antes de cada. Conta de teste via arg (CONTA1|CONTA2).
# Uso: ./run-all.sh [CONTA1|CONTA2] [cenario1 cenario2 ...]
set -uo pipefail
cd /Users/kairo/code/aja-agora
ACC="${1:-CONTA1}"; shift || true
set -a; source contas-teste.env; set +a
cpf_var="${ACC}_CPF"; cel_var="${ACC}_CELULAR"
export E2E_TEST_CPF="${!cpf_var}"; export E2E_TEST_CELULAR="${!cel_var}"
DRIVER=.processo/loop/evidencias-r9/driver/run-scenario.mjs
ROT=.processo/loop/evidencias-r9/roteiros
OUT=.processo/loop/evidencias-r9/dossies
APP=http://aja-app-develop.orb.local
SCEN=("$@"); [ ${#SCEN[@]} -eq 0 ] && SCEN=(madalena-junta mario-sem-lance probe-i1-empty-turn probe-i2-justificativa probe-i3-fabricacao)
ready(){ for i in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 $APP/ 2>/dev/null)" = "200" ] && return 0; sleep 2; done; return 1; }
for s in "${SCEN[@]}"; do
  echo "=== CENARIO $s (conta=$ACC) ==="
  ready || { echo "APP DOWN antes de $s — abortando batch"; exit 3; }
  node "$DRIVER" "$ROT/$s.json" "$OUT/$s" 2>&1 | tail -4
done
echo "=== BATCH DONE ($(date +%H:%M:%S)) ==="
