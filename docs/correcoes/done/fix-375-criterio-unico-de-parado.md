---
id: FIX-375
titulo: "\"Parado\" tem critério único, no servidor"
status: done
bloco: bloco-pessoa
arquivos:
  - src/lib/admin/performance-queries.ts
  - src/lib/admin/percurso-queries.ts
  - src/lib/admin/sinais-do-funil.ts
commit: 05aba501
executado_em: 2026-09-28
rodada: 2026-09-28
---
## Palavras do operador
Bruna, áudio de 23/09 16:36: *"eu estou em performance… aí eu quero entender essa pessoa, quem é, o que
falou, o que não falou, aí ele vai lá para o percurso do lead, mas teoricamente a gente está falando da
mesma pessoa, né?"*

## Cenário exato
"Viva/parada" só existe no funil de mídia. O Percurso não tem o conceito, e a régua tem o dela
(`parada_ha_mais_de_7_dias`). Três critérios diferentes para a mesma palavra.

## Root cause
`DIAS_PARA_CONSIDERAR_VIVA = 7` é uma **const local não exportada** em
`performance-queries.ts:45`, usada só em `:209`. `percurso-queries.ts` não define "parado" em lugar
nenhum, e o motivo da régua vive em `motivo-de-exclusao.ts`.

## Correção proposta
| O quê | Onde |
|---|---|
| Exportar `DIAS_PARA_CONSIDERAR_VIVA` para a fonte única (`sinais-do-funil.ts`) e consumir dos dois lados | `sinais-do-funil.ts`, `performance-queries.ts`, `percurso-queries.ts` |
| O Percurso usa o MESMO predicado (status `active` + último inbound do cliente na janela) | `percurso-queries.ts` |

## Regressão exigida
Integração de equivalência: a mesma janela produz o MESMO conjunto de "parados" no funil e no Percurso
(comparar os ids, não só a contagem).

## Execução

`DIAS_PARA_CONSIDERAR_VIVA` e o predicado viraram `conversaViva()` em
`sinais-do-funil.ts`; `performance-queries.ts` deixou de ter a const local, e o
Percurso (CTE `conv`) passou a usar o mesmo fragmento, expondo `aindaViva` por
pessoa e `pessoasVivas` no resumo.

A leitura das paradas saiu para `pessoasQuePararam(fromDate, toDate)` — é o que
permite comparar os **ids** das duas telas, e não só a contagem.

**A régua NÃO foi unificada**, de propósito: `JANELA_DE_ENTRADA_MS`
(`motivo-de-exclusao.ts`) responde "posso mandar um toque?", uma decisão de
cadência com dono próprio; `conversaViva` responde "dá para ler esta pessoa como
retomável?". Juntar as duas faria mexer no desenho do painel mudar a régua em
silêncio. O doc de `DIAS_PARA_CONSIDERAR_VIVA` diz isso em voz alta.
