---
id: FIX-391
titulo: "Custo de IA pela fonte atual (Langfuse), cruzado por conversationId"
status: done
commit: a3faddf5
executado_em: 2026-09-29
bloco: bloco-custo
arquivos:
  - src/lib/admin/custo-de-ia.ts
rodada: 2026-09-28
---
## Palavras do operador
Bruna, 22/09 12:17:26: *"E uma coisa só que uma hora que der, você checar e ver o custo de IA e das
mensagens de remarketing, tá? Porque eu tô tentando levantar todos os custos para a gente calcular o CPC
depois quando precisar de jeito."*

## Cenário exato
Não existe custo de LLM no painel: nenhuma tabela de preço, nenhuma conversão token→dinheiro. O turno
emite só cache (`cacheRead`/`cacheWrite`); tokens completos só na avaliação.

## Root cause
A capacidade não existe. **E a decisão de como construir já está tomada**: rota B — a fonte é o Langfuse.

## Correção proposta
| O quê | Onde |
|---|---|
| Função pura `custoDeIA({ periodo, canal })` que **lê a fonte atual** (Langfuse) e soma por modelo/dia | `custo-de-ia.ts` |
| Cruzamento com o Postgres por `sessionId` do Langfuse = `conversationId` | idem |
| Modelo desconhecido ou período sem dado ⇒ `null` ("não calculável"), **nunca zero** | idem |
| 🚫 NÃO criar `usos_de_ia`, `precos-dos-modelos.ts` nem gravação de tokens no banco | — |

## Regressão exigida
Teste puro com fixture dos dois lados: período com dado ⇒ soma dos modelos; período sem dado ⇒ `null`;
modelo desconhecido ⇒ `null`. Nenhum teste chama o Langfuse de verdade.
