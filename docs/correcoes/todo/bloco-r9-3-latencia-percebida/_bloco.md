---
bloco: bloco-r9-3-latencia-percebida
branch: fix/r9-3-latencia-percebida
workspace: fix-r9-3-latencia-percebida
onda: 1
depends_on: []
paralelo_com: [bloco-r9-3-reveal-guard, bloco-r9-3-consistencia-valor]
itens: [FIX-288, FIX-289]
escopo_arquivos:
  - src/components/chat/streaming-dots.tsx
  - src/components/chat/chat-message.tsx
  - src/lib/agent/recommendation.ts
  - src/lib/agent/tools/ai-sdk.ts
conflitos_esperados:
  - arquivo: src/lib/agent/tools/ai-sdk.ts
    regiao: "recommend_groups/executeRecommendGroups (~503-521/1320-1331) — DISTINTA da região present_comparison_table/present_simulation_result (~1131-1171) tocada por bloco-r9-3-consistencia-valor/FIX-287"
    ordem_de_merge: "mergear bloco-r9-3-consistencia-valor PRIMEIRO; ESTE bloco mergeia depois e resolve qualquer deslocamento de linha residual (git 3-way deve auto-resolver — regiões não se sobrepõem, só compartilham o arquivo)"
---
# Bloco r9-3 — latência percebida (P2/P3, FIX-288 + FIX-289)

2 itens do mesmo tema (latência do reveal, ~59-64s, G-E/P3-6 do veredito r9pos2) — pacote de 1
sessão, ordem interna: **FIX-288 primeiro (frontend, isolado, sem dependência), FIX-289 depois
(backend)**. Não há dependência real entre os dois — são disjuntos (componentes React vs
tools/agent) — mas ficam no MESMO bloco por afinidade temática (ambos mitigam a mesma percepção
de latência, "~3 sessões por onda" da skill).

**⚠️ PENDENTE-KAIRO fora de escopo deste bloco:** paralelizar as 2 chamadas reais à Bevi
(`search_groups`/`recommend_groups`/`simulate_quota` concorrentes) NÃO está autorizado — exige
confirmar com Bevi/AGX se um PATCH concorrente na mesma proposta é seguro (o adapter assume
sequencial hoje, `bevi-self-contract-adapter.ts`). FIX-289 é só dedupe de uma rebusca redundante
dentro do fluxo sequencial já existente — não muda a ordem/concorrência das chamadas reais.

**⚠️ Overlap nível 2 (declarado, paralelo mesmo assim):** FIX-289 toca
`src/lib/agent/tools/ai-sdk.ts` na região `recommend_groups`/`executeRecommendGroups`
(~503-521/1320-1331). Um OUTRO bloco da mesma onda (`bloco-r9-3-consistencia-valor`, FIX-287)
toca `present_comparison_table`/`present_simulation_result` (~1131-1171) no MESMO arquivo —
regiões distintas. **Ordem de merge:** `bloco-r9-3-consistencia-valor` primeiro, este bloco
depois — se o auto-merge não bastar, quem mergeia por último (este bloco) resolve manualmente
contra a versão já integrada do outro.
