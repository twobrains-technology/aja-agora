---
id: FIX-378
titulo: "A tela diz por que o próximo toque não saiu"
status: done
commit: 3c3e48e5
executado_em: 2026-09-28
bloco: bloco-regua
arquivos:
  - src/lib/admin/remarketing-tela.ts
  - src/lib/admin/remarketing-queries.ts
  - src/app/api/admin/remarketing/route.ts
  - src/components/admin/remarketing/tabela-remarketing.tsx
rodada: 2026-09-28
---
## Palavras do operador
Reunião de 22/09 — o caso da Irene: *"por que não saiu o próximo toque?"*. Hoje a tela mostra só
`nextTouchAt` (`tabela-remarketing.tsx:132-138`).

## Cenário exato
Os motivos existem no tipo (`regua.ts:239-242`: `aguardando_data`, `teto_30_dias`,
`fora_da_janela_de_horario`, `esgotado`), mas `motivo_saida` (`schema.ts:1220`) só guarda o terminal e
a tela não expõe nenhum deles. O operador vê a data do próximo toque e nunca o motivo de não ter saído.

## Root cause
O motivo é calculado no ciclo e descartado — não viaja no shape da API de remarketing nem é derivado na
tela.

## Correção proposta
| O quê | Onde |
|---|---|
| Derivar o motivo na tela a partir do estado da linha (PRD recomenda calcular, não persistir) | `remarketing-tela.ts` |
| Expor no shape da API | `remarketing-queries.ts`, `app/api/admin/remarketing/route.ts` |
| Mostrar em texto na coluna do próximo toque, com o rótulo humano | `tabela-remarketing.tsx` |

## Regressão exigida
Unitário de `remarketing-tela.ts`: cada um dos quatro motivos vira rótulo legível; sem motivo, a coluna
não inventa texto.
