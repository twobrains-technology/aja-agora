---
bloco: bloco-r9-3-reveal-guard
branch: fix/r9-3-reveal-guard
workspace: fix-r9-3-reveal-guard
onda: 1
depends_on: []
paralelo_com: [bloco-r9-3-consistencia-valor, bloco-r9-3-latencia-percebida]
itens: [FIX-286]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
---
# Bloco r9-3 — reveal-guard (P0, FIX-286)

Item único (P0, MÍNIMO da rubrica no veredito r9pos2 — Funcional 4/10). O guard de
tool-error/cap (FIX-262, família de contenção da rodada 6) foi desenhado e testado só pro
cenário de REPETIÇÃO pós-reveal ("já apareceram, continua valendo") — nunca pro caso em que a
falha acontece NO MEIO da primeira apresentação, quando `search_groups`/`recommend_groups` já
tinham retornado dados reais no mesmo turno. Este bloco não toca nada de `bloco-r9-3-
consistencia-valor` nem `bloco-r9-3-latencia-percebida` — arquivos totalmente disjuntos
(orchestrator/ vs tools/ai-sdk.ts vs components/chat/) — nível 1, paralelo limpo.

Cuidado ao implementar: NÃO regredir os testes existentes da família FIX-262/266/282
(`runner.fix-262-tool-error-cap.integration.test.ts`,
`index.fix-266-recuperacao-resolve.integration.test.ts`,
`index.fix-282-honestidade-toolerror.integration.test.ts`) — o cenário de repetição pós-reveal
continua precisando do fallback "já apareceram" (esse é o uso CORRETO). O fix é aditivo: um novo
branch ANTES do fallback genérico, condicionado a `!meta.revealCompleted`.
