---
id: FIX-373
titulo: "Proposta conta uma linha por PESSOA, por mais propostas que ela tenha"
status: done
bloco: bloco-pessoa
arquivos:
  - src/lib/admin/sinais-do-funil.ts
  - src/lib/exportacao/percurso.ts
commit: 05ced797
executado_em: 2026-09-28
rodada: 2026-09-28
---
## Palavras do operador
Bruna, áudio de 23/09 16:36: *"se uma pessoa fez cinco simulações, é uma pessoa só… é uma pessoa, né?"*
O rótulo do Percurso já promete isso: *"uma linha por pessoa, por mais propostas que ela tenha"*
(`percurso-types.ts`).

## Cenário exato
Em 01–21/09 há 5 propostas no banco, todAS do mesmo telefone (16/09, 15:35–16:09) — e o funil conta
`count(DISTINCT bp.id)`. Quem tem duas propostas conta duas vezes no degrau, enquanto o rótulo do
Percurso promete o contrário.

## Root cause
`contagensDoFunil()` (`sinais-do-funil.ts:268`) tem `count(DISTINCT bp.id) AS propostas` — linhas de
proposta, não pessoas. O mesmo predicado está replicado em `computeFunilMidia`
(`performance-queries.ts`) e no `percurso-queries`/`exportacao/percurso.ts:137`.

## Correção proposta
| O quê | Onde |
|---|---|
| `propostas` passa a contar a CHAVE DE PESSOA que tem ao menos uma proposta | `sinais-do-funil.ts:268` |
| Mesma troca no funil de mídia e na exportação | `performance-queries.ts`, `exportacao/percurso.ts` |

## Regressão exigida
Integração: pessoa com 5 propostas ⇒ **1**; duas pessoas com 1 proposta cada ⇒ **2**. E o número da tela
de Performance == o da escada do Percurso, na mesma janela.

## Execução

`contagensDoFunil` ganhou `de`/`ate` e passou a contar
`count(DISTINCT chaveDaPessoa(de, ate))` em conversas, identificados, com_contato,
qualificados, propostas e fechados. O `FILTER` de "abriu conversa"
(`c.id IS NOT NULL`) impede que o visitante sem chat entre em "Conversas" por ter
chave própria.

A exportação (`exportacao/percurso.ts`) trocou a cópia local da chave por
`chaveDaPessoa(de, ate, vi.visitor_id)` — em `exportarPercurso` e em
`contarPercurso`. A definição de pessoa agora existe em UM lugar só.

O funil de mídia (`computeFunilMidia`) já contava pessoa desde o FIX-370.
