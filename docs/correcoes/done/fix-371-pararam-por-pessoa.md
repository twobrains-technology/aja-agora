---
id: FIX-371
titulo: "pararamAqui / aindaVivas passam a agrupar por pessoa"
status: done
bloco: bloco-pessoa
arquivos:
  - src/lib/admin/performance-queries.ts
commit: 5ab560ab
executado_em: 2026-09-28
rodada: 2026-09-28
---
## Palavras do operador
Kairo, áudio de 23/09 15:38: *"eu vou sintetizar tudo em pessoa"*.

## Cenário exato
Se o degrau passa a contar pessoa (FIX-370) e o "quantos pararam aqui" continua contando CONVERSA, o
somatório do funil deixa de fechar — a soma de `pararamAqui` não é mais o degrau, e o "% que se perdeu"
passa a misturar unidades na mesma linha da tela.

## Root cause
O bloco `paradas` (`performance-queries.ts:170-215`) monta um CTE por CONVERSA
(`conv` → `profundidade` com `etapa` 1..7) e fecha com `count(*) AS pararam … GROUP BY etapa`. A
profundidade é a posição daquela conversa; com várias conversas da mesma pessoa, ela aparece em dois
degraus.

## Correção proposta
| O quê | Onde |
|---|---|
| Agregar a profundidade por PESSOA (máximo degrau alcançado) em vez de por conversa | `performance-queries.ts:170-215` (CTE `profundidade`) |
| `pararam` = pessoas cuja profundidade MÁXIMA é aquele degrau; `vivas` = idem com o critério de viva | idem, `GROUP BY` por chave de pessoa |

## Regressão exigida
Integração: pessoa com duas conversas em degraus diferentes conta em UM degrau (o mais fundo), e
`soma(pararamAqui) + pessoas que avançaram` fecha com o degrau do FIX-370.

## Execução

A CTE `conv` ganhou a chave da pessoa e a `profundidade` virou um `GROUP BY
chave` com `max(...)` do degrau. `viva` virou `bool_or` — basta uma conversa da
pessoa estar viva para ela ser retomável.

O teste de integração semeia a MESMA visitante com duas conversas (uma que
engajou, outra com proposta) e prova que ela conta em UM degrau — o mais fundo —
e que a soma das paradas é o total de pessoas com conversa.
