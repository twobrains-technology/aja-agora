---
id: FIX-225
titulo: "Substituir a curva do lance necessário (hiperbólica → power calibrada)"
status: todo
bloco: bloco-motor-calculo
arquivos:
  - src/lib/consorcio/contemplation-dial.ts
  - src/lib/consorcio/contemplation-dial.test.ts
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR0/D0)
---

## Palavras do operador (handoff)
> "A curva de lance atual em `contemplation-dial.ts:89-96` está ERRADA e DEVE ser
> substituída (PR0). A fórmula canônica está em `docs/03-regras-calculo.md`. O modelo
> AMORTIZA (`:116-122`) está certo e permanece." — `PROMPT-CLAUDE-CODE.md`

## Cenário exato
Rodando com dado real da Bevi (Rodobens, carta R$ 171.000, `averageBid` R$ 89.946 →
52,6%, `referenceMonth` 20): a curva atual devolve **90% (clamp)** nos meses 1–6 (a
agulha fica morta onde o cliente arrasta) e ainda **11%** no último mês do prazo (o
modo `sorteio` `<8%` nunca dispara sozinho).

## Root cause INVESTIGADO (provado no código)
`contemplation-dial.ts:92-96`:
```
const raw = winningBid * (anchorMonth / targetMonth);          // hiperbólica
const lateTaper = clamp((term - targetMonth) / (term - anchorMonth), 0, 1);
const requiredLancePct = clamp(Math.round(raw * lateTaper), 0, MAX_BID_PCT); // MAX_BID_PCT=80
```
A hiperbólica `1/targetMonth` explode nos primeiros meses (bate no clamp 80) e o
taper linear não zera no fim (deixa resíduo ~11%). Confirmado: `likelihood`
(`:125-126`) é heurística de 3 faixas derivada do tamanho do lance, sem fonte —
remover. `referenceMonth` já existe (`:38`, FIX-C1) e é alimentado por
`probContemplacaoMeses` (offer-mapper.ts:194) — reusar como ponto de calibração.

## Correção proposta
| O quê | Onde |
|---|---|
| Trocar a curva pela power calibrada: `p(m)=(m-1)/(term-1)`; `winningBidPct=averageBid/creditValue`; `L0=winningBidPct/(1-p(referenceMonth))^K` (K=1.6); `requiredLancePct=clamp(L0*(1-p(targetMonth))^K, 0, 0.9)` | `contemplation-dial.ts` (substitui `:92-96`) |
| `winningBidPct` derivado POR OFERTA (`averageBid/creditValue`) — nunca % fixo, nunca reusar lance de uma carta em outra | novo campo de entrada `averageBid` (hoje entra como `historicalWinningBidPct`) |
| MANTER faixa `<8% → sorteio` e o modelo AMORTIZA (`:116-122`) — só a curva muda | `contemplation-dial.ts` |
| REMOVER `likelihood` do output e do tipo `ContemplationDialResult` | `contemplation-dial.ts:25,60,125-126,139` |
| Adicionar `admSobreEmbutido?` (embutido × adminFee; `undefined` se adminFee ausente) | output |

Preservar a blindagem NaN (`:70`, BUG-DIAL-NAN) e `contemplationDialMarks`/`paymentAfterLabel`.

## Regressão exigida (TDD strict — teste falha antes do fix)
Suíte de `docs/03-regras-calculo.md` "Testes que devem acompanhar a troca":
- `curve(referenceMonth) === winningBidPct` (±0.5%)
- `curve(termMonths) < 0.08` (sorteio emerge sozinho)
- `curve(m)` monotônica decrescente em `[1, termMonths]`
- `curve(1) < 0.9` (não bate no clamp na região útil)
- cartas diferentes → `winningBidPct` diferentes (derivado por oferta)
- `receivedCredit === creditValue - embeddedBidValue`
- `paymentAfterContemplation <= monthlyPayment`
- nenhuma saída expõe redução de prazo nem `likelihood`
Ajustar os testes existentes (`contemplation-dial.test.ts`, `.oferta-real.test.ts`) que
assertam sobre `likelihood` ou a curva antiga.
