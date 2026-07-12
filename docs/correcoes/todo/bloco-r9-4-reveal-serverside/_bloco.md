---
bloco: bloco-r9-4-reveal-serverside
branch: fix/r9-4-reveal-serverside
workspace: fix-r9-4-reveal-serverside
onda: 1
depends_on: []
paralelo_com: [bloco-r9-4-bevi-degradacao, bloco-r9-4-valor-honestidade]
itens: [FIX-290]
escopo_arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
---
# Bloco r9-4 — reveal server-side (FIX-290, P0 sistêmico)

Item único, mas GRANDE de produto (Lei 1/4 do projeto — invariante crítico vira código, não
regra-no-prompt): o `comparison_table` é a única carta do reveal sem caminho de emissão
server-side garantida (`emitServerCard`, `index.ts:95-117`, cobre recommendation_card/
whatsapp_optin/scarcity/two_paths/decision_prompt/embedded_bid — não comparison_table). Fica
sozinho em vez de agrupado por ser o eixo da onda inteira e tocar 4 arquivos já não-triviais.

## ⚠️ Overlaps nível 2 (paralelo mesmo assim — conflito mecânico, resolução na ordem abaixo)

- **`src/lib/agent/orchestrator/recommendation-payload.ts`** × `bloco-r9-4-valor-honestidade`
  (FIX-292): este bloco mexe em `coerceComparisonPayload` (linhas ~236-259, força emissão/reuso);
  o outro mexe em `coerceRevealCota` (linhas ~82-148, corrige monthlyPayment). Regiões diferentes
  da mesma função-arquivo — `coerceComparisonPayload` CHAMA `coerceRevealCota` internamente, então
  há risco de ajuste de assinatura cruzado (ex.: se FIX-292 mudar o tipo de
  `knownCreditValueByGroupId` de `Map<string, number>` pra `Map<string, {creditValue,
  monthlyPayment}>`, os call-sites que este bloco toca em `coerceComparisonPayload` precisam
  acompanhar). **Ordem de merge: este bloco (reveal-serverside) PRIMEIRO**, `valor-honestidade`
  resolve o ajuste de tipo por cima.
- **`src/lib/agent/tools/ai-sdk.ts`** × `bloco-r9-4-bevi-degradacao` (FIX-291): este bloco mexe nas
  tools `present_comparison_table`/`present_recommendation_card` (linhas ~1148-1173); o outro mexe
  em `runDiscovery`/`search_groups`/`recommend_groups` (linhas ~1249-1360). Regiões bem separadas
  do arquivo — conflito esperado é só de adjacência/import, mecânico. **Ordem de merge: este
  bloco PRIMEIRO** (mesmo critério — é o P0 sistêmico, os outros dois ajustam por cima).

## Por que sozinho (não fundir com os outros 2)
É o P0 mais estrutural da onda (o padrão "card do reveal some" já matou 3 rodadas seguidas — Lei
1/4) e já tem escopo GRANDE (4 arquivos, 2 deles tocados por outros blocos). Fundir aumentaria o
risco de conflito real dentro da mesma sessão em vez de reduzir.
