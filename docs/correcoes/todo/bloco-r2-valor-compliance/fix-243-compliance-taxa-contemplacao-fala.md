---
id: FIX-243
titulo: "Agente vende com 'boa taxa de contemplação' (campo proibido) na FALA"
status: todo
bloco: bloco-r2-valor-compliance
arquivos: [src/lib/agent/orchestrator/sanitizer.ts, src/lib/agent/system-prompt.ts, src/lib/agent/HARD_RULES.md, src/lib/agent/hard-rules.ts]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P1 #7)
---

## Gap (veredito Fable §D5.2, gap #7)
Texto do agente (B2 T5): "A ITAÚ se destaca pela **boa taxa de contemplação** e uma taxa de
administração de 13,46% — uma das mais baixas da faixa". `taxaContemplacao` é PROIBIDO (semântica
não documentada, spec 05). O guard cobre payload/UI, mas o TEXTO do LLM vaza o conceito como
argumento de venda; "uma das mais baixas da faixa" é claim comparativo sem fonte exibida.

## Correção
- `sanitizer.ts`: padrão que dropa/reescreve "taxa de contemplação" (e variações) na fala do agente.
- `system-prompt.ts` + `HARD_RULES.md`: proibir explicitamente o termo "taxa de contemplação" na
  fala; a fonte permitida de sinal de contemplação é contemplados/mês (contagem real). Proibir claim
  comparativo de taxa sem o número/fonte na tela (já há regra pra taxa adm — estender).
- Sincronizar HARD_RULES.md ↔ hard-rules.ts (teste de paridade).

## Regressão (TDD)
- sanitizer dropa "boa taxa de contemplação" na fala (teste que falha antes).
- paridade HARD_RULES mantida.
