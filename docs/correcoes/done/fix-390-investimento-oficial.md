---
id: FIX-390
titulo: "\"Investimento reportado pela Meta\" é o oficial; o atribuído vira a linha vizinha"
status: done
bloco: bloco-investimento
arquivos:
  - src/components/admin/campanhas/resumo-campanhas.tsx
  - src/components/admin/campanhas/tabela-campanhas.tsx
  - src/lib/admin/campanhas-queries.ts
rodada: 2026-09-28
executado_em: 2026-09-29
---
## Palavras do operador
Reunião de 22/09 — Gustavo, 11:44:04: *"Não, não, está muito alto."* (sobre o investimento que o painel
mostrava) e 11:47:10: *"dos últimos sete dias aí… A gente tem um valor bem maior, ó."* O dono decidiu em
28/09: **"reportado pela meta"**.

## Cenário exato
A tela diz só "Investimento no período", com a nota "Soma do que o gerenciador reportou"
(`resumo-campanhas.tsx:53`). Não existe a segunda leitura (o atribuído no CRM), nem a diferença em reais,
nem o motivo. `explicarDiferenca` (`:44-52`) só cobre a diferença de LEADS.

## Root cause
O total soma uma fonte só e não declara qual é. Sem as duas leituras lado a lado, a cliente compara com o
gerenciador, vê outro número e conclui que o painel está errado.

## Correção proposta
| O quê | Onde |
|---|---|
| "Investimento reportado pela Meta" como a leitura OFICIAL (em destaque) | `resumo-campanhas.tsx:53` |
| "Investimento atribuído no CRM" como linha vizinha, com a diferença em reais | idem |
| Motivo da diferença: campanha sem atribuição × janela de data — reusando a linguagem de `explicarDiferenca` | `resumo-campanhas.tsx:44-52` |
| Nenhuma campanha entra duas vezes na soma (o teste do `entity_id` já existe — não regrida) | `campanhas-queries.ts` |

## Regressão exigida
Unitário: os dois rótulos aparecem, a diferença é a subtração exata das duas leituras, e o total exibido
continua sendo o reportado pela Meta. **Zero qualificado continua dizendo "sem base" E o motivo** (nunca
"R$ 0,00").
