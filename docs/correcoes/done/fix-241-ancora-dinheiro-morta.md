---
id: FIX-241
titulo: "Âncora de dinheiro é código morto — anchorMonth nunca chamado, monthlySavings nunca capturado"
status: done
bloco: bloco-r2-valor-compliance
arquivos:
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/orchestrator/dial-payload.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/personas.ts
  - src/app/api/chat/route.ts
  - src/lib/whatsapp/interactive-handlers.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P1 #4)
commit: 4e0118d
executado_em: "2026-07-10"
nota: >
  Escopo estendido além do declarado no card (turn-analyzer.ts/dial-payload.ts/route.ts
  já previstos; adicionados directives.ts, runner.ts, personas.ts e o canal WhatsApp
  interactive-handlers.ts — necessários pra fechar o ciclo captura→cálculo→narração
  nos dois canais). FGTS implementado como captura PASSIVA por texto livre (mesmo
  padrão de monthlySavings/desiredItem), não como pergunta ativa/gate bloqueante —
  decisão de escopo: o card não listava isso na checklist de regressão TDD, e criar
  um gate novo é uma decisão de UX de produto não coberta por este bug-fix (funil já
  sinalizado frágil no mesmo veredito, D3).
---

## Gap (veredito Fable §D1, gap #4)
`anchorMonth()` (`contemplation-dial.ts:193`, FIX-227) não era chamado por ninguém
fora dos próprios testes. `monthlySavings` existia só como TIPO (`personas.ts:56`) — o
turn-analyzer não capturava e nenhum handler persistia. Ao vivo: Madalena disse "junto
uns 4 mil por mês" → dial veio com `initialTargetMonth: 6` (= prazo desejado), não
~mês 15 (bolso). A narração "juntando R$ 4 mil/mês, lá pelo mês X seu dinheiro
alcança" nunca acontecia. FGTS (imóvel) idem: nunca perguntado, nunca entrava como fonte.

## Correção
1. **Captura** (`turn-analyzer.ts` + `analyze.ts`): novos slots `monthlySavings`/
   `fgtsValue` no schema Zod do analyzer (exemplos few-shot: "junto uns 4 mil por
   mês", "tenho uns 15 mil de FGTS"), merge oportunista em `qualifyAnswers` — mesmo
   padrão "primeira ocorrência, nunca sobrescrita" do FIX-233 (`desiredItem`/`motivation`).
2. **Cálculo único** (`dial-payload.ts:computeMoneyAnchor`): chama `anchorMonth()`
   (motor já existia e já era testado, só nunca chamado em produção) com
   `initial=lanceValue`, `monthlySavings`, `fgts=fgtsValue`. `coerceDialPayload` passa
   a priorizar o mês ancorado sobre o palpite do modelo/prazo declarado quando
   `monthlySavings` está presente — a agulha responde "quando o dinheiro alcança",
   não "quando você quer" (spec 03).
3. **Narração** (`directives.ts:buildSimulatorDialDirective`): quando há âncora,
   instrui o agente a dizer, numa frase factual, "juntando R$ X/mês, lá pelo mês Y
   seu dinheiro alcança o lance" — sem prometer contemplação nesse mês. Fiada nos
   dois canais (`route.ts` web + `interactive-handlers.ts` WhatsApp) via o MESMO
   `computeMoneyAnchor` — "cálculo único, duas apresentações" (spec 03).
4. `runner.ts`: repassa `monthlySavings`/`fgtsValue` de `qualifyAnswers` pro
   `coerceDialPayload` (antes só passava `prazoMeses`/`lanceValue`).

## Regressão (TDD — vista falhar antes, verde depois)
- `turn-analyzer.fix-241.test.ts`: schema tem os slots, exemplo few-shot, parse ok.
- `analyze.test.ts` (bloco FIX-241): merge oportunista monthlySavings/fgtsValue,
  primeira ocorrência preservada.
- `dial-payload.test.ts` (bloco FIX-241): `computeMoneyAnchor` usa o MESMO
  `anchorMonth()` de `contemplation-dial.ts` (comparado diretamente no teste);
  `lanceValue`→`initial`; `fgtsValue` antecipa o mês; `coerceDialPayload` prioriza o
  ancorado sobre modelo/prazo desejado no cenário exato do bug (prazo=6, modelo
  manda 6, dinheiro ancora em mês ≠ 6) — e mantém a prioridade antiga intacta sem
  `monthlySavings`.
- `directives.fix-241.test.ts`: narração aparece só com `moneyAnchor`; sem ele, a
  diretiva é byte-a-byte igual à anterior (retrocompat).

## Achado extra corrigido de quebra
`tests/regression/agent-trajectory.test.ts` (teste FIX-38, "card de decisão fica
pros caminhos ambíguos") — a lookahead regex `\n\t+\/\/` (QUALQUER profundidade de
tabs) parou no comentário que este fix aninhou dentro do ramo `action.value ===
"yes"` (uma profundidade a mais que o `if (action.gate === "simulator-offer")` de
abertura), truncando o bloco ANTES de alcançar o ramo `"no"` que chama
`buildDecisionPromptDirective`. Corrigido travando a lookahead na profundidade exata
(6 tabs) do `if` de abertura/comentário que de fato encerra o bloco — não é mudança
de comportamento do produto, só destrava o gate local.
