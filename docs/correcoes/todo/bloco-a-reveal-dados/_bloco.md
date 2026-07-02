---
bloco: bloco-a-reveal-dados
branch: feat/reveal-dados-honestos
workspace: feat-reveal-dados-honestos
onda: 1
depends_on: []
paralelo_com: [bloco-b-reveal-ui]
itens: [FIX-191, FIX-192, FIX-193, FIX-194, FIX-195]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/recommendation.ts
  - src/lib/agent/orchestrator/other-options.ts
  - src/lib/adapters/bevi/offer-mapper.ts
  - tests/regression/agent-trajectory.test.ts
nivel_relacao: "3 (contrato) com bloco-b-reveal-ui"
conflitos_esperados: []
---
# Bloco A — Reveal: dados honestos (backend / coerção / ranking)

Backend do refino da tela de recomendação (spec `docs/design/specs/2026-07-01-refino-tela-recomendacao-design.md`
+ adendo B8). Coage TUDO server-side (Leis 3/4/5): a LLM deixa de poder digitar número no hero; o
`recommendation_card` passa a ser reescrito contra o `GroupSummary` real, igual já é o
`simulation_result`/`contemplation_dial`. Também trata a raiz do P0: um **handler server-side de
`choose_offer`** que avança ao contrato com o `groupId` já resolvido, sem re-busca nem meta-narrativa.

**Contrato com bloco-b (nível 3):** este bloco FORNECE o payload coagido (com `groupId`) e o handler
de `choose_offer`; bloco-b CONSOME (emite a ação + renderiza). Shape exato no `_prompt.md` (seção
CONTRATO) e no adendo B8. Ordem de merge: **bloco-a ANTES de bloco-b**.

Os itens são fortemente acoplados (mesma cadeia runner→tools→directives→mapper) → um pacote só,
ordem interna = a de `itens:`. FIX-191 e FIX-195 são comportamento de agent → exigem cassette.
