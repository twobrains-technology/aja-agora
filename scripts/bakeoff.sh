#!/usr/bin/env bash
# Bake-off de modelos do AGENTE do aja-agora.
#
# Roda a suíte de eval (jornada canônica + agent-flow + assistant-flow) UMA vez
# por modelo, trocando só o `AI_MODEL` do agente, e tabula os sinais que
# importam pra decidir a troca: fidelidade à jornada (fluxoScore do LLM-judge),
# testes verdes/vermelhos (onde o modelo escorrega — hallucination estrutural,
# handoff, coerência de tool) e as tools disparadas.
#
# O user-bot (persona do cliente que dirige a conversa) fica FIXO
# (`AI_MODEL_EVAL`, default claude-haiku-4-5) pra o "usuário" ser constante
# entre os modelos — a variável independente é SÓ o modelo do agente.
# O juiz também é constante (claude-sonnet-4-6, hardcoded em src/lib/eval/*) →
# comparação justa.
#
# Uso:
#   scripts/bakeoff.sh                                   # sonnet-5 vs haiku-4.5
#   scripts/bakeoff.sh claude-sonnet-5 claude-haiku-4-5 qwen-flash deepseek-flash
#
# Pré-requisitos:
#   - stack local-dev de pé (DB em db.aja-<branch>.orb.local) — ver skill local-dev
#   - ANTHROPIC_API_KEY no .env.local (modelos Anthropic rodam direto)
#   - modelos NÃO-Anthropic (qwen/deepseek): precisam do gateway LiteLLM —
#     setar LITELLM_BASE_URL/LITELLM_SRV_NAME no env e o model-id publicado no
#     config.yaml do gateway (@ai-sdk/anthropic manda body Anthropic; o LiteLLM
#     traduz). Sem isso, o braço não-Anthropic falha na chamada.
set -uo pipefail
cd "$(dirname "$0")/.."

MODELS=("$@")
[ ${#MODELS[@]} -eq 0 ] && MODELS=(claude-sonnet-5 claude-haiku-4-5)
USER_BOT="${AI_MODEL_EVAL:-claude-haiku-4-5}"
EVALS="${BAKEOFF_EVALS:-tests/eval/jornada-aja-agora.eval.test.ts tests/eval/agent-flow.eval.test.ts tests/eval/assistant-flow.eval.test.ts}"
OUT="${BAKEOFF_OUT:-.bakeoff}"
mkdir -p "$OUT"

for M in "${MODELS[@]}"; do
  echo "▶ eval com agente=$M (user-bot fixo=$USER_BOT)…"
  AI_MODEL="$M" AI_MODEL_EVAL="$USER_BOT" \
    pnpm vitest run --config vitest.eval.config.ts $EVALS >"$OUT/$M.log" 2>&1 || true
  echo "  ↳ log em $OUT/$M.log"
done

# ── Tabela comparativa ──
printf '\n## Bake-off — agente por modelo (user-bot fixo: %s, juiz fixo: sonnet-4-6)\n\n' "$USER_BOT"
printf '| modelo | testes verdes | fluxoScore (jornada) | tools jornada | falhas |\n'
printf '|---|---|---|---|---|\n'
for M in "${MODELS[@]}"; do
  log="$OUT/$M.log"
  passed=$(grep -oE 'Tests +[0-9]+ passed' "$log" 2>/dev/null | grep -oE '[0-9]+' | tail -1)
  failed=$(grep -oE '[0-9]+ failed' "$log" 2>/dev/null | grep -oE '[0-9]+' | tail -1)
  total=$(grep -oE 'Tests .*\(([0-9]+)\)' "$log" 2>/dev/null | grep -oE '\([0-9]+\)' | tail -1 | tr -d '()')
  flux=$(grep -oE 'fluxoScore=[0-9.]+' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  ntools=$(grep '\[jornada tools\]' "$log" 2>/dev/null | tail -1 | tr ',' '\n' | grep -c .)
  printf '| %s | %s/%s | %s | %s | %s |\n' "$M" "${passed:-?}" "${total:-?}" "${flux:-?}" "${ntools:-?}" "${failed:-0}"
done

# ── Onde cada modelo escorrega (testes que falharam) ──
for M in "${MODELS[@]}"; do
  printf '\n### %s — testes que falharam\n' "$M"
  grep -E '×|✗|^ ?FAIL ' "$OUT/$M.log" 2>/dev/null | grep -vE 'Failed Tests' | sed -E 's/^[[:space:]]*/  - /' | sort -u | head -25
  [ "${PIPESTATUS[0]:-1}" -ne 0 ] && echo "  (nenhuma falha)"
done
