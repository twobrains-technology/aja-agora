---
bloco: bloco-r9-2-anchor-fechamento
branch: fix/r9-2-anchor-fechamento
workspace: fix-r9-2-anchor-fechamento
onda: 1
depends_on: []
paralelo_com: [bloco-r9-2-prompt-honestidade, bloco-r9-2-gate-refino]
itens: [FIX-281]
escopo_arquivos:
  - src/lib/bevi/contract-input.ts
  - src/lib/bevi/fulfillment.ts
  - src/lib/bevi/contract-input.test.ts
  - src/lib/bevi/fulfillment.test.ts
conflitos_esperados: []
---
# Bloco r9-2 — Âncora do fechamento (FIX-281)

**Escopo isolado (Bevi/fechamento)** — não compartilha nenhum arquivo com os outros 2 blocos da
onda 2 (`bloco-r9-2-prompt-honestidade` mexe em `orchestrator/index.ts`+`directives.ts`+
`sanitizer.ts`+`system-prompt.ts`; `bloco-r9-2-gate-refino` mexe em `qualify-state.ts`+
`orchestrator/analyze.ts`+`gate-questions.ts`+`personas.ts`+`system-prompt.ts` — regiões
diferentes das do bloco-prompt-honestidade). Nível 1 (independente) — merge limpo garantido.

## Item único
**FIX-281** — o `rawCreditValue` que alimenta o aviso de divergência CDC (art. 30/37) no
`real_offer` (card do fechamento) vem, hoje, do `creditValue` da ÚLTIMA oferta recomendada
(`meta.recommendedOffer.creditValue`) em vez do valor REALMENTE pedido pelo cliente
(`meta.qualifyAnswers.creditClampedFrom ?? creditMax` — a MESMA âncora que já funciona
corretamente no hero `recommendation_card`, `runner.ts:658-659`). Resultado: em mario, o campo
some (divergência real 70k→71.043 fica invisível); em madalena, o campo aparece mas com o número
errado (sub-representa 250k→263.864/+5,55% como se fosse 260.173→263.864/+1,4%).

Correção: introduzir um campo NOVO e independente (`originalRequestedCreditValue`) que carrega
a âncora correta através de `StartContractInput`/`StartContractResult`, SEM tocar no `valor`
existente (que continua servindo, corretamente, só o matching da oferta — FIX-73). Ver
`fix-281-ancora-rawcreditvalue-real-offer.md` pro detalhe completo (file:line, tabela de
correção, regressão exigida).

Este bloco NÃO precisa mexer no componente (`real-offer.tsx` já está correto — só renderiza o
que chega) nem nos call-sites (`route.ts`, `whatsapp/contract-capture.ts` já destructuram o
campo certo; passam a receber o valor correto de graça).
