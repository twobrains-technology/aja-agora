---
id: FIX-379
titulo: "Clicar em \"Toques enviados\" mostra PARA QUEM foi o toque"
status: done
bloco: bloco-toques
arquivos:
  - src/components/admin/remarketing/resumo-da-regua.tsx
  - src/components/admin/remarketing/insights-da-regua.tsx
  - src/app/api/admin/remarketing/route.ts
  - src/components/admin/remarketing/tabela-remarketing.tsx
rodada: 2026-09-28
commit: 2b164605
executado_em: 2026-09-28
---
## Palavras do operador
Reunião de 22/09 (Kairo, 12:12:30): *"a gente teria aqui uma métrica de ó: já foram enviados oito. Para
quem que foi? E como que foi? Foi o primeiro toque, o segundo ou o terceiro? É onde a gente para, né?"*

## Cenário exato
O cartão "Toques enviados" (`resumo-da-regua.tsx:73-79`) e o funil por passo
(`insights-da-regua.tsx:118-153`) não são clicáveis; a API só filtra por `situacao`
(`app/api/admin/remarketing/route.ts:63,83`); a tabela não tem filtro por passo. A resposta "para quem"
não existe em lugar nenhum.

## Root cause
O dado por conversa já vem na resposta (`GET /api/admin/remarketing`), mas não há caminho de navegação
nem filtro por passo — a pergunta não tem porta.

## Correção proposta
| O quê | Onde |
|---|---|
| Cartão e passos do funil viram link para a lista filtrada | `resumo-da-regua.tsx`, `insights-da-regua.tsx` |
| Parâmetro de filtro por passo na API | `app/api/admin/remarketing/route.ts` |
| Coluna/estado "Passo atual" respeita o filtro e mostra data, forma e se respondeu | `tabela-remarketing.tsx:78-89` |

## Regressão exigida
Unitário dos contadores por passo: a soma dos passos bate com "Toques enviados" (padrão que já existe em
`remarketing-tela.test.ts`); e o recorte por passo devolve exatamente N == o número do passo.
