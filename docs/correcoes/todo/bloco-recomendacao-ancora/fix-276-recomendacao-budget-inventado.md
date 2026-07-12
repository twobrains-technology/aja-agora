---
id: FIX-276
titulo: "Recomendação favorece carta MAIS CARA que o valor pedido (budget mensal inventado)"
status: todo
bloco: bloco-recomendacao-ancora
severidade: alta
arquivos:
  - src/lib/agent/recommendation.ts
  - src/lib/agent/tools/ai-sdk.ts
rodada: 2026-07-11 — QA do dono da conversa de consórcio (jornada completa, coletor Haiku + juiz)
---

## Palavras do operador
> "recomendação budget-inventado — é o achado mais sério dos três, risco CDC (recomendar carta
> mais cara que o cliente pediu corrói confiança e pega mal regulatoriamente). Trata como
> prioridade... card com a raiz que você já confirmou (recommend_groups exige orçamento que o LLM
> inventa + monthlyFitScore com peso 0.4 premiando parcela alta), TDD, PR normal."

## Cenário exato
- **Rota/tela:** chat web (`http://aja-develop.orb.local`), reveal da recomendação.
- **Passos:** categoria Carro → desiredItem "creta 2023" → **valor do bem R$ 120.000** → busca real Bevi → reveal.
- **Dados:** CONTA1 homologação; validado ao vivo (conversa `f6c5aec0`, ledger `.processo/qa/2026-07-11-conversa-consorcio-ledger.md`).

## Esperado × Atual
- **Esperado:** a recomendada honra o pedido — a carta mais próxima de R$ 120.000 (havia BB R$ 120.000 exato, parcela R$ 2.161,68).
- **Atual:** recomendou **ITAÚ R$ 150.000** (25% acima do pedido), parcela **R$ 3.549,75** (64% maior). Cliente pede 120k e recebe recomendação de carta maior/mais cara.

## Root cause (INVESTIGADO — confirmado no código)
1. `recommend_groups` exige `budget` = "Orçamento mensal do usuário em reais" (`src/lib/agent/tools/ai-sdk.ts:295`), mas o usuário **nunca informa** orçamento mensal (só o valor do bem) → o **LLM inventa** o budget. Achado conhecido (rodada 2026-07-01, "selo Orçamento 100% contra orçamento nunca informado", risco CDC — [[project_aja_tela_recomendacao_dados_reais]]).
2. `monthlyFitScore` (`src/lib/agent/recommendation.ts:20-33`) tem o **maior peso (0.4)** e premia parcela em 70-100% do budget (ratio 0.7 → 0.82; ratio 0.3 → 0.02). Budget inventado alto ⇒ a carta de **parcela maior** vence em monthlyFit ⇒ recomendação acima do valor pedido.

Núcleo: a recomendação é ancorada num **budget mensal fabricado**, não no **valor do bem pedido**.

## Correção proposta (o quê × onde — o executor decide a abordagem via brainstorming)
| O quê | Onde |
|---|---|
| Ancorar a recomendação no **valor do bem pedido** (`creditMax`), não no budget inventado | `src/lib/agent/recommendation.ts` (scoring) |
| **RECOMENDADO:** fator de **proximidade de carta** no score — penaliza `|creditValue − creditMax| / creditMax`; carta ≈ pedido vence | `recommendation.ts` (novo fator + peso; rebalancear WEIGHTS) |
| Alternativa: **derivar** o budget server-side do valor do bem (backstop determinístico, padrão FIX-115/208) em vez de aceitar o inventado | `ai-sdk.ts` (coerção do input) |
| Alternativa mais invasiva: coletar orçamento mensal do usuário (novo slot) | fora deste bloco |

## Regressão exigida (3 camadas — CLAUDE.md do projeto)
- **Camada 1 (structural):** dado pedido `creditMax=120000` e dois grupos reais [A: creditValue 120000, parcela menor · B: creditValue 150000, parcela maior], `rankGroups`/`recommend` retorna A (a próxima do pedido) — nunca B acima do pedido sem justificativa. Cobrir também 80k/250k.
- **Camada 2 (cassette):** trajetória do reveal (MockLanguageModelV2) provando que a recomendada não fica acima do valor pedido.
- Registrar a decisão de design (ADR em `docs/decisoes/blocos/`).
