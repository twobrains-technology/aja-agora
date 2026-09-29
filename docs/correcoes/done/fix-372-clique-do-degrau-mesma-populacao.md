---
id: FIX-372
titulo: "O clique do degrau abre a MESMA população do número clicado"
status: done
bloco: bloco-pessoa
arquivos:
  - src/components/admin/performance/funil-midia-chart.tsx
  - src/lib/admin/percurso-types.ts
commit: 3049a5a7
executado_em: 2026-09-28
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

## Execução

A causa raiz era maior que a descrita no card: não era só "conferir que o passo
usa a fonte única" — o `modo=alcancou` do Percurso lia a POSIÇÃO na escada
(`profundidade >= alvo`), e a barra do funil lê o FATO do degrau. Os dois
coincidem nos degraus da cadeia e divergem na ramificação: quem iniciou a
conversa também mandou a mensagem do anúncio antes, então `profundidade >= 4`
trazia 7 pessoas para uma barra que dizia 1.

`condicaoDoPasso` passou a filtrar `alcancou` pelo fato de cada degrau
(`FATO_DO_PASSO`), o que torna `total == alcancaram` por construção. Os três
primeiros degraus mantêm a leitura da escada (`olhou OR abriu_chat`), porque a
ajuda deles promete "passou por aqui".

Novo arquivo `ponte-funil-percurso.integration.test.ts` percorre a ponte para
todos os degraus e cobre as duas bordas: conversa de WhatsApp sem linha em
`leads` e a pessoa que voltou (duas conversas, uma pessoa).
