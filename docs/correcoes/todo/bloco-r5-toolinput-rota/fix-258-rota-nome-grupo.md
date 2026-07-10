---
id: FIX-258
titulo: "Rota determinística nome/valor de administradora → grupo exibido (FIX-252 não saiu)"
status: todo
bloco: bloco-r5-toolinput-rota
arquivos: [src/lib/agent/orchestrator/choose-offer.ts, src/lib/agent/orchestrator/analyze.ts]
rodada: 2026-07-10 rodada 5 (Fable r4, FIX-252 NÃO feito)
---
## Gap (veredito r4: FIX-252 NÃO)
A rota determinística nome/valor→grupo exibido continua inexistente. O usuário nomeia "a ITAÚ"/
"a de 92 mil" (visível na comparison_table) e o LLM adivinha/erra o grupo, alimentando a espiral.
## Correção
- ANTES de deixar o LLM chamar tool, resolver determinístico: nome-de-administradora OU valor que
  casa com um grupo JÁ EXIBIDO (shown-groups) → groupId certo (ancora sobre entidade em tela,
  action-policy). Não depender do LLM.
## Regressão (TDD)
- "quero a ITAÚ" com ITAÚ exibida → resolve o groupId da ITAÚ.
- "a de 92 mil" → grupo 92.902 (não 100k).
