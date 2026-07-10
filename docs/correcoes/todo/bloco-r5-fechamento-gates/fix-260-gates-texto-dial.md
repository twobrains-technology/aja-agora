---
id: FIX-260
titulo: "Gates respondidos por TEXTO não são consumidos (loop de educação); 'Quero ver sim' pula o dial; dial duplicado"
status: todo
bloco: bloco-r5-fechamento-gates
arquivos: [src/lib/web/adapter.ts, src/lib/agent/orchestrator/index.ts]
rodada: 2026-07-10 rodada 5 (Fable r4, regressões)
---
## Gaps (veredito r4, regressões menores)
- gate lance-embutido por TEXTO não consome → loop de educação.
- "Quero ver sim!" (simulator-offer) pula o dial — dial nunca apareceu no Fluxo A.
- dial DUPLICADO num turno (coerção salvou os números 2×).
## Correção
- Gate respondido por texto livre é CONSUMIDO (marca o gate, avança) — não re-emitir a educação.
- simulator-offer=yes por texto → emite o contemplation_dial (não pula).
- dedup do dial no mesmo turno.
## Regressão (TDD)
- responder lance-embutido por texto → avança (não repete educação).
- "quero ver" → dial emitido 1×.
