---
bloco: bloco-f-turno-vazio-meta
branch: fix/turno-vazio-meta-narrativa
workspace: fix-turno-vazio-meta-narrativa
onda: 1
depends_on: []
paralelo_com: [bloco-g-consent-wa-fallback]
itens: [FIX-347, FIX-348]
escopo_arquivos:
  - src/lib/chat/empty-turn-guard.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/directives.ts
conflitos_esperados: "nível 2 com bloco-g em sanitizer.ts/directives.ts (regiões diferentes). Mergear ESTE primeiro."
---
# Bloco F — o turno que esvazia e a narração de pipeline

Os dois itens têm a MESMA raiz provável: os guards do sanitizer comem demais (esvaziando o turno)
e o directive faz o modelo narrar a sequência. Ordem: FIX-347 → FIX-348.
