---
id: FIX-254
titulo: "Educação de embutido + chips DUPLICADOS no mesmo turno (double-dispatch)"
status: done
bloco: bloco-r4-cards-polish
arquivos:
  - src/app/api/chat/route.ts
  - src/lib/web/adapter.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/types.ts
rodada: 2026-07-10 rodada 4 (Fable FINAL, N-C P2)
executado_em: "2026-07-10"
nota: |
  Causa-raiz real (achada via TDD, não estava no card original): o
  double-dispatch NÃO é so no card lance="no" — o disparo automático de
  nextGateToFire (index.ts, mayEvaluateGates roda pra QUALQUER turno,
  isUserTurn true ou false) já reemitia gate+card sempre que um pipeDirectiveTurn
  batia num gate ativo. suppressGateEvent (novo campo em TurnInput) deixa o
  CHAMADOR (route.ts) decidir quando o disparo automático deve calar — usado
  nos 2 pontos de clique (lance="no"/"maybe" e lance-value) que já emitem
  card+gate explicitamente. Prova empírica: teste de integração falhava com
  2× embedded_bid emitido ANTES do suppressGate; 1× depois. Implementado
  JUNTO com FIX-253 (mesmo commit, mesma infra) — ver nota lá.
---
## Gap (veredito FINAL §N-C)
No clique lance="no", a educação + chips saem DUPLICADOS: o `pipeDirectiveTurn` já dispara o
gate via orchestrator E o `route.ts:1058-1072` chama `pipeGatePrompt` de novo.
## Correção
- Remover o double-dispatch: um único caminho emite a educação+gate (ou o directive, ou o
  pipeGatePrompt — não os dois).
## Regressão (TDD)
- clique lance="no" → educação+chips emitidos UMA vez (não 2).
