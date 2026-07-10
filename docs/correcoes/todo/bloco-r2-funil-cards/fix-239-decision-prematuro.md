---
id: FIX-239
titulo: "decision_prompt prematuro em elogio + turno morto no pedido real"
status: todo
bloco: bloco-r2-funil-cards
arquivos: [src/lib/agent/qualify-state.ts, src/lib/agent/orchestrator/index.ts]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P1 #6)
---

## Gap (veredito Fable §D3.4, gap #6)
(a) "Gostei, faz bastante sentido" (elogio, NÃO decisão) disparou o `decision_prompt` ANTES de
experience/timeframe/lance (prematuro). (b) Em "quero seguir com esse plano" o agente anunciou
"Então deixa eu confirmar com você:" e NADA apareceu (guard `decisionDispatched` engoliu a
re-emissão) — promessa visível sem entrega (família FIX-206/207).

## Correção
- `decideShowGate`/roteamento: `decision` só dispara APÓS a qualificação pós-reveal
  (experience/timeframe/lance resolvidos), não em elogio solto (`neutral`/`ready_to_proceed`
  cedo demais). Um elogio pós-reveal antes da qualificação NÃO deve abrir o card de decisão.
- Re-pedido de avanço quando `decisionDispatched` já true → RE-APRESENTAR o card (ou avançar pro
  contract), nunca anunciar "deixa eu confirmar" e engolir (turno morto).

## Regressão (TDD + E2E)
- elogio pós-reveal antes da qualificação NÃO abre decision_prompt.
- re-pedido não gera turno morto (card re-aparece OU avança pro fecho).
