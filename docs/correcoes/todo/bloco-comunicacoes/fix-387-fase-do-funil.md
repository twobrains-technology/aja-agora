---
id: FIX-387
titulo: "A fase do funil é um fato do servidor (função pura)"
status: todo
bloco: bloco-comunicacoes
arquivos:
  - src/lib/admin/sinais-do-funil.ts
  - src/lib/remarketing/motor.ts
rodada: 2026-09-28
---
## Palavras do operador
Kairo, 22/09 12:02:49: *"Vamos pensar em três mensagens genéricas ali pra macro fases do funil… se o
cara tá no início ainda… ele chegou até visualizar a oferta… Já tá no finalzinho, é só fechar?"*

## Cenário exato
A régua hoje decide a chave do template só pelo BEM (`remarketing_oportunidade_<objetivo>`,
`motor.ts:160`). Não existe a noção de FASE: quem parou no início e quem só falta fechar recebem a mesma
mensagem.

## Root cause
`teve_proposta` **não existe** em `sinais-do-funil.ts` — está inline em três arquivos
(`percurso-queries.ts:139`, `performance-queries.ts:188`, `exportacao/percurso.ts:137,144`). Sem fonte
única para os sinais, não há fase.

## Correção proposta
| O quê | Onde |
|---|---|
| Extrair `teve_proposta` como fragmento único (não criar a quarta definição) | `sinais-do-funil.ts` |
| `faseDoFunil(sinais): "inicio" \| "viu_oferta" \| "fechamento"`, função PURA, com os sinais da fonte única | `sinais-do-funil.ts` |
| Consumir nos três lugares que hoje repetem o predicado | `percurso-queries.ts`, `performance-queries.ts`, `exportacao/percurso.ts` |

## Regressão exigida
Teste puro de `faseDoFunil` nos três estados + teste de que os três consumidores passaram a usar o mesmo
fragmento (mudar o fragmento muda os três).
