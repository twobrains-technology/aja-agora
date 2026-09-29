---
id: FIX-384
titulo: "O relatório de limpeza inclui proposta criada em conversa de teste"
status: done
bloco: bloco-percurso9
arquivos:
  - src/lib/admin/limpeza.ts
  - src/lib/admin/limpeza-queries.ts
  - src/lib/exportacao/limpeza.ts
rodada: 2026-09-28
commit: 34681359
executado_em: 2026-09-28
---
## Palavras do operador
Bruna, WhatsApp 23/09 15:09: *"De 01/09 a 21/09 – 5 clientes com proposta criada."* — os 5 são testes
(um telefone, 16/09). É esse dado de teste que polui o relatório da administradora que ela usa para o
CAC.

## Cenário exato (provado no banco de produção, 28/09)
Em 01–21/09 existem 5 propostas, TODAS com `is_simulated = true`, mesmo telefone, todas em 16/09 entre
15:35 e 16:09. O painel exclui corretamente e mostra 0; mas a proposta **continua existindo na
administradora**, e nada no painel aponta para ela. A limpeza (AJA-23 T3) só conhece os motivos
`teste` / `telefone_da_equipe` / `sem_contato` / `mesa_sem_origem`.

## Root cause
`motivoDeLimpeza` (`limpeza.ts:70`) e `listarCandidatosDeLimpeza` (`limpeza-queries.ts:132`) classificam
por sinais de CONVERSA — nunca olham para `bevi_proposals`.

## Correção proposta
| O quê | Onde |
|---|---|
| Novo motivo `proposta_em_teste`, com a contagem de propostas e a data | `limpeza.ts` |
| A consulta cruza `bevi_proposals` × conversa `is_simulated = true` | `limpeza-queries.ts` |
| O CSV de limpeza ganha a coluna de propostas | `exportacao/limpeza.ts` |

## Regressão exigida
Integração com os 5 casos reais (semente): o relatório lista a linha com `proposta_em_teste` e o número
de propostas daquela conversa; uma proposta REAL **nunca** entra no relatório.
