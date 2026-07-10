---
id: FIX-257
titulo: "P1: espiral de negação — tool input string→number falha silenciosa (output null)"
status: todo
bloco: bloco-r5-toolinput-rota
arquivos: [src/lib/agent/tools/ai-sdk.ts, src/lib/agent/tools/schemas.ts]
rodada: 2026-07-10 rodada 5 (Fable r4, P1 #1)
---
## Gap (veredito r4 §P1 #1)
O LLM manda `creditMin`/`creditMax` como STRING → `z.number()` estrito (`ai-sdk.ts:289-290`)
falha silenciosa (`output: null`), e `simulate_quota` com sentinela `__search_needed__` cujo
erro-guard ("PROIBIDO negar") o modelo IGNORA → agente NEGOU 3× ofertas exibidas na própria
tabela (BB, RODOBENS). Recovery REGREDIU vs r3. Lei: falha de tool tem que ser barulhenta, não null.
## Correção
- Coerce nos schemas Zod dos tool inputs numéricos: `z.coerce.number()` (aceita "92902" e 92902)
  pra creditMin/creditMax/creditValue/valor etc. — o LLM erra o tipo, o código conserta.
- Erro de tool BARULHENTO: se um input inválido escapa, retornar erro explícito que force
  re-tentativa/correção, nunca `output: null` silencioso que o modelo interpreta como "não existe".
- Rever o sentinela `__search_needed__` do simulate_quota: o guard tem que IMPEDIR a negação
  em código (não confiar no prompt).
## Regressão (TDD)
- creditMin/creditMax como string "92902" → coage pra 92902, tool roda (não null).
- input inválido → erro explícito (não output null silencioso).
