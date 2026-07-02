---
bloco: bloco-h-jornada-auto-fidelidade
branch: fix/jornada-auto-fidelidade
workspace: fix-jornada-auto-fidelidade
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-73, FIX-74, FIX-75]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/bevi/contract-input.ts
  - src/app/api/chat/route.ts
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/turn-analyzer.ts
  - src/components/landing/hero.tsx
  - src/components/landing/copy.test.ts
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "tests/regression/agent-trajectory.test.ts — append-only de cassettes (FIX-73/74). Nível 2 interno ao próprio bloco (mesma sessão, edição sequencial — sem conflito de merge)."
ordem_merge: "Bloco único da onda. Merge limpo na base."
---
# Bloco H — Fidelidade da jornada AUTO web (achados da rodada QA 2026-07-02)

Pacote de 1 dev com os 3 defeitos da rodada de QA dono-de-produto AUTO web contra prod.
Arquivos internamente disjuntos (agent-core × landing) → uma sessão edita em sequência,
sem conflito. Tema comum: **a jornada AUTO entrega o que promete** — número recomendado =
número contratado (FIX-73), prazo confirmado pelo usuário (FIX-74), orçamento digitado
nunca descartado (FIX-75).

## Ordem interna
1. **FIX-73** (produto, maior): coerção server-side do `recommendation_card` + carregar a
   oferta real da descoberta no fechamento. Decisão de produto do Kairo: **recomendar a cota real**.
2. **FIX-74**: guarda determinística — orçamento mensal nunca vira prazo (timeframe volta a disparar).
3. **FIX-75**: chip da landing compõe/preserva o texto digitado (1 linha em `hero.tsx`).

## Regressão
- FIX-73/74 = comportamento de agent → **3 camadas** (structural + cassette em
  `agent-trajectory.test.ts` + eval nightly), conforme CLAUDE.md.
- FIX-75 = componente React não-agêntico → **só Camada 1** (structural em `copy.test.ts`/`hero.test.tsx`).
