---
id: FIX-237
titulo: "Acionar embedded_bid e scarcity — cards órfãos (directive que o LLM chama)"
status: todo
bloco: bloco-r2-funil-cards
arquivos: [src/lib/agent/orchestrator/directives.ts, src/lib/agent/orchestrator/index.ts, src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P0 #3)
---

## Gap (veredito Fable §D2.1, gap #3)
`present_embedded_bid` e `present_scarcity` são ÓRFÃOS: existem só em `tools/ai-sdk.ts`
(definição) e `tool-policy.ts` (allowlist). ZERO directive/prompt os aciona → nunca aparecem
em 4 conduções. Só `two_paths` tem directive (`buildLanceSoParcelaDirective`). Os 3 cards
novos do handoff: 0 de 3 aparecem na jornada.

## Correção (modelo: buildSimulatorDialDirective → present_contemplation_dial)
- **embedded_bid**: criar `buildEmbeddedBidDirective` que escreve 1 frase + chama
  `present_embedded_bid`, disparado no gate `lance-embutido` (spec `docs/design/specs/
  2026-07-09-handoff.../docs/02-cards-novos.md`: "antes da agulha"). Regra dura: o card SEMPRE
  diz que o crédito recebido diminui (já hardcoded no componente).
- **scarcity**: criar `buildScarcityDirective` (ou incluir no reveal/pré-proposta) que chama
  `present_scarcity` quando fizer sentido (após a estratégia, antes da proposta). Número placebo
  1-6 estável por hash do groupId (já no coerce). Spec `docs/02`.
- Registrar as tools na fase certa em tool-policy (já estão) e garantir a coerção server-side no runner.

## Regressão (TDD + E2E)
- E2E Fluxo A: `embedded_bid` aparece no gate lance-embutido; `scarcity` antes da proposta.
- teste: o directive instrui o LLM a chamar a tool (não só existe).
