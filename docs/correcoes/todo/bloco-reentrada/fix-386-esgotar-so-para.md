---
id: FIX-386
titulo: "Esgotar os toques SÓ para — não vira \"perdido\" e não cria alerta"
status: todo
bloco: bloco-reentrada
arquivos:
  - src/lib/remarketing/motor.ts
  - src/lib/remarketing/regua.ts
rodada: 2026-09-28
---
## Palavras do operador
Kairo, 28/09: *"esgotar os toques qd chegar, so parar mesmo"*.

## Cenário exato
Hoje `ESGOTADO` é gravado (`motor.ts:490`, `regua.ts:394`) sem tocar `leads.stage` — o comportamento já é
o pedido pelo dono. **O que falta é o TESTE que trava isso**, para que ninguém (nem nós, na próxima
onda) faça o esgotamento transitar o lead para `perdido`.

## Root cause
Não é defeito: é uma decisão de produto sem prova. O PRD previa transição automática (AJA-24 T2) e
alerta de revisão humana (T3) — **as duas morreram nesta decisão**.

## Correção proposta
| O quê | Onde |
|---|---|
| Teste que prova: esgotar a sequência ⇒ `remarketing_touches.status = 'ESGOTADO'` **e** `leads.stage` inalterado **e** nenhum `lead_events` de `perdido` | `regua.ts`/`motor.ts` (teste) |
| Comentário no ponto de esgotamento dizendo que é decisão do dono (28/09) — para o próximo a ler não "consertar" | `motor.ts:490` |
| Nada de alerta novo de "aguardando revisão" | — |

## Regressão exigida
O teste acima, e mais: quem respondeu no meio do caminho continua sem esgotar.
