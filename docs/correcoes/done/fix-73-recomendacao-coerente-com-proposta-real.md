---
id: FIX-73
titulo: "Recomendação/simulador exibem a MESMA cota que será contratada (coerção server-side + carregar oferta no fechamento)"
status: done
commit: 799a75a
executado_em: 2026-07-02
bloco: bloco-h-jornada-auto-fidelidade
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/bevi/contract-input.ts
  - src/app/api/chat/route.ts
  - src/lib/adapters/bevi/offer-mapper.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-02 — QA dono-de-produto AUTO web contra prod (ajaagora.com.br)
severidade: alta
---

## Palavras do operador
> "QA dono-de-produto: isso vende? eu assinaria?" — jornada AUTO web em produção.

## Cenário exato
Pedi carro R$ 70 mil / ~R$ 900/mês. Recomendação (ÂNCORA): bem **R$ 70.000 / parcela R$ 892,48** — agente afirmou "99,2% do seu teto de R$ 900". Proposta real contratada (carta + PDF): **crédito R$ 100.000 / parcela R$ 1.438,28** (Grupo 533). Parcela real = ~160% do teto. Bait-and-switch. Evidência textual + PDF no card do inbox `2026-07-02-recomendacao-diverge-da-proposta-real`.

## Root cause INVESTIGADO (provado no código)
Dois defeitos compostos:
1. **`recommendation_card` NÃO é coagido server-side.** `runner.ts:184-251`: `contract_form`/`simulation_result`/`contemplation_dial` passam por coerção (`enrichContractFormPayload`, `coerceSimulationPayload`, `coerceDialPayload`), mas `recommendation_card` cai no `payload = input` cru (linha 208) e é empurrado sem revalidação (linhas 247-250). Não existe `coerceRecommendation` no repo (grep vazio). Logo o card mostra os números que o LLM digita à mão (o R$70k/R$892 fabricado).
2. **O fechamento ignora a oferta da descoberta e re-simula na Bevi.** `route.ts:547-621` cria a proposta via `startContract(buildStartContractInput(...))`. `contract-input.ts:29-54` NÃO carrega o grupo/cota selecionado — reconstrói de `q.creditMax` (`:36 valor = q.creditMax ?? … ?? 50000`) e só propaga `recommendedAdministradora` (`:49`). A Bevi devolve uma cota nova (`route.ts:601`) → R$100k (=creditMax) / R$1.438.

## Decisão de produto (Kairo, 2026-07-02)
**Recomendar a cota real.** A recomendação/simulador devem exibir a MESMA cota contratável (crédito e parcela reais). Havendo lance embutido, explicar o valor líquido pós-lance. O número decisório = número contratado.

## Correção proposta
| O quê | Onde |
|---|---|
| Criar `coerceRecommendationPayload(input, lastRecommendations/meta.recommendedOffer)` — casa por id/administradora e reescreve os números do grupo real ranqueado (espelha `coerceSimulationPayload`) | `src/lib/agent/orchestrator/recommendation-payload.ts` (novo) |
| Chamar a coerção no branch do `recommendation_card` | `runner.ts` (~208/247) |
| Persistir a oferta real selecionada da descoberta (`meta.recommendedOffer`/snapshot) e **reusá-la no fechamento** em vez de re-derivar de `creditMax` | `contract-input.ts` + `route.ts` |
| Garantir que o snapshot da oferta de descoberta carregue crédito/parcela/grupo reais | `offer-mapper.ts` |

## Regressão exigida (3 camadas — CLAUDE.md)
- **Camada 1 (structural):** teste asserta que `recommendation_card` passa por coerção no runner (não é `payload=input`), e que `buildStartContractInput` usa a oferta persistida quando presente.
- **Camada 2 (cassette):** `tests/regression/agent-trajectory.test.ts` — cassette em que o LLM emite `recommendation_card` com números divergentes → após coerção o payload reflete a cota real; e que descoberta→fechamento mantém crédito/parcela.
- **Camada 3 (eval nightly):** cenário AUTO ponta-a-ponta assertando recomendação.credito == proposta.credito.
