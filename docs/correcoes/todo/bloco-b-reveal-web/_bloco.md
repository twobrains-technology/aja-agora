---
bloco: bloco-b-reveal-web
branch: fix/reveal-web-consent
workspace: fix-reveal-web-consent
onda: 1
depends_on: []
paralelo_com: [bloco-a-fallback-enlatado, bloco-c-whatsapp-invariantes]
itens: [FIX-333, FIX-334, FIX-335]
escopo_arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/system-prompt.ts
conflitos_esperados: "nível 2 com bloco-a (index.ts, directives.ts — regiões diferentes) e com bloco-c (system-prompt.ts). Mergear DEPOIS do bloco-a."
---
# Bloco B — o reveal na web (o que o usuário vê no momento da verdade)

Os 3 itens são do mesmo momento da jornada (pós-busca, antes da decisão) e tocam os mesmos
arquivos — um dev só, em ordem: FIX-333 (o mais grave) → 334 → 335.
