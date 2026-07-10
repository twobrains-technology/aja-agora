---
id: FIX-227
titulo: "Âncora de dinheiro na agulha — mês em que o bolso alcança o lance (+ FGTS imóvel)"
status: done
bloco: bloco-motor-calculo
arquivos:
  - src/lib/consorcio/contemplation-dial.ts
  - src/lib/consorcio/contemplation-dial.test.ts
rodada: 2026-07-09 handoff agente-vendas-consorcio (PR8)
commit: e323117
executado_em: "2026-07-09"
---

## Palavras do operador (handoff)
> "A agulha responde 'quando o seu DINHEIRO alcança o lance', não 'quando você quer'.
> A comparação é contra o BOLSO, não contra o lance total — o embutido não sai do bolso
> do cliente. Cálculo único, duas apresentações (web/WhatsApp)." — `docs/03`

## Cenário exato
Cliente sem reserva mas junta R$ 4.000/mês. O agente deve dizer: "juntando R$ 4.000/mês,
lá pelo mês 10 seu dinheiro alcança o lance". Hoje a agulha só sabe "mês desejado", não
"mês em que o dinheiro chega". Vertical imóvel: FGTS entra como lance embutido (vai
direto ao vendedor) e é o maior acelerador — hoje não é considerado.

## Root cause INVESTIGADO
`computeContemplationDial` recebe `targetMonth` (o que o usuário quer) mas não há função
que resolva "primeiro mês em que `saldoInicial + monthlySavings*(m-1) >= ownCashValue(m)`".
`plan-estimate.ts` e o dial não têm essa varredura. FGTS não é entrada em lugar nenhum.

## Correção proposta
| O quê | Onde |
|---|---|
| Função pura `anchorMonth(input, { initial, monthlySavings })` que varre `m=1..termMonths` e retorna o 1º mês onde o dinheiro cobre o **`ownCashValue`** (bolso, NÃO o lance total); `null` se não alcança → orientar sorteio | `contemplation-dial.ts` (ver `03c-implementacao-referencia.ts`) |
| FGTS (vertical imóvel) conta como fonte de lance embutido (soma ao `initial` do lado do embutido, vai ao vendedor) | entrada da âncora |
| Mesma função serve web (visual) e WhatsApp (narração) — nunca duplicar a fórmula | `contemplation-dial.ts` |

## Regressão exigida (TDD strict)
- `anchorMonth` compara contra `ownCashValue`, não `requiredLanceValue` (embutido não sai do bolso).
- `initial` cobre o bolso no mês 1 → retorna 1.
- `monthlySavings=0` e `initial < ownCash` em todo mês → retorna `null`.
- imóvel com FGTS → o mês alcançado é MENOR que sem FGTS (FGTS acelera).
- monotonicidade: mais poupança/mês → mês alcançado nunca aumenta.
