# Agente de vendas de consórcio — campanha loop-de-goal (entregue na develop)

**Data:** 2026-07-09/10 · **Branch:** develop (`9606f314`) · **Veredito final:** MATADOR PRA PROD (verificador independente Fable, 8/10)

## O que foi entregue
O comportamento validado do protótipo (handoff) virou produto vivo na jornada agêntica: curva de
lance corrigida (power calibrada por oferta, converge a sorteio), guardrail de crédito líquido,
âncora de dinheiro (pelo bolso, com FGTS), 3 cards novos (lance embutido, dois caminhos, escassez)
emitidos **server-side determinístico**, reordenação do funil (experience pós-busca, timeframe como
ponte, gate desire), fecho pro WhatsApp (pede o "oi", especialista de cadastros, template HSM),
proposta co-branded, e um fechamento que **fecha o plano que o cliente confirmou** (não a oferta stale).

## Como foi feito (o diferencial)
**Loop de auto-correção verificado** (loop-de-goal): 8 rodadas de blocos paralelos (Superset), cada
uma auditada por um **agent fable independente** que dirige a jornada de verdade, cruza com pg/tool-io
e cria **propostas reais na Bevi** — nunca self-report. A nota saiu de 3→8/10.

## Qualidade
- Suíte: **2983 → 3244 testes verdes** (todos os fixes com regressão).
- Verificação ao vivo: fluxos A (Madalena) e B (Mario) completos até "Parabéns" com propostas reais.
- Cada dimensão da rubrica em 8-9 (motor, cards, funil, voz, compliance, fecho).

## A lição que sustenta tudo
A nota só subiu quando o invariante crítico foi pra **código, não pro prompt** (Lei 1/4). Estagnou
enquanto era regra-no-prompt; saltou quando virou contenção determinística (tratar tool-error, cap de
steps, emissão server-side, guard de estado cruzado com o turn-trace).

## Dívidas honestas (registradas em docs/correcoes/inbox/, "antes de escalar" não de deployar)
Loop de empty-turn no `wants_more_options` (verificar no WhatsApp), justificativa falsa de faixa,
nits do guard de estado (blocklist). Nenhuma perde dinheiro/dado nem afirma fulfillment falso.
