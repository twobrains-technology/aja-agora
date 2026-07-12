---
slug: recomendacao-budget-inventado
titulo: "Recomendação favorece carta MAIS CARA que o valor pedido (budget mensal inventado pelo LLM)"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-11 — QA do dono da conversa de consórcio (jornada completa, coletor Haiku + juiz)
evidencia:
  - .processo/qa/2026-07-11-conversa-consorcio-ledger.md
mexe_em:
  - src/lib/agent/recommendation.ts
  - src/lib/agent/tools/ai-sdk.ts
---

## Palavras do operador
> "recomendação budget-inventado — é o achado mais sério dos três, risco CDC (recomendar carta
> mais cara que o cliente pediu corrói confiança e pega mal regulatoriamente). Trata como
> prioridade... card com a raiz que você já confirmou (recommend_groups exige orçamento que o LLM
> inventa + monthlyFitScore com peso 0.4 premiando parcela alta), TDD, PR normal."

## Cenário
- **Rota/tela:** chat web (`http://aja-develop.orb.local`), passo de recomendação (reveal).
- **Passos:** 1) categoria Carro; 2) desiredItem "creta 2023"; 3) valor do bem **R$ 120.000**;
  4) busca real Bevi → reveal.
- **Dados usados:** CONTA1 (homologação), carta pedida 120k auto.

## Esperado × Atual
- **Esperado:** a recomendada deve honrar o que o cliente pediu — a carta mais próxima de
  **R$ 120.000** (o BB tinha R$ 120.000 exato, parcela R$ 2.161,68).
- **Atual:** recomendou **ITAÚ R$ 150.000** (25% ACIMA do pedido), parcela **R$ 3.549,75** (64%
  maior que o BB). O cliente pede 120k e recebe recomendação de carta maior e mais cara.

## Raiz (CONFIRMADA no código — não é só pista)
1. A tool `recommend_groups` exige o campo **`budget` = "Orçamento mensal do usuário em reais"**
   (`src/lib/agent/tools/ai-sdk.ts:295`), mas o usuário **nunca informa** orçamento mensal na
   jornada (só o valor do bem). O **LLM inventa** o budget (achado conhecido — rodada 2026-07-01,
   "selo Orçamento 100% contra orçamento nunca informado", risco CDC).
2. `monthlyFitScore` (`src/lib/agent/recommendation.ts:20-33`) tem o **maior peso (0.4)** e premia
   parcela em **70-100% do budget** (ratio 0.7 → score 0.82; ratio 0.3 → score 0.02). Com um budget
   inventado alto (≈ a parcela de uma carta grande), a carta de **parcela maior** ganha em
   monthlyFit → puxa a recomendação pra cima do valor pedido.

Ou seja: a recomendação é ancorada num **budget mensal fabricado**, não no **valor do bem que o
cliente pediu**.

## Direção de correção (pra o bloco decidir com TDD)
Ancorar a recomendação no **valor do bem pedido** (`creditMax`), não no budget mensal inventado.
Opções (o bloco avalia/brainstorm):
- (a) **Derivar** o budget do valor do bem pedido (backstop determinístico server-side), em vez de
  aceitar o valor que o LLM inventa;
- (b) **Penalizar** no score cartas cujo `creditValue` se afasta do `creditMax` pedido (fator de
  proximidade de carta);
- (c) coletar o orçamento mensal do usuário de verdade (novo slot) — mais invasivo.
Regressão: teste que, pedido 120k com um grupo 120k exato e um 150k mais caro na lista, a
recomendada seja a de 120k (ou não fique acima do pedido sem justificativa).
