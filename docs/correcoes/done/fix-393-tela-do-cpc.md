---
id: FIX-393
titulo: "A tela do CPC, com a fonte de cada número"
status: done
commit: 217980f4
executado_em: 2026-09-29
bloco: bloco-custo
arquivos:
  - src/lib/admin/performance-queries.ts
  - src/app/api/admin/
  - src/components/admin/performance/
rodada: 2026-09-28
---
## Palavras do operador
Bruna, 22/09 12:17:26: *"levantar todos os custos para a gente calcular o CPC depois"*.

## Cenário exato
Não existe nenhum bloco de custo na tela. O único custo hoje é
`investimentoCents`/`custoPorQualificado` em Campanhas.

## Root cause
A tela não tem onde mostrar; o shape não carrega os custos.

## Correção proposta
| O quê | Onde |
|---|---|
| Bloco com: investimento Meta (o oficial), custo de IA, custo de mensagem, leads/conversas/qualificados e o **CPC resultante** | componente de Performance |
| **Cada número com a fonte declarada** (de onde veio) | idem |
| Aviso explícito quando o preço não está cadastrado — "sem preço cadastrado" ≠ zero | idem |
| Shape + rota da API | `performance-queries.ts` + rota |

## Regressão exigida
Unitário do componente: com os três custos presentes, o CPC é a soma dividida pelos qualificados; com
preço de mensagem ausente, o CPC sai como **"não calculável"** com o motivo, e não como número.
