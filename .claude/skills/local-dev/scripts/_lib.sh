#!/usr/bin/env bash
# Shared helpers pra scripts de local-dev. Sourced pelos outros scripts.
# NÃO executar direto.

set -euo pipefail

# === Configurável por projeto ===
PROJECT_NAME="aja-agora"
PROJECT_DB_NAME="aja_agora"      # canônico (com underscore) — não confundir com DB AWS (com hífen)
AWS_DB_NAME="aja-agora-dev"      # nome do DB no RDS AWS (com hífen — DB name é case-sensitive e literal)
AWS_PG_ROLE="app_aja_agora_dev"
AWS_SECRET_NAME="tb/dba/postgres/app_aja_agora_dev"
AWS_REGION="sa-east-1"
AWS_PROFILE_DEFAULT="tb-prod"    # mesmo profile cobre dev na conta 438465163995
RDS_ENDPOINT="db-twobrains-prd.cj6kou8iuh0s.sa-east-1.rds.amazonaws.com"
RDS_PORT="5432"
TB_LOCAL_DIR="${HOME}/.tb-local"
TB_SHARED_DIR="${TB_LOCAL_DIR}/_shared"
NETWORK_NAME="tb-local-net"

# === Cores e logging ===
if [ -t 1 ]; then
  BOLD="\033[1m"; RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m"; BLUE="\033[34m"; RESET="\033[0m"
else
  BOLD=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

log()  { printf "${BLUE}[%s]${RESET} %s\n" "$(date +%H:%M:%S)" "$*"; }
ok()   { printf "${GREEN}✓${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}!${RESET} %s\n" "$*" >&2; }
err()  { printf "${RED}✗${RESET} %s\n" "$*" >&2; exit 1; }

# === Helpers ===
workspace_name() {
  # Override explícito ganha sempre
  if [ -n "${WORKSPACE_NAME:-}" ]; then
    echo "$WORKSPACE_NAME"
    return 0
  fi
  # Workspace = nome do diretório do worktree (subindo até achar package.json).
  # Fallback: se o basename é o nome canônico do projeto (estamos no clone
  # principal, não em worktree), usa o nome da branch git atual sanitizado.
  local dir="${PWD}"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/package.json" ]; then
      local base
      base="$(basename "$dir")"
      if [ "$base" = "$PROJECT_NAME" ]; then
        local branch
        if branch="$(git -C "$dir" branch --show-current 2>/dev/null)" && [ -n "$branch" ]; then
          # sanitize: '/' vira '-' (Docker name-safe)
          echo "$branch" | tr '/' '-'
          return 0
        fi
      fi
      echo "$base"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  err "Não achei package.json subindo de $PWD — não consigo determinar WORKSPACE_NAME"
}

repo_root() {
  local dir="${PWD}"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/package.json" ]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  err "Não achei package.json subindo de $PWD"
}

ensure_orb() {
  if ! orb status 2>/dev/null | grep -qi running; then
    log "Iniciando OrbStack..."
    orb start
  fi
  ok "OrbStack rodando"
}

ensure_network() {
  if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    log "Criando network Docker $NETWORK_NAME..."
    docker network create "$NETWORK_NAME"
  fi
  ok "Network $NETWORK_NAME presente"
}

ensure_shared_env() {
  if [ ! -f "${TB_SHARED_DIR}/.env.shared" ]; then
    warn "${TB_SHARED_DIR}/.env.shared não existe."
    if [ -f "${TB_SHARED_DIR}/.env.shared.example" ]; then
      cp "${TB_SHARED_DIR}/.env.shared.example" "${TB_SHARED_DIR}/.env.shared"
      chmod 600 "${TB_SHARED_DIR}/.env.shared"
      # Gerar pass random
      local pass
      pass="$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-40)"
      # Substituir LETTA_SERVER_PASS no arquivo recém-copiado
      sed -i.bak "s|LETTA_SERVER_PASS=.*|LETTA_SERVER_PASS=${pass}|" "${TB_SHARED_DIR}/.env.shared"
      rm -f "${TB_SHARED_DIR}/.env.shared.bak"
      warn "Criei ${TB_SHARED_DIR}/.env.shared com LETTA_SERVER_PASS aleatório."
      warn "Edite agora pra preencher ANTHROPIC_API_KEY e OPENAI_API_KEY:"
      warn "  \$EDITOR ${TB_SHARED_DIR}/.env.shared"
      exit 1
    else
      err "Template ${TB_SHARED_DIR}/.env.shared.example também não existe — algo errado com o setup global"
    fi
  fi
}

aws_sso_ensure() {
  local profile="${1:-$AWS_PROFILE_DEFAULT}"
  if ! AWS_PROFILE="$profile" aws sts get-caller-identity >/dev/null 2>&1; then
    log "AWS SSO expirado pro profile $profile — fazendo login..."
    aws sso login --profile "$profile"
  fi
  ok "AWS SSO ativo (profile=$profile)"
}
