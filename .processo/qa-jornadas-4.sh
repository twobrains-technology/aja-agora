#!/bin/bash
set -a && source .env.local && source contas-teste.env && set +a

# 4 jornadas em série com testes críticos

run_jornada() {
  local tipo="$1"
  local persona="$2"
  local inicial="$3"

  echo ""
  echo "════════════════════════════════════════════"
  echo "JORNADA: $tipo — $persona"
  echo "════════════════════════════════════════════"

  # Criar conversa
  local CONV_ID=$(node scripts/qa/wa-talk.mjs --new)
  echo "ConvID: $CONV_ID"

  # Abertura
  echo ""
  echo "TURNO 1: $inicial"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "$inicial"
  sleep 2

  # Nome
  echo ""
  echo "TURNO 2: Nome"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "Meu nome é $persona"
  sleep 2

  # Detalhe (repete inicial)
  echo ""
  echo "TURNO 3: Detalhe"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "$inicial"
  sleep 2

  # CPF
  echo ""
  echo "TURNO 4: CPF"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "$CONTA1_CPF"
  sleep 3

  # Renda
  echo ""
  echo "TURNO 5: Renda"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "5000"
  sleep 2

  # "Não entendi"
  echo ""
  echo "TURNO 6: Teste 'não entendi'"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "não entendi"
  sleep 2

  # Resposta ao "não entendi"
  echo ""
  echo "TURNO 7: Resposta genérica"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "tá bom"
  sleep 2

  # Banco inexistente
  echo ""
  echo "TURNO 8: Teste 'Bradesco' (não existe)"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "Bradesco"
  sleep 2

  # Aguarda opções aparecerem
  echo ""
  echo "TURNO 9: Continua"
  node scripts/qa/wa-talk.mjs "$CONV_ID" "Me mostra as opções"
  sleep 5

  echo ""
  echo "✓ Jornada $tipo concluída"
  echo "ConvID: $CONV_ID"
  echo ""
}

# Executar as 4 jornadas
run_jornada "auto" "Madalena" "Quero comprar um Corolla novo que custa 150 mil reais"
run_jornada "moto" "Mario" "Quero uma moto pra delivery que custa uns 35 mil"
run_jornada "imovel" "Fernanda" "Quero comprar um apartamento de 400 mil e tenho FGTS"
run_jornada "servicos" "Bruno" "Quero fazer uma reforma de 30 mil e não entendo nada de consórcio"

echo ""
echo "════════════════════════════════════════════"
echo "TODAS AS 4 JORNADAS CONCLUÍDAS"
echo "════════════════════════════════════════════"
