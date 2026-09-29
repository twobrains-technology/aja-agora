---
id: FIX-374
titulo: "O funil declara quantas conversas de teste ficaram fora"
status: done
bloco: bloco-pessoa
arquivos:
  - src/lib/admin/performance-queries.ts
  - src/lib/admin/performance-types.ts
  - src/components/admin/performance/porta-do-funil.tsx
commit: 86aec53f
executado_em: 2026-09-28
rodada: 2026-09-28
---
## Palavras do operador
Bruna, WhatsApp 23/09 15:03: *"Pelo que estou entendendo, apenas 1 pessoa, nesse período de cima, chegou
na etapa de proposta, certo??"* — e ela contou **5** no relatório da administradora.

## Cenário exato (provado no banco de produção)
Em 01/09–21/09: 5 propostas, **todas** em conversa com `is_simulated = true`, o MESMO telefone (`1196…`),
todas em 16/09 entre 15:35 e 16:09 — mutirão de teste da equipe. O painel mostra 0 e está CERTO; a única
proposta real do período é de 26/08 e terminou perdida. O problema é que o recorte de teste é excluído
em SILÊNCIO: a cliente compara administradora × painel, vê 5 × 0 e conclui que o painel mente.

## Root cause
O funil aplica `is_simulated = false` dentro de `conversaAtribuida` (`sinais-do-funil.ts:129`) e a
cobertura já declara `conversasComOrigem`/`conversasTotal` (`performance-queries.ts`,
`cobertura`), mas não existe nenhuma linha dizendo quantas conversas de TESTE ficaram fora.

## Correção proposta
| O quê | Onde |
|---|---|
| Novo campo na cobertura: `conversasDeTeste` (conversas `is_simulated = true` no período) | `performance-queries.ts` (`computePorta`/cobertura) + `performance-types.ts` |
| Texto na tela: "N conversas marcadas como teste ficaram fora deste funil" + link para a lista em Conversas com `include_simulated=true` | `porta-do-funil.tsx` ou o rodapé do funil |

## Regressão exigida
Unitário do texto (sem teste de browser): com 5 conversas simuladas no período, a tela renderiza
"N conversas marcadas como teste" e o número 5; sem nenhuma, a linha NÃO aparece (nada de "0 conversas
de teste" poluindo a tela).

## Execução

`CoberturaAtribuicao.conversasDeTeste` conta as conversas `is_simulated = true`
do período, **separadas** de `conversasTotal` (que mantém `is_simulated = false`)
— somar as duas faria a porcentagem de atribuição cair por causa de conversa que
não é do negócio.

A linha na `PortaDoFunilCard` só renderiza com `conversasDeTeste > 0` e leva a
`/admin/conversations?include_simulated=true` (o mesmo opt-in literal que a rota
de conversas já aceita). Sem teste no período, a tela não ganha "0 conversas".

Prova: unitário de DOM em `quem-chegou-e-porta.na-tela.test.tsx` (com 5 e com 0)
e integração de `computeCobertura` na janela semeada (1 simulada ⇒
`conversasDeTeste: 1`).
