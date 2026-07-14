---
bloco: bloco-a-fallback-enlatado
branch: fix/fallback-enlatado-loop
workspace: fix-fallback-enlatado-loop
onda: 1
depends_on: []
paralelo_com: [bloco-b-reveal-web, bloco-c-whatsapp-invariantes]
itens: [FIX-332]
escopo_arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
conflitos_esperados: "nível 2 com bloco-b em orchestrator/index.ts e directives.ts (regiões diferentes: aqui o caminho de tool-error; lá o reveal/consent). Mergear ESTE bloco primeiro."
---
# Bloco A — o sintoma-mor (fallback enlatado em loop)

Item único, mas é o mais importante da onda: é a causa do "agente responde sempre a mesma
coisa" que o Kairo reportou, sobrevivendo num caminho que a cirurgia não mapeou. Bloco
sozinho porque toca o coração do orquestrador — quero o diff limpo e revisável.
