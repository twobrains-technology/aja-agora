---
bloco: bloco-r9-3-consistencia-valor
branch: fix/r9-3-consistencia-valor
workspace: fix-r9-3-consistencia-valor
onda: 1
depends_on: []
paralelo_com: [bloco-r9-3-reveal-guard, bloco-r9-3-latencia-percebida]
itens: [FIX-287]
escopo_arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/adapters/bevi/offer-mapper.ts
conflitos_esperados:
  - arquivo: src/lib/agent/tools/ai-sdk.ts
    regiao: "present_comparison_table/present_simulation_result (~1131-1171) — DISTINTA da região recommend_groups (~1320-1331) tocada por bloco-r9-3-latencia-percebida/FIX-289"
    ordem_de_merge: "mergear ESTE bloco (consistencia-valor) PRIMEIRO; bloco-r9-3-latencia-percebida mergeia depois e resolve qualquer deslocamento de linha residual (git 3-way deve auto-resolver — regiões não se sobrepõem, só compartilham o arquivo)"
---
# Bloco r9-3 — consistência de valor (P1, FIX-287)

Item único (P1 — Cálculo 6/10 no veredito r9pos2). `comparison_table` e `simulation_result` do
MESMO `groupId`, no MESMO turno, mostram `creditValue` divergente (120k vs 160k) sem aviso —
raiz provada: `present_comparison_table`/`present_simulation_result` (`ai-sdk.ts:1131-1171`) são
preenchidos por args da LLM sem reescrita server-side confiável, e o `creditAdjustmentNotice`
que `executeSimulateQuota` já calcula (`ai-sdk.ts:441-467`, FIX-255) nunca retroage pro
`comparison_table` emitido antes.

**⚠️ Overlap nível 2 (declarado, paralelo mesmo assim):** este bloco e `bloco-r9-3-latencia-
percebida` (FIX-289) tocam AMBOS `src/lib/agent/tools/ai-sdk.ts` — mas em regiões de código
totalmente distintas (`present_comparison_table`/`present_simulation_result` ~1131-1171 aqui vs
`recommend_groups`/`executeRecommendGroups` ~503-521/1320-1331 lá). Resolução mecânica esperada
via 3-way merge (git resolve sozinho, sem conflito textual real). **Ordem de merge:** este bloco
primeiro, `bloco-r9-3-latencia-percebida` depois — se o auto-merge não bastar (deslocamento de
linha grande), quem mergeia por último resolve manualmente contra a versão já integrada deste
bloco.
