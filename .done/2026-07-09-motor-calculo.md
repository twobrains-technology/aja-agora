---
titulo: "Bloco motor-calculo — curva power calibrada, guardrail netCredit, âncora de dinheiro"
data: 2026-07-09
bloco: bloco-motor-calculo
branch: feat/motor-calculo-contemplacao
tipo: fix/feature de motor numérico (Handoff agente-vendas-consorcio, PR0 + PR2 + PR8)
---

# Bloco motor-calculo — o coração numérico da agulha e da recomendação

Três correções no motor puro (sem UI, sem prompt) que a agulha de contemplação e a
recomendação de grupos usam. Executadas em ordem (FIX-225 → FIX-226 → FIX-227) porque
FIX-227 depende da curva nova do FIX-225.

## TL;DR

- **FIX-225** — a curva de lance necessário era hiperbólica: achatava em 90%/80% (clamp)
  nos meses iniciais e nunca convergia a zero no fim do prazo (o modo sorteio não emergia
  sozinho). Trocada por curva power calibrada (`docs/03-regras-calculo.md`), que passa
  exatamente pelo ponto real da oferta e tende a zero no fim do prazo. `likelihood`
  (heurística sem base de dado) removido; `admSobreEmbutido` adicionado.
- **FIX-226** — não existia nenhum guardrail de crédito líquido: uma estratégia de lance
  embutido podia recomendar uma carta cujo `netCredit` cai abaixo do valor do bem (o
  cliente contempla mais rápido mas recebe dinheiro que não compra o que veio comprar).
  `respectsNetCreditGuardrail` (pura) + wiring em `rankGroups` — reordena, nunca descarta.
- **FIX-227** — a agulha só sabia "mês desejado", não "mês em que o dinheiro do cliente
  alcança o lance". `anchorMonth` varre o prazo comparando poupança acumulada contra o
  BOLSO necessário (nunca o lance total) e o FGTS (vertical imóvel) entra como acelerador.
- **Gate**: `pnpm test:unit` verde nos arquivos tocados (78 testes em `src/lib/consorcio/`
  + 13 em `src/lib/agent/recommendation.test.ts`); suíte completa do repo rodada também —
  907 passaram, 6 falharam, todas as 6 por `ENOTFOUND db.aja-develop.orb.local` (container
  transitório sem acesso à stack de DB do workspace), em arquivos fora do escopo deste
  bloco e sem qualquer relação com o contrato alterado.

## Commits

| Commit | O quê |
|---|---|
| `9d24bbb1` | fix: substitui curva hiperbolica por power calibrada no dial de contemplacao (FIX-225) |
| `347e8787` | docs: move fix-225 pra done |
| `961a8693` | fix: guardrail de credito liquido nunca abaixo do valor do bem (FIX-226) |
| `a289ba27` | docs: move fix-226 pra done |
| `e3231178` | feat: adiciona ancora de dinheiro (mes em que o bolso alcanca o lance) com FGTS (FIX-227) |
| `4b94dbfa` | docs: move fix-227 pra done e remove bloco-motor-calculo (todo vazio) |
| `1e8715c5` | docs: corrige frontmatter status/commit dos cards fix-225..227 (staging incompleto do mv anterior) |

## FIX-225 — curva power calibrada

`contemplation-dial.ts`: `p(m) = (m-1)/(term-1)`, `winningBidPct = averageBid/creditValue`
(derivado POR OFERTA — novo campo `averageBid` em R$ absoluto, com fallback pro legado
`historicalWinningBidPct` quando ausente), `L0 = winningBidPct/(1-p(referenceMonth))^1.6`,
`requiredLancePct = clamp(L0*(1-p(targetMonth))^1.6, 0, 0.9)`. Teto sobe de 80%→90% (a
curva nova não precisa mais achatar na região útil). `admSobreEmbutido` novo (custo do
embutido sobre a carta cheia, `undefined` no Trilho A sem `admFeePct`). `likelihood`
removido do tipo e do cálculo. `plan-estimate.ts` ajustado (removeu o campo
`likelihood` que repassava do dial). Modelo AMORTIZA (FIX-221) e blindagem NaN
(BUG-DIAL-NAN) preservados sem alteração.

Testes: calibração exata em `referenceMonth`, convergência a <8% no último mês (sorteio
emerge sozinho), monotonicidade decrescente, teto não bate no clamp na região útil,
`winningBidPct` diferente por carta, `paymentAfterContemplation <= monthlyPayment`,
nenhuma saída expõe `likelihood`/redução de prazo. Números hardcoded obsoletos da fórmula
antiga recalculados (`oferta-real.test.ts`: fallback heurístico sem `referenceMonth` foi
de 74% pra 59%).

## FIX-226 — guardrail de crédito líquido

`recommendation.ts`: `respectsNetCreditGuardrail(creditValue, maxEmbutidoPct, valorDoBem)`
exportada (fração 0-1, igual à implementação de referência). `ScoringInput` ganha campo
opcional `embutidoGuardrail?: { valorDoBem, maxEmbutidoPct }`. Em `rankGroups`, quando
`hasLance && embutidoGuardrail` estão presentes, candidatas `embeddedVariant === "com"`
que violam o invariante são reordenadas pra DEPOIS das que respeitam — critério primário,
antes do score. Candidatas `"sem"` embutido e chamadas sem o guardrail configurado nunca
são afetadas (retrocompat total com `ai-sdk.ts`, que ainda não passa esse campo).

## FIX-227 — âncora de dinheiro + FGTS

`contemplation-dial.ts`: nova função `anchorMonth(base, { initial, monthlySavings, fgts? })`
— varre `m = 1..termMonths`, compara a poupança acumulada contra `max(0, ownCashValue - fgts)`
(o BOLSO, nunca o lance total — o embutido não sai do bolso do cliente). Retorna o primeiro
mês que cobre, ou `null` (orienta sorteio). FGTS (vertical imóvel) abate o bolso necessário
antes da comparação, acelerando o mês alcançado, sem contaminar `requiredLanceValue`/
`embeddedBidValue` (que descrevem só a mecânica carta/embutido do grupo).

## Decisões de design tomadas (fora do que os cards fechavam)

1. **`averageBid` novo + `historicalWinningBidPct` mantido como fallback.** O card só
   pedia o campo novo; como o legado ainda alimenta `ai-sdk.ts`/`chat/types.ts`/
   `contemplation-dial.tsx` (fora de escopo), mantive os dois — `averageBid` tem
   precedência, sem quebrar nenhum consumidor existente.
2. **Teto do lance 80%→90%** conforme a spec — ajustei o único teste que cravava o
   número antigo.
3. **Guardrail fiado via campo opcional `ScoringInput.embutidoGuardrail`** (tipo local a
   `recommendation.ts`, não em `adapters/types.ts`) — a fiação real do `valorDoBem` a
   partir da conversa/Bevi fica pro bloco `bloco-jornada-conversa` (o "sweep 1.3× que já
   existe" em `bevi-self-contract-adapter.ts` já popula as candidatas maiores na mesma
   lista; o guardrail só reordena o que já foi buscado, sem chamada nova).
4. **FGTS abate o BOLSO (`ownCashValue`), não o `initial` do cliente** — interpretação da
   frase da spec "FGTS soma ao initial do lado do embutido": FGTS vai direto ao vendedor
   como o embutido, então reduz o que falta juntar, não o que o cliente já tem guardado.
   Essa leitura garante a propriedade pedida (FGTS é acelerador puro, nunca aumenta o mês).
5. **`admFeePct` novo input opcional** (0-100, mesma escala do resto do código) — só pra
   computar `admSobreEmbutido`; ausente → `undefined` (D11, nunca fabricar).

## Gaps conhecidos (fora do escopo deste bloco, por desenho)

- `src/lib/agent/tools/ai-sdk.ts`, `src/lib/chat/types.ts`,
  `src/components/chat/artifacts/contemplation-dial.tsx`,
  `src/components/chat/artifacts/recommendation-card.tsx` e
  `src/lib/adapters/bevi/offer-mapper.ts` ainda não fiam `averageBid`/`admFeePct`/
  `embutidoGuardrail`/`valorDoBem` nem removeram o consumo de `likelihood` — isso é
  explicitamente trabalho de `bloco-cards-ui` e `bloco-jornada-conversa`, já antecipado
  no `_bloco.md` original ("motor ANTES de cards" na ordem de merge). Até esses blocos
  adaptarem, `contemplation-dial.tsx` lê `r.likelihood` como `undefined` (não quebra,
  só degrada visualmente — nenhum teste renderiza esse componente).
- `anchorMonth` e `admSobreEmbutido` ainda não são chamados por nenhum código de produto
  fora dos testes — a integração na conversa/UI é responsabilidade dos blocos irmãos.
