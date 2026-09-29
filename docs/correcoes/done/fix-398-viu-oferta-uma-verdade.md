---
id: FIX-398
titulo: "`viu oferta` tem UMA verdade — hoje o painel e o agente discordam"
status: done
bloco: bloco-telefone-ab
arquivos:
  - src/lib/admin/sinais-do-funil.ts
rodada: 2026-09-29
commit: 2c3d88e0
executado_em: 2026-09-29
---
## Palavras do operador
Bruna, 12:19 (lendo o funil dela): *"viram oferta, 9 → 18... e a proposta criada: zero"*. Ela está
medindo exatamente este degrau — e é o degrau que o teste de quinta vai mover.

## Cenário exato (medido no código, 29/09)
O painel conta "viu oferta" por `ARTIFACTS_DE_OFERTA = ["real_offer", "simulation_result"]`
(`src/lib/admin/sinais-do-funil.ts:338`), usado em `performance-queries.ts:152,277` e
`percurso-queries.ts:188`. Mas quem **escreve** artifacts grava outros tipos também:
- `comparison_table` — `src/app/api/chat/route.ts:901`;
- `recommendation_card` — `src/lib/agent/langgraph/nodes/converse.ts:484`;
- `real_offer` — `src/lib/bevi/closing-presentation.ts:110`.

Os quatro tipos existem em `src/lib/chat/types.ts:456-468`.

**Consequência:** quem viu a comparação no chat web (`comparison_table`) **não** é contado como quem
viu oferta. O degrau que a cliente usa para decidir investimento está subcontado.

## Root cause
Duas listas para a mesma pergunta: uma no painel, outra na escrita dos artifacts.

## Correção proposta
| O quê | Onde |
|---|---|
| Uma fonte única para "o que prova que a pessoa viu número de oferta", cobrindo os quatro tipos — a lista passa a ser a verdade do painel **e** o contrato dos escritores | `sinais-do-funil.ts` |
| Teste que **amarra as duas pontas**: para cada tipo escrito no código, a lista do painel o reconhece (se um tipo novo nascer, o teste aponta) | teste de unidade |
| O número do painel pode CAIR antes de subir: documentar no ADR do bloco que a mudança altera o histórico | `docs/decisoes/blocos/` |

## Regressão exigida
Teste que falha se existir tipo de artifact de oferta em `src/lib/chat/types.ts` fora da lista do
painel. E o teste do degrau provando que `comparison_table` conta como "viu oferta".
