---
id: FIX-241
titulo: "Âncora de dinheiro é código morto — anchorMonth nunca chamado, monthlySavings nunca capturado"
status: todo
bloco: bloco-r2-valor-compliance
arquivos: [src/lib/agent/turn-analyzer.ts, src/lib/agent/dial-payload.ts, src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P1 #4)
---

## Gap (veredito Fable §D1, gap #4)
`anchorMonth()` (`contemplation-dial.ts:193`, FIX-227) NÃO é chamado por ninguém fora dos testes.
`monthlySavings` existe só como tipo (`personas.ts:56`) — o turn-analyzer não captura e nenhum
handler persiste. Ao vivo: Madalena disse "junto uns 4 mil por mês" → dial veio com
`initialTargetMonth: 6` (= prazo desejado, `dial-payload.ts:116-121`), não ~mês 15 (bolso). A
narração "juntando 4 mil/mês, lá pelo mês X seu dinheiro alcança" NUNCA acontece. FGTS (imóvel) idem.

## Correção
- Capturar `monthlySavings` (e reserva pontual `lanceValue`) no turn-analyzer/handler do gate lance
  e persistir em `qualifyAnswers`.
- `dial-payload.ts`: quando houver `monthlySavings`/reserva, ancorar o `initialTargetMonth` via
  `anchorMonth()` (1º mês em que o BOLSO cobre `ownCashValue`, não o lance total) em vez do prazo desejado.
- Narração: o agente diz "juntando R$ X/mês, lá pelo mês Y seu dinheiro alcança o lance" (spec `03`).
- FGTS (imóvel): perguntar e somar como fonte de embutido.

## Regressão (TDD + E2E)
- `monthlySavings` capturado de "junto 4 mil por mês".
- dial ancora no mês do bolso (não no desejo) quando há poupança; `anchorMonth` chamado.
