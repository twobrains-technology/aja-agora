---
id: FIX-254
titulo: "Educação de embutido + chips DUPLICADOS no mesmo turno (double-dispatch)"
status: todo
bloco: bloco-r4-cards-polish
arquivos: [src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 4 (Fable FINAL, N-C P2)
---
## Gap (veredito FINAL §N-C)
No clique lance="no", a educação + chips saem DUPLICADOS: o `pipeDirectiveTurn` já dispara o
gate via orchestrator E o `route.ts:1058-1072` chama `pipeGatePrompt` de novo.
## Correção
- Remover o double-dispatch: um único caminho emite a educação+gate (ou o directive, ou o
  pipeGatePrompt — não os dois).
## Regressão (TDD)
- clique lance="no" → educação+chips emitidos UMA vez (não 2).
