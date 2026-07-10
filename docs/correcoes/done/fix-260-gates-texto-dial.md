---
id: FIX-260
titulo: "Gates respondidos por TEXTO não são consumidos (loop de educação); 'Quero ver sim' pula o dial; dial duplicado"
status: done
bloco: bloco-r5-fechamento-gates
arquivos: [src/lib/agent/orchestrator/index.ts, src/lib/agent/orchestrator/artifact-guard.ts, src/lib/agent/personas.ts]
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

## Implementado (2026-07-10, rodada 5)
- `orchestrator/index.ts` (`runTurn`): snapshot `activeGateAtTurnStart` (mesmo padrão do
  FIX-236) ANTES do merge do analyzer. Detector determinístico `detectYesNoText` (Lei 4,
  não regra-no-prompt) restrito por `intent` (exclui asking_question/expressing_doubt/
  off_topic/wants_more_options):
  - gate `lance-embutido`: texto sim/não seta `qualifyAnswers.lanceEmbutido` (mesmo shape do
    clique em route.ts) — `nextGate()` deixa de devolver "lance-embutido" pra sempre, mata o
    loop de card+educação.
  - gate `simulator-offer`: texto afirmativo dentro da janela (`simulatorOfferDispatched=true`,
    `decisionDispatched=false`, `simulatorOfferAnswered` ainda não true) dispara o MESMO
    directive do clique (`buildSimulatorDialDirective` + `computeMoneyAnchor`) em vez de cair
    direto no gate `decision`. Novo campo `simulatorOfferAnswered` (personas.ts) dá idempotência
    (não reabre o dial em turnos seguintes).
- `artifact-guard.ts`: nova regra `dial-dup-intraturn` consumindo `turnArtifactTypes` (já
  amparado pelo runner, `nenhuma regra atual consome` era comentário desatualizado) — suprime a
  2ª chamada de `present_contemplation_dial` no mesmo turno (a instrução "chame UMA vez" no
  directive é regra-no-prompt, sobrevivia; agora é invariante em código).
- Testes: `artifact-guard.test.ts` (regra dial-dup-intraturn, RED confirmado), 
  `index.fix-260-gates-texto-dial.integration.test.ts` (4 cenários: lance-embutido sim/não,
  simulator-offer sim/não — RED confirmado via `git stash` da implementação antes de reaplicar).
- `pnpm test:unit` verde (330 arquivos / 3130 testes) após a mudança; suíte ampla do
  orchestrator + regressão (897 testes) sem regressão.
