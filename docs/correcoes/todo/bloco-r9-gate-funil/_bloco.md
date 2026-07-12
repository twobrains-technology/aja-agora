---
bloco: bloco-r9-gate-funil
branch: fix/r9-gate-funil
workspace: fix-r9-gate-funil
onda: 1
depends_on: []
paralelo_com: [bloco-r9-compliance-copy]
itens: [FIX-279, FIX-280]
escopo_arquivos:
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/orchestrator/whatsapp-optin-guard.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/system-prompt.ts
---
# Bloco r9 gate-funil (veredito baseline Sonnet, 3/10)

Os 2 itens deste bloco são as duas divergências de **ordem/determinismo do funil** que
derrubaram a nota Funcional (5/10) no baseline r9 — ambos no mesmo eixo (gates que deveriam
disparar de forma determinística e não estão):

- **FIX-279** (P1, prioritário) — o gate `credit` (agulha do valor do bem, P4 do canônico,
  marcado ✅ resolvido) **nunca aparece** em 5/5 dossiês: o `turn-analyzer`/`analyze.ts`
  preenche `creditMax` a partir do turno de `desire` (texto livre), sem o guard de
  `activeGateAtTurnStart` que o FIX-236 já aplicou pro campo irmão `hasLance`. Consequência:
  quando o roteiro reafirma o valor esperando o gate, vira "ajuste" com promessa quebrada
  (madalena t7).
- **FIX-280** (P1, secundário) — `present_whatsapp_optin` dispara em mario-sem-lance e não em
  madalena no mesmo ponto do funil, porque a tool continua sendo uma emissão LLM-discricionária
  (nunca migrada pra server-side como os cards vizinhos `embedded_bid`/`two_paths`/`scarcity`/
  `present_decision_prompt`, FIX-246/253).

**Nota sobre `escopo_arquivos`:** o pedido original desta rodada listava só
`qualify-state.ts`/`turn-analyzer.ts`/`whatsapp-optin-guard.ts`/`tool-policy.ts`. A
investigação provou que o merge que causa o FIX-279 vive de fato em
`src/lib/agent/orchestrator/analyze.ts` (função `analyzeAndMerge`, linha 94) — adicionado
ao escopo. `qualify-state.ts`/`turn-analyzer.ts` seguem como leitura de contexto (gate e
schema de extração), não como alvo principal do fix. `system-prompt.ts` foi adicionado por
FIX-280 (a seção dinâmica `whatsappOptinSection`) — **overlap textual (nível 2)** com o
`system-prompt.ts` do outro bloco: FIX-277 mexe perto de "Valores monetários — NUNCA
arredonde" (linha ~585-596); FIX-280, se optar pela migração server-side, só precisa
REMOVER a seção `whatsappOptinSection`/reduzir a instrução de prompt (região distinta,
linhas ~890-919). Regiões diferentes do mesmo arquivo — paralelo mesmo assim.

Ordem interna: **FIX-279 primeiro** (root cause mais claro, correção isolada em
`analyze.ts`) → **FIX-280 depois** (decisão de design maior — migração server-side vs.
aceitar como intencional, ver alternativa no card).

## conflitos_esperados
- `system-prompt.ts`: nível 2 com `bloco-r9-compliance-copy` (FIX-277 adiciona seção perto de
  "Valores monetários"; FIX-280, se migrar `whatsapp_optin` pra server-side, mexe na seção
  `whatsappOptinSection` mais abaixo no arquivo). Regiões diferentes — sem conflito de linha
  esperado; se o merge apontar conflito mecânico, resolver mantendo as duas edições (nenhuma
  invalida a outra). Ordem de merge recomendada: **bloco-r9-compliance-copy primeiro**, depois
  `bloco-r9-gate-funil` (o segundo resolve o merge trivial).
