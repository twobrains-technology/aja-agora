---
id: FIX-382
titulo: "A lista de parados traz autor da última interação e ordena pelo mais parado"
status: todo
bloco: bloco-percurso9
arquivos:
  - src/lib/admin/percurso-types.ts
  - src/lib/admin/percurso-queries.ts
rodada: 2026-09-28
---
## Palavras do operador
Bruna, reunião de 22/09 (12:10:09): *"Eu preciso saber quem são esses nove, porque se for o caso, eu
tenho que ligar… porque eles continuam parados desde a semana passada."* E em 25/09, no WhatsApp:
*"temos o contato do cliente, certo? digo aquele telefone, eu poderia ligar para ele, certo?"*

## Cenário exato
A tela de Percurso tem `modo=parou`, mas o shape não entrega o que ela precisa para LIGAR: falta o
**autor** da última interação (foi o cliente ou foi o agente?), faltam `naRegua` / `motivoForaDaRegua`
no shape plano e falta `pediuSimulacao`. E a ordem é `ultima_atividade DESC`
(`percurso-queries.ts:344`) — o contrário do que a pergunta dela pede (quem está parado há MAIS tempo).

## Root cause
`PessoaDoPercurso` (`percurso-types.ts:151-197`) não tem esses campos; a régua até aparece na resposta
da rota (`app/api/admin/percurso/route.ts:45-66,92-105`), mas não no item da lista; a ordenação é por
última atividade decrescente.

## Correção proposta
| O quê | Onde |
|---|---|
| Campos: `ultimaInteracaoAutor: "cliente" \| "agente" \| null`, `naRegua: boolean`, `motivoForaDaRegua: MotivoDeExclusao \| null`, `pediuSimulacao: boolean` | `percurso-types.ts` |
| Preencher na query do percurso | `percurso-queries.ts` |
| Ordenação default no `modo=parou`: **parado há mais tempo primeiro** | `percurso-queries.ts:344` |

## Regressão exigida
Integração: pessoa na régua sai com `naRegua = true`; fora dela, sai com o motivo NOMEADO (nunca nulo em
silêncio); a lista em `modo=parou` vem ordenada do mais antigo para o mais recente.
