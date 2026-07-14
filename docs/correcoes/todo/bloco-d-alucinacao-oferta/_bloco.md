---
bloco: bloco-d-alucinacao-oferta
branch: fix/alucinacao-oferta
workspace: fix-alucinacao-oferta
onda: 1
depends_on: []
paralelo_com: [bloco-e-fallback-residual]
itens: [FIX-342]
escopo_arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/choose-offer.ts
conflitos_esperados: "nível 2 com bloco-e em sanitizer.ts/directives.ts (regiões diferentes). Mergear ESTE primeiro."
---
# Bloco D — alucinação de oferta (o defeito mais grave da campanha)

Item único, P0: o agente recomenda administradora que não existe. Bloco sozinho porque o diff
tem que ser cirúrgico e revisável.
