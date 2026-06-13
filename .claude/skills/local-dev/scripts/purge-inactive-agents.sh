#!/usr/bin/env bash
# Purge de agents Letta inativos há mais de N dias (default 365).
# Conforme ADR 2026-05-16 (decisão #12): retenção 365d, cleanup mensal.
#
# Filtra por namespace prefix (default: aja-agora- — cobre dev/local/prod).
# Para cada agent, lê `lastInteractionAt` do memory_block "human" (JSON
# serializado). Se ausente, usa `created_at` do agent. Se > N dias, deleta.
#
# Uso:
#   ./purge-inactive-agents.sh [days] [namespace_prefix]
#   ./purge-inactive-agents.sh 365 aja-agora-
#
# DRY_RUN=1 lista candidatos sem deletar.

source "$(dirname "$0")/_lib.sh"

DAYS="${1:-365}"
PREFIX="${2:-aja-agora-}"
DRY_RUN="${DRY_RUN:-0}"

# Resolve Letta URL + API key (dev local)
ensure_orb
LETTA_PASS=""
if [ -f "${TB_SHARED_DIR}/.env.shared" ]; then
  LETTA_PASS="$(grep '^LETTA_SERVER_PASS=' "${TB_SHARED_DIR}/.env.shared" | cut -d= -f2-)"
fi
LETTA_URL="${LETTA_BASE_URL:-http://localhost:8283}"

if [ -z "$LETTA_PASS" ]; then
  err "LETTA_SERVER_PASS não encontrado em ${TB_SHARED_DIR}/.env.shared"
fi

# Verifica Letta health antes
if ! curl -fsS -H "Authorization: Bearer $LETTA_PASS" "$LETTA_URL/v1/health/" >/dev/null 2>&1; then
  err "Letta não responde em $LETTA_URL. Suba com shared-up.sh"
fi

log "Purge inativos: prefix=$PREFIX threshold=${DAYS}d dry_run=${DRY_RUN}"

# Lista TODOS agents (sem filtro server-side de prefix — vamos filtrar local)
agents_json="$(curl -fsS -H "Authorization: Bearer $LETTA_PASS" "$LETTA_URL/v1/agents/?limit=999")"

# Threshold em segundos
threshold_seconds=$((DAYS * 86400))
now_epoch=$(date -u +%s)
deleted=0
kept=0
skipped=0

# Iterar via python (jq não tem facilidade pra parsear JSON aninhado em block)
echo "$agents_json" | python3 -c "
import sys, json, urllib.request
from datetime import datetime, timezone

agents = json.load(sys.stdin)
prefix = '$PREFIX'
threshold = $threshold_seconds
now = $now_epoch
dry_run = int('$DRY_RUN') == 1
letta_url = '$LETTA_URL'
letta_pass = '$LETTA_PASS'

def to_epoch(iso):
    try:
        if iso.endswith('Z'):
            iso = iso.replace('Z', '+00:00')
        return int(datetime.fromisoformat(iso).timestamp())
    except Exception:
        return None

stats = {'deleted': 0, 'kept': 0, 'skipped': 0}
for a in agents:
    name = a.get('name', '')
    if not name.startswith(prefix):
        stats['skipped'] += 1
        continue

    # Tenta extrair lastInteractionAt do memory block 'human'
    human_block = None
    mem = a.get('memory') or {}
    for b in (mem.get('blocks') or []):
        if b.get('label') == 'human':
            human_block = b
            break

    last_at_epoch = None
    if human_block and human_block.get('value'):
        try:
            block_data = json.loads(human_block['value'])
            iso = block_data.get('lastInteractionAt')
            if iso:
                last_at_epoch = to_epoch(iso)
        except Exception:
            pass

    if last_at_epoch is None:
        # Fallback: created_at do agent
        last_at_epoch = to_epoch(a.get('created_at', ''))

    if last_at_epoch is None:
        # Sem timestamp utilizável — pula com aviso
        print(f'!  pulando (sem timestamp): {name}')
        stats['skipped'] += 1
        continue

    age = now - last_at_epoch
    age_days = age // 86400

    if age < threshold:
        stats['kept'] += 1
        continue

    if dry_run:
        print(f'[DRY] deletaria: {name} ({age_days}d inativo)')
    else:
        agent_id = a.get('id')
        req = urllib.request.Request(
            f'{letta_url}/v1/agents/{agent_id}',
            method='DELETE',
            headers={'Authorization': f'Bearer {letta_pass}'},
        )
        try:
            urllib.request.urlopen(req, timeout=10).read()
            print(f'✓ deletado: {name} ({age_days}d inativo)')
            stats['deleted'] += 1
        except Exception as e:
            print(f'✗ falha ao deletar {name}: {e}')
            stats['skipped'] += 1

print(f\"\\nResumo: deleted={stats['deleted']} kept={stats['kept']} skipped={stats['skipped']}\")
"
