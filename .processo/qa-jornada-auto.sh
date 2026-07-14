#!/bin/bash
set -a && source .env.local && source contas-teste.env && set +a

CONV_ID="$1"

conversar() {
  local msg="$1"
  local sleep_time="${2:-3}"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "$msg"
  sleep "$sleep_time"
}

btn() {
  local id="$1"
  local title="$2"
  local sleep_time="${3:-3}"
  node scripts/qa/wa-talk.mjs "$CONV_ID" --btn "$id" "$title"
  sleep "$sleep_time"
}

echo "=== JORNADA AUTO — Madalena ==="
echo "Conversation ID: $CONV_ID"
echo ""

echo "=== TURNO 1: Abertura ==="
conversar "Oi, quero comprar um Corolla, um carro que custa cerca de 150 mil reais"

echo "=== TURNO 2: Apresentação ==="
conversar "Meu nome é Madalena"

echo "=== TURNO 3: Detalhe do carro ==="
conversar "Um Corolla novo, uns 150 mil reais"

echo "=== TURNO 4: CPF ==="
conversar "$CONTA1_CPF"

echo "=== TURNO 5: Teste 'não entendi' ==="
conversar "não entendi"

echo "=== TURNO 6: Teste banco 'Bradesco' (não existe) ==="
conversar "Bradesco"

# Vamos ver os botões
echo "=== AGUARDANDO OPÇÕES... ==="
sleep 5

# Se houver botões, vamos clicar no primeiro
# Mas primeiro vamos apenas continuar a conversa
echo "=== TURNO 7: Continuação para ver as opções ==="
conversar "Tá bom, me mostra as opções"
