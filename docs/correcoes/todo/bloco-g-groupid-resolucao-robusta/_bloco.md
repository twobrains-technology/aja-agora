---
bloco: bloco-g-groupid-resolucao-robusta
branch: fix/groupid-resolucao-robusta
workspace: fix-groupid-resolucao-robusta
onda: 2
depends_on: []
paralelo_com: []
itens: [FIX-72]
escopo_arquivos:
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/system-prompt.ts
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "a/b/c (onda 1) parados, não lançados. FIX-68/71 já mergeados na develop (sem conflito)."
ordem_merge: "Bloco único da onda 2. Merge limpo na develop."
# Onda 2 = isolamento dos a/b/c. Achado pelo qa-noturno: FIX-71 foi parcial.
---
# Bloco G — Resolução ROBUSTA de groupId (a raiz da fabricação de id)

Achado pelo qa-noturno (2026-06-24) revalidando o FIX-71 ao vivo: o FIX-71 fechou o
caminho "escolher grupo da comparison" (cassette verde), mas a **raiz persiste** — a LLM
fabrica groupId em tools irmãs sempre que não tem o quotaId real à mão.

- **FIX-72** — correção de RAIZ (não tapar mais um caminho): QUALQUER tool que recebe
  `groupId` (simulate_quota, get_group_details, …) deixa de depender da LLM copiar o hex.
  Resolver server-side / rejeitar id fora do conjunto com erro estruturado que força
  re-busca (o FIX-68 já permite), pra acabar com `auto-180k`, `bb-auto-200k-72m`,
  `auto-180k-kairo` de uma vez.

Bug de comportamento do agent → 3 camadas de regressão. TDD strict.
