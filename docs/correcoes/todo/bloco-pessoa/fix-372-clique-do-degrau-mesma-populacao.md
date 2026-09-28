---
id: FIX-372
titulo: "O clique do degrau abre a MESMA população do número clicado"
status: todo
bloco: bloco-pessoa
arquivos:
  - src/components/admin/performance/funil-midia-chart.tsx
  - src/lib/admin/percurso-types.ts
rodada: 2026-09-28
---
## Palavras do operador
Kairo, áudio de 23/09 15:38: *"entro em performance… ele me mostra cinco conversas. E aí quando eu
clico no filtro, ele me leva como um contato… as duas telas estão falando coisas diferentes."*

## Cenário exato
O funil mostra 10 em "Se identificaram"; o clique abre `/admin/percurso?passo=se_identificou&modo=alcancou`,
que responde por **8 pessoas**. O número lido e a lista aberta não são a mesma população.

## Root cause
A ponte existe e leva degrau + período + modo (`funil-midia-chart.leva-ao-percurso.test.tsx`), mas o
número de origem era contado em CONVERSA (`modo=alcancou` sobre conversas) e o destino é PESSOA. Com o
FIX-370 as duas pontas passam a contar pessoa; falta garantir que o modo `alcancou` do Percurso use a
MESMA chave e a MESMA janela, inclusive no caso de conversa de WhatsApp sem linha em `leads`.

## Correção proposta
| O quê | Onde |
|---|---|
| Conferir que `passo` do Percurso usa a mesma definição de degrau do funil (fonte única em `sinais-do-funil.ts`) | `percurso-types.ts`, `percurso-queries.ts` |
| Teste que percorre a ponte: o número do degrau == o total da lista que o clique abre | `funil-midia-chart.leva-ao-percurso.test.tsx` (estender) |

## Regressão exigida
Integração: para a mesma janela e o mesmo degrau, `funil.count == percurso.total` e
`== percurso.alcancaram` — os três números que a cliente compara.
