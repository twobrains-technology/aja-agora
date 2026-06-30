---
id: FIX-56
titulo: "Recomendação mostra 2 grupos da mesma administradora (rankGroups sem dedup/diversificação por administradora)"
status: todo
bloco: bloco-b-simulador-recomendacao
arquivos:
  - src/lib/agent/recommendation.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-19 — jornada2_revisão.docx (teste manual Bernardo em ajaagora.com.br)
---

# FIX-56 — Dois grupos da mesma administradora na recomendação

## Palavras do operador (docx)
> "Segue aparecendo 2 grupos da mesma Adm"

## Cenário exato
A recomendação (card destacado + tabela de comparação) exibe 2 grupos da MESMA administradora entre as top 3. O esperado é diversificar por administradora para o usuário comparar opções distintas. ("Segue aparecendo" = recorrente, já tinha sido apontado.)

## Root cause investigado (Explore)
- `src/lib/agent/recommendation.ts:99-122` — `rankGroups(groups, input, topN = 3)`:
  ```ts
  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
  ```
  Ordena 100% por score e fatia top N **sem nenhuma dedup por administradora**. Se a mesma administradora tem 2 grupos com score alto, ambos entram.
- Cadeia: `executeRecommendGroups` (ai-sdk.ts:317) → `recommendWithFallback` → `rankGroups` → `present_recommendation_card` (1ª) + `present_comparison_table` (outras 2). Nenhum elo deduplica.

## Correção proposta
| O quê | Onde |
|---|---|
| Em `rankGroups`, diversificar por administradora: ao montar o top N, no máximo 1 grupo por administradora (ou: preferir 1 por administradora e só repetir se faltar opção para preencher N). Manter ordenação por score dentro da regra. | `recommendation.ts:99-122` |
| Garantir fallback: se houver menos administradoras distintas que N, completar com os melhores grupos restantes (não quebrar quando o universo é pequeno). | `recommendation.ts` |

> Decisão de design: "1 por administradora estrito" vs "diversifica mas completa N se faltar". Recomendado: diversifica e completa. Registre em `decisions/`.

## Regressão exigida (3 camadas)
- **Camada 1 (é onde mora):** teste de `rankGroups` em `recommendation.test.ts` — dado um conjunto com 2 grupos da mesma administradora no topo por score, o resultado top 3 tem administradoras distintas (ou no máx 1 repetida só se o universo não permitir). Cobrir o caso "poucas administradoras" (fallback).
- **Camada 2:** cross-ref no `agent-trajectory.test.ts` se a recomendação vazar para artifact; senão Camada 1 basta (lógica pura).
