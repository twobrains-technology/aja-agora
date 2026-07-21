---
bloco: bloco-funil-completo-langgraph
branch: feat/langgraph-runtime-funil-completo
workspace: feat-langgraph-runtime-funil-completo
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-359, FIX-360, FIX-361, FIX-362]
escopo_arquivos:
  - src/lib/agent/langgraph/
---
# Bloco funil completo — runtime LangGraph (Rodada 1)

Completa o cérebro do runtime LangGraph sobre a fundação já integrada (Rodada 0: flag+dispatcher,
provider, contrato estado/tool-adapter/14-eventos, walking skeleton `analyze→route→converse→
discovery→emitCard→persist`). Leia PRIMEIRO `.processo/loop/2026-07-20-1948-langgraph-runtime.md`
(goal doc) e o `.done/2026-07-20-bloco-fundacao-langgraph.md` (o que a fundação construiu + os
`TODO(rodada-1)` explícitos).

Ordem interna (cada item sobe sobre o anterior):
1. FIX-359 — streaming ao vivo (`graph.invoke` → `graph.stream` com `streamMode:["custom","values"]`).
2. FIX-360 — funil completo (nós rapport/experience/reco-consent/timeframe/lance*/simulator-offer + route).
3. FIX-361 — cards restantes + `evaluateArtifactGuards` + coerção completa (I3).
4. FIX-362 — WhatsApp validado + invariantes I3/I4/D6 + sondas de "não-engessar".

Bloco único e coeso: o grafo é UM módulo (`src/lib/agent/langgraph/`) — fragmentar em blocos
paralelos causaria conflito pesado em `graph.ts`/`route.ts`/`emit-card.ts`. Ownership de módulo
único = zero conflito. Prioriza uma jornada web COMPLETA que roda; gap honesto vira Rodada 2.
