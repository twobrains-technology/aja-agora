---
id: FIX-236
titulo: "3ª saída 'só a parcela' completar — gate lance precisa APARECER com o chip"
status: todo
bloco: bloco-r2-funil-cards
arquivos: [src/lib/agent/qualify-state.ts, src/lib/web/adapter.ts, src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P0 #1)
---

## Gap (veredito Fable §D3.1, gap #1)
3ª saída "só a parcela" quebrada em TODOS os caminhos → Fluxo B morre sem proposta.
**JÁ FEITO na base (commit e5882cb6):** chip "Só a parcela, sem lance" (adapter.ts) + union
`so_parcela` (actions.ts) + handler que roteia so_parcela → `buildLanceSoParcelaDirective`
(route.ts). **FALTA (este card):** o gate `lance` está sendo PULADO no funil (vai direto pra
`lance-embutido`), então o chip nunca aparece pro cliente escolher. Prova (condução E2E):
turn-trace mostra `experience → timeframe → lance-embutido` (sem `lance`).

## Correção
- Investigar em `qualify-state.ts::nextGate` por que `hasLance` já vem setado (analyzer? handler?)
  fazendo pular `if (!q.hasLance) return "lance"`. Garantir que o gate `lance` (com o chip
  so_parcela) SEMPRE apareça pós-reveal antes de lance-embutido/simulator-offer.
- Confirmar o caminho de TEXTO livre ("não quero comprometer nada além da parcela",
  `turn-analyzer.ts:156`): deve rotear pro two_paths, não repetir a educação de embutido (o
  Fable viu a MESMA bolha 3× seguidas).

## Regressão (TDD + E2E)
- `nextGate` emite `lance` (com chip so_parcela) pós-reveal; não pula pra lance-embutido.
- E2E: Fluxo B (Mario) com "só a parcela" → `two_paths` no artifact stream + decision/proposta depois.
- texto livre de recusa de lance → two_paths, nunca educação de embutido repetida.
