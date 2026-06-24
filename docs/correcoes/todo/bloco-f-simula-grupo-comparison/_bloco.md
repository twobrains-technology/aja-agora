---
bloco: bloco-f-simula-grupo-comparison
branch: fix/simula-grupo-comparison
workspace: fix-simula-grupo-comparison
onda: 2
depends_on: []
paralelo_com: []
itens: [FIX-71]
escopo_arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/system-prompt.ts
  - src/components/chat/artifacts/comparison-table.tsx
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "Os blocos a/b/c (onda 1) estão PARADOS e NÃO são lançados — sem conflito ativo. (bloco-a tocaria system-prompt/ai-sdk, mas não roda agora.)"
ordem_merge: "Bloco único da onda 2. Merge limpo na develop."
# Onda 2 = isolamento dos a/b/c (onda 1, parados). Bloco único; merge-back autônomo na develop.
---
# Bloco F — Simular grupo escolhido da comparison_table (id fabricado)

Bug irmão do FIX-68, achado no smoke ao vivo da jornada (2026-06-23). O FIX-68
destravou a re-busca por troca de VALOR (validado ao vivo, 2 trocas). Este cobre o
caminho que sobrou: **escolher um grupo específico** de uma comparison_table/card e
o agent fabricar o groupId (`bb-auto-200k-72m`) em vez de usar o quotaId real →
`simulate_quota` falha.

- **FIX-71** — expor o quotaId real nos cards (comparison_table/recommendation_card)
  e/ou resolver a escolha server-side, + reforço no prompt pra simular pelo id LITERAL
  do grupo escolhido. Nunca fabricar id.

Bug de comportamento do agent → 3 camadas de regressão OBRIGATÓRIAS. TDD strict.
